import { BIG_ENDIAN, Endian, LITTLE_ENDIAN } from "./endian.ts";

export class MarshallContext {
  pos: number;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  endian: Endian;

  constructor(stream: WritableStream<Uint8Array>, endian?: Endian) {
    this.pos = 0;
    this.writer = stream.getWriter();
    this.endian = endian ?? nativeEndian;
  }

  release() {
    this.writer.releaseLock();
  }

  async alignWrite(
    alignment: number,
  ): Promise<void> {
    const pad = (alignment - ((this.pos) % alignment)) % alignment;
    await this.writer.write(new Uint8Array(pad));
    this.pos += pad;
  }

  async writeAll(
    buf: Uint8Array,
    alignment: number | null,
  ): Promise<void> {
    if (alignment) {
      await this.alignWrite(alignment);
    }

    const len = buf.byteLength;
    await this.writer.write(buf);
    this.pos += len;
  }

  marshallByte(val: number): Promise<void> {
    return marshallFixed(this, Uint8Array, val);
  }

  marshallBoolean(val: boolean): Promise<void> {
    return marshallFixed(this, Uint32Array, val ? 1 : 0);
  }

  marshallInt16(val: number): Promise<void> {
    return marshallFixed(this, Int16Array, val);
  }

  marshallUint16(val: number): Promise<void> {
    return marshallFixed(this, Uint16Array, val);
  }

  marshallInt32(val: number): Promise<void> {
    return marshallFixed(this, Int32Array, val);
  }

  marshallUint32(val: number): Promise<void> {
    return marshallFixed(this, Uint32Array, val);
  }

  marshallInt64(val: bigint): Promise<void> {
    return marshallFixed(this, BigInt64Array, val);
  }

  marshallUint64(val: bigint): Promise<void> {
    return marshallFixed(this, BigUint64Array, val);
  }

  marshallDouble(val: number): Promise<void> {
    return marshallFixed(this, Float64Array, val);
  }

  marshallString(val: string): Promise<void> {
    return marshallText(this, Uint32Array, val);
  }

  marshallPath(val: string): Promise<void> {
    return marshallText(this, Uint32Array, val);
  }

  marshallSignature(val: string): Promise<void> {
    return marshallText(this, Uint8Array, val);
  }

  marshallUnixFd(val: number): Promise<void> {
    return marshallFixed(this, Uint32Array, val);
  }
}

export class UnmarshallContext {
  pos: number;
  reader: ReadableStreamBYOBReader;
  endian: Endian;

  constructor(stream: ReadableStream<Uint8Array>, endian?: Endian) {
    this.pos = 0;
    this.reader = stream.getReader({ mode: "byob" });
    this.endian = endian ?? nativeEndian;
  }

  release() {
    this.reader.releaseLock();
  }

  async alignRead(
    alignment: number,
  ): Promise<void> {
    const pad = (alignment - ((this.pos) % alignment)) % alignment;
    let rest = pad;
    while (rest > 0) {
      const r = await this.reader.read(new Uint8Array(pad));
      if (r.done) {
        throw new Error("unexpected EOF.");
      }
      rest -= r.value.byteLength;
    }
    this.pos += pad;
  }

  async readExact(
    buf: Uint8Array,
    alignment: number | null,
  ): Promise<Uint8Array> {
    if (alignment) {
      await this.alignRead(alignment);
    }

    const off = buf.byteOffset;
    const len = buf.byteLength;
    let b = buf;
    while (b.byteOffset < off + len) {
      const r = await this.reader.read(b);
      if (r.done) {
        throw new Error("unexpected EOF.");
      }
      const value = r.value;
      const nextOff = value.byteOffset + value.byteLength;
      const nextLen = len - (nextOff - off);
      b = new Uint8Array(value.buffer, nextOff, nextLen);
    }
    this.pos += len;
    return new Uint8Array(b.buffer, off, len);
  }

  unmarshallByte(): Promise<number> {
    return unmarshallFixed(this, Uint8Array);
  }

