import * as auth from './auth.ts';
import * as types from './types.ts';

class Deferred<T> {
  #resolve: ((msg: T) => void) | null;
  #reject: ((cause: any) => void) | null;
  promise: Promise<T>;
  #pending: null | { type: 'resolve', value: T } | { type: 'reject', value: any };

  constructor() {
    const that = this;
    this.#resolve = null;
    this.#reject = null;
    this.#pending = null;
    this.promise = new Promise((resolve, reject) => {
      if (that.#pending) {
        switch (that.#pending.type) {
          case 'resolve':
            return resolve(that.#pending.value);
          case 'reject':
            return reject(that.#pending.value);
        }
      }
      that.#resolve = resolve;
      that.#reject = reject;
    });
  }

  resolve(msg: T) {
    if (!this.#resolve) {
      this.#pending = { type: 'resolve', value: msg };
      return;
    }
    this.#resolve(msg);
  }

  reject(cause: any) {
    if (!this.#reject) {
      this.#pending = { type: 'reject', value: cause };
      return;
    }
    this.#reject(cause);
  }
}

async function loop(waiters: Map<number, Deferred<unknown>>, readable: ReadableStreamBYOBReader): Promise<never> {
  const tyendian = types.byte();

  while (true) {
    const endian = await tyendian.unmarshall(types.LITTLE_ENDIAN, readable);
    console.log(endian);
    throw new Error('not implemented.');
  }
}

export class Client {
  #guid: Uint8Array;
  #writable: WritableStream<Uint8Array>;
  #waiters: Map<number, Deferred<unknown>>;
  #loopError: Promise<never>;

  static async connect(addr: string): Promise<Client> {
    const a = parseAddress(addr);
    const [w, r] = await connect(a);

    const writer = w.getWriter();
    try {
      const reader = r.getReader({ mode: 'byob' });

      await writer.write(Uint8Array.of(0));
      const uid = '1000'; // FIXME
      await auth.send({ command: 'AUTH', mechanism: 'EXTERNAL', initialResponse: uid }, writer);
      const maybeOk = await auth.recv(reader);
      if (maybeOk.command !== 'OK') {
        throw new Error();
      }
      const guid = maybeOk.guid;

      await auth.send({ command: 'NEGOTIATE_UNIX_FD' }, writer);
      const msg = await auth.recv(reader);
      if (msg.command !== 'AGREE_UNIX_FD') {
        throw new Error();
      }

      const waiters = new Map();
      const loopError = loop(waiters, reader);
      return new Client(w, waiters, loopError, guid);
    } finally {
      writer.releaseLock();
    }
  }

  constructor(w: WritableStream<Uint8Array>, waiters: Map<number, Deferred<unknown>>, loopError: Promise<never>, guid: Uint8Array) {
    this.#writable = w;
    this.#guid = guid;
    this.#waiters = waiters;
    this.#loopError = loopError;
  }
}

type UnixAddress = { type: 'unix' } & ({ path: string } | { abstract: string }) & Record<string, string>;

type Address = UnixAddress;

function parseUnixAddress(rest: string): UnixAddress {
  const keyval = rest.split(",").map(v => v.split('=')).reduce((o, [k, v]) => ({[k]: v, ...o}), {});
  if (!("path" in keyval) && !("abstract" in keyval)) {
    throw new Error();
  }
  if ("path" in keyval && "abstract" in keyval) {
    throw new Error();
  }
  return { type: 'unix', ...keyval } as UnixAddress;
}

function parseAddress(addr: string): Address {
  const [prefix, rest] = addr.split(':', 2);
  switch (prefix) {
    case "unix": return parseUnixAddress(rest);
    default: throw new Error();
  }
}

async function connectUnix(addr: UnixAddress): Promise<[WritableStream<Uint8Array>, ReadableStream<Uint8Array>]> {
  const path = addr.path ? addr.path : `\0${addr.abstract}`;
  const conn = await Deno.connect({ transport: 'unix', path, });

  const w = new WritableStream({
    async write(chunk) {
      await conn.write(chunk);
    },
  });
  const r = new ReadableStream({
    async pull(controller) {
      if (controller.byobRequest && controller.byobRequest.view) {
        const n = await conn.read(new Uint8Array(controller.byobRequest.view.buffer));
        if (n === null) {
          controller.close();
        } else {
          controller.byobRequest.respond(n);
        }
        return;
      }

      const buf = new Uint8Array(512);
      const n = await conn.read(buf);
      if (n === null) {
        controller.close();
      } else {
        controller.enqueue(buf.subarray(0, n));
      }
    },
    type: 'bytes',
  });

  return [w, r];
}

async function connect(addr: Address): Promise<[WritableStream<Uint8Array>, ReadableStream<Uint8Array>]> {
  switch (addr.type) {
    case "unix": return connectUnix(addr);
    default: throw new Error('not implemented');
  }
}
