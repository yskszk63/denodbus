// TODO check overflow
import { assertEquals } from "https://deno.land/std@0.118.0/testing/asserts.ts";

import * as t from "./types.ts";
import { MarshallContext, UnmarshallContext } from "./marshall.ts";
import { BIG_ENDIAN, Endian, LITTLE_ENDIAN } from "./endian.ts";

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

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0, 1, 192, 255]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("boolean", async () => {
  const ty = t.boolean();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [true, false]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("int16", async () => {
  const ty = t.int16();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0, 1, 32, 512, -512, 0x7FFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("uint16", async () => {
  const ty = t.uint16();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0, 1, 32, 512, 0x7FFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("int32", async () => {
  const ty = t.int32();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0, 1, 32, 512, -512, 0x7FFF_FFFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("uint32", async () => {
  const ty = t.uint32();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0, 1, 32, 512, 0xFFFF_FFFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("int64", async () => {
  const ty = t.int64();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0n, 1n, 32n, 512n, -512n, 0x7FFF_FFFF_FFFF_FFFFn]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("uint64", async () => {
  const ty = t.uint64();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0n, 1n, 32n, 512n, 0x7FFF_FFFF_FFFF_FFFFn]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("double", async () => {
  const ty = t.double();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0.1, 0.3]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("string", async () => {
  const ty = t.string();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of ["", "Hello, World!"]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("object_path", async () => {
  const ty = t.objectPath();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of ["/obj/path"]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("signature", async () => {
  const ty = t.signature();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of ["i", "b"]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("unix_fd", async () => {
  const ty = t.unixFd();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [0, 1, 32, 512, 0xFFFF_FFFF]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
      );
      assertEquals(unmarshalled, v);
    }
  }
});

Deno.test("variant", async () => {
  const ty = t.variant();

  for (const endian of [BIG_ENDIAN, LITTLE_ENDIAN] as Endian[]) {
    for (const v of [new t.Variant(t.byte(), 2)]) {
      const mem: Uint8Array[] = [];
      const [r, w] = memStream(mem);

      await ty.marshall(new MarshallContext(w, endian), v);
      const unmarshalled = await ty.unmarshall(
        new UnmarshallContext(r, endian),
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
