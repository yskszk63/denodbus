export default function count(callback: (c: number) => void) {
  let n = 0;
  return new WritableStream<Uint8Array>({
    write(chunk) {
      n += chunk.length;
      callback(n);
    },
  });
}
