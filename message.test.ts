import { assertEquals } from "https://deno.land/std@0.118.0/testing/asserts.ts";

import { LITTLE_ENDIAN } from "./endian.ts";
import { Message } from "./message.ts";
import * as m from "./message.ts";
import * as t from "./types.ts";

// TODO module
function memStream(
  mem: Uint8Array[],
): [ReadableStream<Uint8Array>, WritableStream<Uint8Array>] {
  const r = new ReadableStream({
    pull(controller) {
      while (mem.length && mem[0].length === 0) {
        mem.shift();
      }

      if (!mem.length) {
        controller.close();
      } else if (controller.byobRequest && controller.byobRequest.view) {
        const view = controller.byobRequest.view;
        const n = Math.min(view.byteLength, mem[0].byteLength);
        const m = mem[0].subarray(0, n);
        mem[0] = mem[0].subarray(n);
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(m);
        controller.byobRequest.respond(n);
      } else {
        const chunk = mem.shift();
        controller.enqueue(chunk!);
      }
    },
    type: "bytes",
  });

  const w = new WritableStream({
    write(chunk) {
      mem.push(chunk);
    },
  });

  return [r, w];
}

Deno.test("marshall", async () => {
  const mem = [] as Uint8Array[];
  const [r, w] = memStream(mem);

  const message = new Message(
    LITTLE_ENDIAN,
    m.METHOD_CALL,
    new Set(),
    1,
    1,
    new Map([
      [m.PATH, new t.Variant(t.objectPath(), "/org/freedesktop/DBus")],
      [m.DESTINATION, new t.Variant(t.string(), "org.freedesktop.DBus")],
      [m.INTERFACE, new t.Variant(t.string(), "org.freedesktop.DBus")],
      [m.MEMBER, new t.Variant(t.string(), "Hello")],
    ]),
    [],
  );
  await message.marshall(w);

  const expect = [
    0x6c,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x6e,
    0x00,
    0x00,
    0x00,
    0x01,
    0x01,
    0x6f,
    0x00,
    0x15,
    0x00,
    0x00,
    0x00,
    0x2f,
    0x6f,
    0x72,
    0x67,
    0x2f,
    0x66,
    0x72,
    0x65,
    0x65,
    0x64,
    0x65,
    0x73,
    0x6b,
    0x74,
    0x6f,
    0x70,
    0x2f,
    0x44,
    0x42,
    0x75,
    0x73,
    0x00,
    0x00,
    0x00,
    0x06,
    0x01,
    0x73,
    0x00,
    0x14,
    0x00,
    0x00,
    0x00,
    0x6f,
    0x72,
    0x67,
    0x2e,
    0x66,
    0x72,
    0x65,
    0x65,
    0x64,
    0x65,
    0x73,
    0x6b,
    0x74,
    0x6f,
    0x70,
    0x2e,
    0x44,
    0x42,
    0x75,
    0x73,
    0x00,
    0x00,
    0x00,
    0x00,
    0x02,
    0x01,
    0x73,
    0x00,
    0x14,
    0x00,
    0x00,
    0x00,
    0x6f,
    0x72,
    0x67,
    0x2e,
    0x66,
    0x72,
    0x65,
    0x65,
    0x64,
    0x65,
    0x73,
    0x6b,
    0x74,
    0x6f,
    0x70,
    0x2e,
    0x44,
    0x42,
    0x75,
    0x73,
    0x00,
    0x00,
    0x00,
    0x00,
    0x03,
    0x01,
    0x73,
    0x00,
    0x05,
    0x00,
    0x00,
    0x00,
    0x48,
    0x65,
    0x6c,
    0x6c,
    0x6f,
    0x00,
    0x00,
    0x00,
  ];
  assertEquals(expect, mem.flatMap((v) => Array.from(v)));

  const result = await Message.unmarshall(r);
  console.log(result);
  // TODO assert
});
