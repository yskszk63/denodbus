import * as auth from "./auth.ts";
import * as types from "./types.ts";
import { getuid } from "./getuid.ts";
import { Message } from "./message.ts";
import * as m from "./message.ts";
import { LITTLE_ENDIAN } from "./endian.ts";

class Deferred<T> {
  #resolve: ((msg: T) => void) | null;
  #reject: ((cause: any) => void) | null;
  promise: Promise<T>;
  #pending: null | { type: "resolve"; value: T } | {
    type: "reject";
    value: any;
  };

  constructor() {
    const that = this;
    this.#resolve = null;
    this.#reject = null;
    this.#pending = null;
    this.promise = new Promise((resolve, reject) => {
      if (that.#pending) {
        switch (that.#pending.type) {
          case "resolve":
            return resolve(that.#pending.value);
          case "reject":
            return reject(that.#pending.value);
        }
      }
      that.#resolve = resolve;
      that.#reject = reject;
    });
  }

  resolve(msg: T) {
    if (!this.#resolve) {
      this.#pending = { type: "resolve", value: msg };
      return;
    }
    this.#resolve(msg);
  }

  reject(cause: any) {
    if (!this.#reject) {
      this.#pending = { type: "reject", value: cause };
      return;
    }
    this.#reject(cause);
  }
}

async function loop(
  waiters: Map<number, Deferred<Message>>,
  stream: ReadableStream,
): Promise<never> {
  while (true) {
    try {
      const message = await Message.unmarshall(stream);

      // TODO if method_return
      const replySerial = message.headers.get(m.REPLY_SERIAL);
      if (replySerial && typeof replySerial.value === "number") {
        const deferred = waiters.get(replySerial.value);
        waiters.delete(replySerial.value);
        deferred?.resolve(message);
      }
      console.log("*", message);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export class Client {
  #guid: Uint8Array;
  #writable: WritableStream<Uint8Array>;
  #waiters: Map<number, Deferred<Message>>;
  #loopError: Promise<never>;
  #serial: number;

  static async connect(addr: string): Promise<Client> {
    const a = parseAddress(addr);
    const [w, r] = await connect(a);

    let guid;
    const writer = w.getWriter();
    try {
      const reader = r.getReader({ mode: "byob" });
      try {
        await writer.write(Uint8Array.of(0));
        const uid = String(getuid());
        await auth.send({
          command: "AUTH",
          mechanism: "EXTERNAL",
          initialResponse: uid,
        }, writer);
        const maybeOk = await auth.recv(reader);
        if (maybeOk.command !== "OK") {
          throw new Error(JSON.stringify(maybeOk));
        }
        guid = maybeOk.guid;

        await auth.send({ command: "NEGOTIATE_UNIX_FD" }, writer);
        const msg = await auth.recv(reader);
        if (msg.command !== "AGREE_UNIX_FD") {
          throw new Error();
        }

        await auth.send({ command: "BEGIN" }, writer);
      } finally {
        reader.releaseLock();
      }
    } finally {
      writer.releaseLock();
    }

    const waiters = new Map();
    const loopError = loop(waiters, r);
    const client = new Client(w, waiters, loopError, guid);
    const reply = await client.request(
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus",
      "org.freedesktop.DBus",
      "Hello",
      [],
    );
    console.log(reply); // TODO check
    return client;
  }

  constructor(
    w: WritableStream<Uint8Array>,
    waiters: Map<number, Deferred<Message>>,
    loopError: Promise<never>,
    guid: Uint8Array,
  ) {
    this.#writable = w;
    this.#guid = guid;
    this.#waiters = waiters;
    this.#loopError = loopError;
    this.#serial = 1;
  }

  async request(
    path: string,
    destination: string,
    iface: string,
    member: string,
    val: types.Variant<any>[],
  ): Promise<void> {
    const serial = this.#serial++;
    const deferred = new Deferred<Message>();
    this.#waiters.set(serial, deferred);

    const message = new Message(
      LITTLE_ENDIAN,
      m.METHOD_CALL,
      new Set(),
      1,
      serial,
      new Map([
        [m.PATH, new types.Variant(types.objectPath(), path)],
        [m.DESTINATION, new types.Variant(types.string(), destination)],
        [m.INTERFACE, new types.Variant(types.string(), iface)],
        [m.MEMBER, new types.Variant(types.string(), member)],
      ]),
      val,
    );
    await message.marshall(this.#writable);
    const reply = await deferred.promise;
    console.log(reply);
  }
}

type UnixAddress =
  & { type: "unix" }
  & ({ path: string } | { abstract: string })
  & Record<string, string>;

type Address = UnixAddress;

function parseUnixAddress(rest: string): UnixAddress {
  const keyval = rest.split(",").map((v) => v.split("=")).reduce(
    (o, [k, v]) => ({ [k]: v, ...o }),
    {},
  );
  if (!("path" in keyval) && !("abstract" in keyval)) {
    throw new Error();
  }
  if ("path" in keyval && "abstract" in keyval) {
    throw new Error();
  }
  return { type: "unix", ...keyval } as UnixAddress;
}

function parseAddress(addr: string): Address {
  const [prefix, rest] = addr.split(":", 2);
  switch (prefix) {
    case "unix":
      return parseUnixAddress(rest);
    default:
      throw new Error();
  }
}

async function connectUnix(
  addr: UnixAddress,
): Promise<[WritableStream<Uint8Array>, ReadableStream<Uint8Array>]> {
  const path = addr.path ? addr.path : `\0${addr.abstract}`;
  const conn = await Deno.connect({ transport: "unix", path });

  const w = new WritableStream<Uint8Array>({
    async write(chunk) {
      while (chunk.length) {
        const n = await conn.write(chunk);
        chunk = chunk.subarray(n);
      }
    },
  });
  const r = new ReadableStream({
    async pull(controller) {
      if (controller.byobRequest?.view) {
        const view = controller.byobRequest.view;
        const n = await conn.read(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
        );
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
    type: "bytes",
  });

  return [w, r];
}

async function connect(
  addr: Address,
): Promise<[WritableStream<Uint8Array>, ReadableStream<Uint8Array>]> {
  switch (addr.type) {
    case "unix":
      return connectUnix(addr);
    default:
      throw new Error("not implemented");
  }
}
