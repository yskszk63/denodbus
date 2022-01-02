const libc = Deno.dlopen("/usr/lib/libc.so.6", {
  "getuid": { result: "u32", parameters: [] },
});

export function getuid(): number {
  return libc.symbols.getuid() as number;
}
