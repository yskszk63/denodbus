import { assertEquals } from "https://deno.land/std@0.118.0/testing/asserts.ts";

import limit from './limit.ts';

Deno.test('limit', async () => {
  const original = new ReadableStream({
    pull(controller) {
      if (controller.byobRequest?.view) {
        const view = controller.byobRequest.view;
        const len = view.byteLength;
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(Uint8Array.from({ length: len }, () => 1));
        controller.byobRequest.respond(len);
        return;
      }

      const buf = Uint8Array.from({ length: 512 }, () => 1);
      controller.enqueue(buf);
    },
    type: 'bytes',
  });

  const [limited] = limit(original.getReader({mode:'byob'}), 32);
  const reader = limited.getReader();
  try {
    const result = await reader.read();
    if (result.done) {
      throw new Error();
    }
    assertEquals(result.value.length, 32);

    const result2 = await reader.read();
    if (!result2.done) {
      throw new Error();
    }
  } finally {
    reader.releaseLock();
  }
});
