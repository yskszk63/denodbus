import limit from "./limit.ts";

export const LITTLE_ENDIAN = "l";

export const BIG_ENDIAN = "B";

export type Endian = typeof LITTLE_ENDIAN | typeof BIG_ENDIAN;

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

async function readExact(
  reader: ReadableStreamBYOBReader,
  buf: Uint8Array,
): Promise<Uint8Array> {
  const off = buf.byteOffset;
  const len = buf.byteLength;
  let b = buf;
  while (b.byteOffset < off + len) {
    const r = await reader.read(b);
    if (r.done) {
      throw new Error("unexpected EOF.");
    }
    const value = r.value;
    const nextOff = value.byteOffset + value.byteLength;
    const nextLen = len - (nextOff - off);
    b = new Uint8Array(value.buffer, nextOff, nextLen);
  }
  return new Uint8Array(b.buffer, off, len);
}

async function marshallFixed<T>(
  endian: Endian,
  typedarray: { of: (b: T) => ArrayBufferView },
  val: T,
  out: WritableStreamDefaultWriter<Uint8Array>,
): Promise<number> {
  const buf = typedarray.of(val);
  await out.write(convertEndian(endian, new Uint8Array(buf.buffer)));
  return buf.byteLength;
}

async function unmarshallFixed<
  V extends ArrayBufferView & ArrayLike<R> & { reverse(): V },
  R,
>(
  endian: Endian,
  typedarray: (new (b: ArrayBuffer) => V) & { BYTES_PER_ELEMENT: number },
  input: ReadableStreamBYOBReader,
): Promise<R> {
  const value = await readExact(
    input,
    new Uint8Array(typedarray.BYTES_PER_ELEMENT),
  );
  const buf = new typedarray(convertEndian(endian, value.buffer));
  if (!buf.length) {
    throw new Error();
  }
  return buf[0];
}

async function marshallText(
  endian: Endian,
  alignment: 1 | 4,
  lengthType: DbusType<number>,
  text: string,
  out: WritableStreamDefaultWriter<Uint8Array>,
): Promise<number> {
  const buf = new TextEncoder().encode(text);
  const len = buf.byteLength;
  const pad = (alignment - ((len + 1) % alignment)) % alignment;

  const n = await lengthType.marshall(endian, len, out);
  out.write(buf);
  out.write(new Uint8Array(1 + pad));

  return n + len + 1 + pad;
}

async function unmarshallText(
  endian: Endian,
  alignment: 1 | 4,
  lengthType: DbusType<number>,
  input: ReadableStreamBYOBReader,
): Promise<string> {
  const len = await lengthType.unmarshall(endian, input);
  const pad = (alignment - ((len + 1) % alignment)) % alignment;
  const value = await readExact(input, new Uint8Array(len + 1 + pad));
  return new TextDecoder().decode(value.subarray(0, len));
}

export abstract class DbusType<Output> {
  readonly _output!: Output;

  abstract marshall(
    endian: Endian,
    val: Output,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number>;
  abstract unmarshall(
    endian: Endian,
    input: ReadableStreamBYOBReader,
  ): Promise<Output>;
  abstract signature(): string;
}

class DbusByte extends DbusType<number> {
  marshall(
    endian: Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, Uint8Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Uint8Array, input);
  }

  signature(): string {
    return "y";
  }
}

class DbusBoolean extends DbusType<boolean> {
  marshall(
    endian: Endian,
    val: boolean,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, Uint8Array, val ? 1 : 0, out);
  }

  async unmarshall(
    endian: Endian,
    input: ReadableStreamBYOBReader,
  ): Promise<boolean> {
    const v = await unmarshallFixed(endian, Uint8Array, input);
    return v === 1;
  }

  signature(): string {
    return "b";
  }
}

class DbusInt16 extends DbusType<number> {
  marshall(
    endian: Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, Int16Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Int16Array, input);
  }

  signature(): string {
    return "n";
  }
}

class DbusUint16 extends DbusType<number> {
  marshall(
    endian: Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, Uint16Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Uint16Array, input);
  }

  signature(): string {
    return "q";
  }
}

class DbusInt32 extends DbusType<number> {
  marshall(
    endian: Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, Int32Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Int32Array, input);
  }

  signature(): string {
    return "i";
  }
}

class DbusUint32 extends DbusType<number> {
  marshall(
    endian: Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, Uint32Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Uint32Array, input);
  }

  signature(): string {
    return "u";
  }
}

