import { assertEquals } from "https://deno.land/std@0.118.0/testing/asserts.ts";

import * as a from './auth.ts';

Deno.test('auth external', async () => {
  let mem = null;
  const w = new WritableStream({
    write(chunk) {
      mem = chunk;
    },
  });

  await a.send({ command: 'AUTH', mechanism: 'EXTERNAL', initialResponse: '1000'}, w.getWriter());
  if (!mem) {
    throw new Error();
  }
  const expect = "41 55 54 48 20 45 58 54 45 52 4e 41 4c 20 33 31 33 30 33 30 33 30 0d 0a";
  assertEquals(mem, Uint8Array.from(expect.split(' ').map(v => parseInt(v, 16))));
});

Deno.test('ok', async () => {
  const r = new ReadableStream({
    pull(controller) {
      const msg = "4f 4b 20 63 64 30 32 37 34 35 39 36 39 62 33 36 30 63 39 32 34 39 36 35 30 65 32 36 31 63 36 39 39 66 39 0d 0a";
      controller.enqueue(Uint8Array.from(msg.split(' ').map(v => parseInt(v, 16))));
    },
    type: 'bytes',
  });

  const m = await a.recv(r.getReader({ mode: 'byob' }));
  if (m.command !== 'OK') {
    throw new Error();
  }
  const guid = '63 64 30 32 37 34 35 39 36 39 62 33 36 30 63 39 32 34 39 36 35 30 65 32 36 31 63 36 39 39 66 39';
  assertEquals(Uint8Array.from(guid.split(' ').map(v => parseInt(v, 16))), new TextEncoder().encode(Array.from(m.guid, v => v.toString(16).padStart(2, '0')).join('')));
});

Deno.test('negotiate_unix_fd', async () => {
  let mem = null;
  const w = new WritableStream({
    write(chunk) {
      mem = chunk;
    },
  });

  await a.send({ command: 'NEGOTIATE_UNIX_FD'}, w.getWriter());
  if (!mem) {
    throw new Error();
  }
  const expect = "4e 45 47 4f 54 49 41 54 45 5f 55 4e 49 58 5f 46 44 0d 0a";
  assertEquals(mem, Uint8Array.from(expect.split(' ').map(v => parseInt(v, 16))));
});

Deno.test('agree_unix_fd', async () => {
  const r = new ReadableStream({
    pull(controller) {
      const msg = "41 47 52 45 45 5f 55 4e 49 58 5f 46 44 0d 0a";
      controller.enqueue(Uint8Array.from(msg.split(' ').map(v => parseInt(v, 16))));
    },
    type: 'bytes',
  });

  const m = await a.recv(r.getReader({ mode: 'byob' }));
  assertEquals(m.command, "AGREE_UNIX_FD");
});

Deno.test('begin', async () => {
  let mem = null;
  const w = new WritableStream({
    write(chunk) {
      mem = chunk;
    },
  });

  await a.send({ command: 'BEGIN'}, w.getWriter());
  if (!mem) {
    throw new Error();
  }
  const expect = "42 45 47 49 4e 0d 0a";
  assertEquals(mem, Uint8Array.from(expect.split(' ').map(v => parseInt(v, 16))));
});
