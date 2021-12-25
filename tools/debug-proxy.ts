#!/usr/bin/env -S deno run --unstable --allow-read --allow-write --allow-env

const destBus = Deno.env.get('DBUS_SESSION_BUS_ADDRESS');
if (!destBus) {
  throw new Error('no DBUS_SESSION_BUS_ADDRESS.');
}
const bus = '/tmp/7b5301bb-adc4-4a16-bf47-acc1e42367cf';
console.log(`unix:abstract=${bus}`, '->', destBus);

function connect(bus: string): Promise<Deno.Conn> {
  const [type, rest] = bus.split('=', 2);
  if (!type || !rest) {
    throw new Error();
  }
  switch (type) {
    case 'unix:abstract': return Deno.connect({ transport: 'unix', path: '\0' + rest.split(',')[0]});
    default: throw new Error(type);
  }
}

function stream(conn: Deno.Conn): [ReadableStream<Uint8Array>, WritableStream<Uint8Array>] {
  const r = new ReadableStream({
    async pull(controller) {
      if (controller.byobRequest && controller.byobRequest.view) {
        const view = controller.byobRequest.view;
        const n = await conn.read(new Uint8Array(view.buffer));
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
        return;
      }
      controller.enqueue(buf.subarray(0, n));
    },
    type: 'bytes',
  });

  const w = new WritableStream({
    async write(chunk): Promise<void> {
      await conn.write(chunk);
    },
    async close() {
      await conn.closeWrite();
    },
  });

  return [r, w];
}

function hex(v: number): string {
  const s = v.toString(16);
  return s.length === 1 ? '0' + s : s;
}

function dump(prefix: string): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream({
    transform(chunk, controller) {
      console.log(" ", prefix, Array.from(chunk, hex).join(' '));
      console.log("#", prefix, JSON.stringify(new TextDecoder().decode(chunk)));
      controller.enqueue(chunk);
    }
  });
}

const listener = Deno.listen({ transport: 'unix', path: '\0' + bus });
for await (const connection of listener) {
  (async () => {
    try {
      const original = await connect(destBus);
      try {
        const [r1, w1] = stream(connection);
        const [r2, w2] = stream(original);
        await Promise.all([
          r1.pipeThrough(dump('C>S')).pipeTo(w2),
          r2.pipeThrough(dump('S>C')).pipeTo(w1),
        ]);
      } finally {
        original.close();
      }
    } finally {
      connection.close();
    }
  })();
}