class DbusInt64 extends DbusType<bigint> {
  marshall(
    endian: Endian,
    val: bigint,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, BigInt64Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<bigint> {
    return unmarshallFixed(endian, BigInt64Array, input);
  }

  signature(): string {
    return "x";
  }
}

class DbusUint64 extends DbusType<bigint> {
  marshall(
    endian: Endian,
    val: bigint,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, BigUint64Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<bigint> {
    return unmarshallFixed(endian, BigUint64Array, input);
  }

  signature(): string {
    return "t";
  }
}

class DbusDouble extends DbusType<number> {
  marshall(
    endian: Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, Float64Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Float64Array, input);
  }

  signature(): string {
    return "d";
  }
}

class DbusString extends DbusType<string> {
  marshall(
    endian: Endian,
    val: string,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallText(endian, 4, uint32(), val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(endian, 4, uint32(), input);
  }

  signature(): string {
    return "s";
  }
}

class DbusObjectPath extends DbusType<string> {
  marshall(
    endian: Endian,
    val: string,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallText(endian, 4, uint32(), val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(endian, 4, uint32(), input);
  }

  signature(): string {
    return "o";
  }
}

class DbusSignature extends DbusType<string> {
  marshall(
    endian: Endian,
    val: string,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallText(endian, 1, byte(), val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(endian, 1, byte(), input);
  }

  signature(): string {
    return "g";
  }
}

class DbusArray<T> extends DbusType<T[]> {
  elementType: DbusType<T>;
  constructor(elementType: DbusType<T>) {
    super();
    this.elementType = elementType;
  }

  async marshall(
    endian: Endian,
    val: T[],
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    let len = 0;
    const dummy = new WritableStream().getWriter();
    for (const v of val) {
      len += await this.elementType.marshall(endian, v, dummy);
    }

    let n = await marshallFixed(endian, Uint32Array, len, out);
    for (const v of val) {
      n += await this.elementType.marshall(endian, v, out);
    }
    // TODO alignment
    return n;
  }

  async unmarshall(
    endian: Endian,
    input: ReadableStreamBYOBReader,
  ): Promise<T[]> {
    let remaining = await unmarshallFixed(endian, Uint32Array, input) as number;

    const [stream, info] = limit(input, remaining);
    const reader = stream.getReader({ mode: "byob" });
    try {
      const result = [];
      while (info.hasRemaining()) {
        result.push(await this.elementType.unmarshall(endian, reader));
      }
      // TODO alignment
      return result;
    } finally {
      reader.releaseLock();
    }
  }

  signature(): string {
    return `a${this.elementType.signature()}`;
  }
}

//deno-lint-ignore no-explicit-any
class DbusStruct<T extends [any, ...any]> extends DbusType<T> {
  // Mapped Tuple Type
  items: { [P in keyof T]: DbusType<T[P]> };
  constructor(items: { [P in keyof T]: DbusType<T[P]> }) {
    super();
    this.items = items;
  }

  async marshall(
    endian: Endian,
    val: T,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    let len = 0;
    for (let i = 0; i < this.items.length; i++) {
      len += await this.items[i].marshall(endian, val[i], out);
    }
    return len;
  }

  async unmarshall(
    endian: Endian,
    input: ReadableStreamBYOBReader,
  ): Promise<T> {
    let result = [];
    for (let i = 0; i < this.items.length; i++) {
      result.push(await this.items[i].unmarshall(endian, input));
    }
    return result as T;
  }

  signature(): string {
    return `(${this.items.map((v) => v.signature()).join("")})`;
  }
}

//deno-lint-ignore no-explicit-any
class DbusVariant extends DbusType<[DbusType<any>, any]> {
  async marshall(
    endian: Endian,
    [ty, val]: [DbusType<any>, any],
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    let n = await signature().marshall(endian, ty.signature(), out);
    n += await ty.marshall(endian, val, out);
    // TODO alignment?
    return n;
  }

  async unmarshall(
    endian: Endian,
    input: ReadableStreamBYOBReader,
  ): Promise<[DbusType<any>, any]> {
    const ty = parseSignature(await signature().unmarshall(endian, input));
    const val = await ty.unmarshall(endian, input);
    return [ty, val];
  }

  signature(): string {
    return "v";
  }
}

class DbusDictEntry<K, V> extends DbusType<[K, V]> {
  key: DbusType<K>;
  val: DbusType<V>;
  constructor(key: DbusType<K>, val: DbusType<V>) {
    super();
    this.key = key;
    this.val = val;
  }

