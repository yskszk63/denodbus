import { assertEquals } from "https://deno.land/std@0.118.0/testing/asserts.ts";

import count from './count.ts';

Deno.test('test', async () => {
  let n = 0;
  const w = count((c) => n = c);
  await w.getWriter().write(new TextEncoder().encode('Hello, world!'));

  assertEquals(n, 13);
});
