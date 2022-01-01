type ExportInfo = {
  hasRemaining(): boolean;
}

export default function limit(upstream: ReadableStreamBYOBReader, max: number): [ReadableStream<Uint8Array>, ExportInfo] {
  let remaining = max;
  const stream = new ReadableStream({
    async pull(controller) {
      if (!remaining) {
        controller.close();
      }

      if (controller.byobRequest && controller.byobRequest.view) {
        // TODO check multiply
        const view = controller.byobRequest.view;
        const result = await upstream.read(new Uint8Array(view.buffer, view.byteOffset, Math.min(view.byteLength, remaining)));
        if (result.done) {
          controller.close();
          return;
        }
        remaining -= result.value.byteLength;
        controller.byobRequest.respond(result.value.byteLength);
        return;
      }

      const buf = new Uint8Array(Math.min(512, remaining));
      const result = await upstream.read(buf);
      if (result.done) {
        controller.close();
        return;
      }
      remaining -= result.value.byteLength;
      controller.enqueue(result.value);
    },
    type: 'bytes',
  });

  return [stream, { hasRemaining: () =>  remaining > 0 }];
}
