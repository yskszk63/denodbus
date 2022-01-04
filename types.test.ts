// TODO check overflow
import { assertEquals } from "https://deno.land/std@0.118.0/testing/asserts.ts";

import * as t from "./types.ts";

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

Deno.test("byte", async () => {
  const ty = t.byte();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0, 1, 192, 255]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("boolean", async () => {
  const ty = t.boolean();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [true, false]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("int16", async () => {
  const ty = t.int16();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0, 1, 32, 512, -512, 0x7FFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("uint16", async () => {
  const ty = t.uint16();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0, 1, 32, 512, 0x7FFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("int32", async () => {
  const ty = t.int32();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0, 1, 32, 512, -512, 0x7FFF_FFFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("uint32", async () => {
  const ty = t.uint32();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0, 1, 32, 512, 0xFFFF_FFFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("int64", async () => {
  const ty = t.int64();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0n, 1n, 32n, 512n, -512n, 0x7FFF_FFFF_FFFF_FFFFn]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("uint64", async () => {
  const ty = t.uint64();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0n, 1n, 32n, 512n, 0x7FFF_FFFF_FFFF_FFFFn]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("double", async () => {
  const ty = t.double();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0.1, 0.3]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("string", async () => {
  const ty = t.string();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of ["", "Hello, World!"]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("object_path", async () => {
  const ty = t.objectPath();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of ["/obj/path"]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("signature", async () => {
  const ty = t.signature();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of ["i", "b"]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("unix_fd", async () => {
  const ty = t.unixFd();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [0, 1, 32, 512, 0xFFFF_FFFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("variant", async () => {
  const ty = t.variant();

  for (const endian of [t.BIG_ENDIAN, t.LITTLE_ENDIAN] as t.Endian[]) {
    for (const v of [[t.byte(), 2]] as [t.DbusType<any>, any][]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(endian, v, w.getWriter());
      const unmarshalled = await ty.unmarshall(
        endian,
        r.getReader({ mode: "byob" }),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("signature", () => {
  const tests = [
    ["y", t.byte()],
    ["b", t.boolean()],
    ["n", t.int16()],
    ["q", t.uint16()],
    ["i", t.int32()],
    ["u", t.uint32()],
    ["x", t.int64()],
    ["t", t.uint64()],
    ["d", t.double()],
    ["s", t.string()],
    ["o", t.objectPath()],
    ["g", t.signature()],
    ["h", t.unixFd()],
    ["ay", t.array(t.byte())],
    ["(bnq)", t.struct([t.boolean(), t.int16(), t.uint16()])],
    ["a{yv}", t.array(t.dictEntry(t.byte(), t.variant()))],
  ] as [string, t.DbusType<any>][];

  for (const [expect, target] of tests) {
    assertEquals(expect, target.signature());
  }
});

Deno.test("signature2", () => {
  const tests = [
    "y",
    "b",
    "n",
    "q",
    "i",
    "u",
    "x",
    "t",
    "d",
    "s",
    "o",
    "g",
    "h",
    "ay",
    "(bnq)",
    "a{yv}",
  ];

  for (const sig of tests) {
    const ty = t.parseSignature(sig);
    assertEquals(sig, ty.signature());
  }
});

Deno.test("message", async () => {
  const mem: Uint8Array[] = [];
  const [r, w] = memStream(mem);

  const writer = w.getWriter();
  const reader = r.getReader({ mode: "byob" });

  await t.marshall(
    t.LITTLE_ENDIAN,
    [
      t.byte(),
      t.byte(),
      t.byte(),
      t.byte(),
      t.uint32(),
      t.uint32(),
      t.array(t.struct([t.byte(), t.variant()])),
    ],
    [0x6c, 0x01, 0x00, 0x01, 0x00, 0x01, [
      [0x01, [t.objectPath(), "/org/freedesktop/DBus"]],
      [0x06, [t.string(), "org.freedesktop.DBus"]],
      [0x02, [t.string(), "org.freedesktop.DBus"]],
      [0x03, [t.string(), "Hello"]],
    ] as [number, [t.DbusType<any>, any]][]],
    writer,
  );

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

  const result = await t.unmarshall(
    t.LITTLE_ENDIAN,
    [
      t.byte(),
      t.byte(),
      t.byte(),
      t.byte(),
      t.uint32(),
      t.uint32(),
      t.array(t.struct([t.byte(), t.variant()])),
    ],
    reader,
  );
  console.log(result);
});