  async unmarshallBoolean(): Promise<boolean> {
    return unmarshallFixed(this, Uint32Array).then((v) => v !== 0);
  }

  unmarshallInt16(): Promise<number> {
    return unmarshallFixed(this, Int16Array);
  }

  unmarshallUint16(): Promise<number> {
    return unmarshallFixed(this, Uint16Array);
  }

  unmarshallInt32(): Promise<number> {
    return unmarshallFixed(this, Int32Array);
  }

  unmarshallUint32(): Promise<number> {
    return unmarshallFixed(this, Uint32Array);
  }

  unmarshallInt64(): Promise<bigint> {
    return unmarshallFixed(this, BigInt64Array);
  }

  unmarshallUint64(): Promise<bigint> {
    return unmarshallFixed(this, BigUint64Array);
  }

  unmarshallDouble(): Promise<number> {
    return unmarshallFixed(this, Float64Array);
  }

  unmarshallString(): Promise<string> {
    return unmarshallText(this, Uint32Array);
  }

  unmarshallPath(): Promise<string> {
    return unmarshallText(this, Uint32Array);
  }

  unmarshallSignature(): Promise<string> {
    return unmarshallText(this, Uint8Array);
  }

  unmarshallUnixFd(): Promise<number> {
    return unmarshallFixed(this, Uint32Array);
  }
}

const nativeEndian = (() => {
  const b = Uint8Array.of(0x12, 0x34);
  switch (new Uint16Array(b.buffer)[0]) {
    case 0x3412:
      return LITTLE_ENDIAN;
    case 0x1234:
      return BIG_ENDIAN;
    default:
      throw new Error();
  }
})();

function convertEndian<V extends Uint8Array | ArrayBuffer>(
  endian: Endian,
  v: V,
): V {
  if (endian !== nativeEndian) {
    if (v instanceof ArrayBuffer) {
      return new Uint8Array(v).reverse().buffer as V;
    } else {
      return v.reverse() as V;
    }
  }
  return v;
}

async function marshallFixed<T>(
  ctx: MarshallContext,
  typedarray: { of: (b: T) => ArrayBufferView; BYTES_PER_ELEMENT: number },
  val: T,
): Promise<void> {
  const buf = typedarray.of(val);
  await ctx.writeAll(
    convertEndian(ctx.endian, new Uint8Array(buf.buffer)),
    typedarray.BYTES_PER_ELEMENT,
  );
}

async function unmarshallFixed<
  V extends ArrayBufferView & ArrayLike<R> & { reverse(): V },
  R,
>(
  ctx: UnmarshallContext,
  typedarray: (new (b: ArrayBuffer) => V) & { BYTES_PER_ELEMENT: number },
): Promise<R> {
  const value = await ctx.readExact(
    new Uint8Array(typedarray.BYTES_PER_ELEMENT),
    typedarray.BYTES_PER_ELEMENT,
  );
  const buf = new typedarray(convertEndian(ctx.endian, value.buffer));
  if (!buf.length) {
    throw new Error();
  }
  return buf[0];
}

async function marshallText(
  ctx: MarshallContext,
  lengthType: { of: (b: number) => ArrayBufferView; BYTES_PER_ELEMENT: number },
  text: string,
): Promise<void> {
  const buf = new TextEncoder().encode(text);
  const len = buf.byteLength;

  await marshallFixed(ctx, lengthType, len);
  await ctx.writeAll(buf, null);
  await ctx.writeAll(Uint8Array.of(0), null);
}

async function unmarshallText<
  V extends ArrayBufferView & ArrayLike<number> & { reverse(): V },
>(
  ctx: UnmarshallContext,
  lengthType: (new (b: ArrayBuffer) => V) & { BYTES_PER_ELEMENT: number },
): Promise<string> {
  const len = await unmarshallFixed<V, number>(ctx, lengthType);
  const value = await ctx.readExact(new Uint8Array(len + 1), null);
  return new TextDecoder().decode(value.subarray(0, len));
}