  marshall(
    endian: Endian,
    val: [K, V],
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    throw new Error("not implemented.");
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<[K, V]> {
    throw new Error("not implemented.");
  }

  signature(): string {
    return `{${this.key.signature()}${this.val.signature()}}`;
  }
}

class DbusUnixFd extends DbusType<number> {
  marshall(
    endian: Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<number> {
    return marshallFixed(endian, Uint32Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Uint32Array, input);
  }

  signature(): string {
    return "h";
  }
}

//deno-lint-ignore no-explicit-any
type TypeOf<T extends DbusType<any>> = T["_output"];
export type { TypeOf as infer };

const _byte = new DbusByte();
export function byte(): DbusByte {
  return _byte;
}

const _boolean = new DbusBoolean();
export function boolean(): DbusBoolean {
  return _boolean;
}

const _int16 = new DbusInt16();
export function int16(): DbusInt16 {
  return _int16;
}

const _uint16 = new DbusUint16();
export function uint16(): DbusUint16 {
  return _uint16;
}

const _int32 = new DbusInt32();
export function int32(): DbusInt32 {
  return _int32;
}

const _uint32 = new DbusUint32();
export function uint32(): DbusUint32 {
  return _uint32;
}

const _int64 = new DbusInt64();
export function int64(): DbusInt64 {
  return _int64;
}

const _uint64 = new DbusUint64();
export function uint64(): DbusUint64 {
  return _uint64;
}

const _double = new DbusDouble();
export function double(): DbusDouble {
  return _double;
}

const _string = new DbusString();
export function string(): DbusString {
  return _string;
}

const _objectPath = new DbusObjectPath();
export function objectPath(): DbusObjectPath {
  return _objectPath;
}

const _signature = new DbusSignature();
export function signature(): DbusSignature {
  return _signature;
}

export function array<T>(elementType: DbusType<T>): DbusArray<T> {
  return new DbusArray(elementType);
}

//deno-lint-ignore no-explicit-any
export function struct<T extends [any, ...any[]]>(
  items: { [P in keyof T]: DbusType<T[P]> },
): DbusStruct<T> {
  return new DbusStruct<T>(items);
}

const _variant = new DbusVariant();
export function variant(): DbusVariant {
  return _variant;
}

export function dictEntry<K, V>(
  key: DbusType<K>,
  val: DbusType<V>,
): DbusDictEntry<K, V> {
  return new DbusDictEntry(key, val);
}

const _unixFd = new DbusUnixFd();
export function unixFd(): DbusUnixFd {
  return _unixFd;
}

export function parseSignature(
  sig: string,
  ctx: { pos: number } = { pos: 0 },
): DbusType<any> {
  const h = sig[ctx.pos++];
  switch (h) {
    case "y":
      return byte();
    case "b":
      return boolean();
    case "n":
      return int16();
    case "q":
      return uint16();
    case "i":
      return int32();
    case "u":
      return uint32();
    case "x":
      return int64();
    case "t":
      return uint64();
    case "d":
      return double();
    case "s":
      return string();
    case "o":
      return objectPath();
    case "g":
      return signature();
    case "v":
      return variant();
    case "h":
      return unixFd();
    case "a":
      return array(parseSignature(sig, ctx));
    case "(": {
      const items = [parseSignature(sig, ctx)];
      while (sig[ctx.pos] !== ")") {
        items.push(parseSignature(sig, ctx));
      }
      ctx.pos++;
      return struct(items as [DbusType<any>, ...DbusType<any>[]]);
    }
    case "{": {
      const key = parseSignature(sig, ctx);
      const val = parseSignature(sig, ctx);
      if (sig[ctx.pos++] !== "}") {
        throw new Error();
      }
      return dictEntry(key, val);
    }
    default:
      throw new Error(`${sig} ${h}`);
  }
}

export async function marshall<T extends [any, ...any[]]>(
  endian: Endian,
  types: { [P in keyof T]: DbusType<T[P]> },
  values: T,
  output: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
  for (let n = 0; n < types.length; n++) {
    const t = types[n];
    const v = values[n];
    await t.marshall(endian, v, output);
  }
}

export async function unmarshall<T extends [any, ...any[]]>(
  endian: Endian,
  types: { [P in keyof T]: DbusType<T[P]> },
  input: ReadableStreamBYOBReader,
): Promise<T> {
  const result = [];
  for (const ty of types) {
    result.push(await ty.unmarshall(endian, input));
  }
  return result as T;
}

// ----
/*
const X = struct([string(), array(byte())]);
type X = TypeOf<typeof X>;
*/
