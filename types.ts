import * as endian from "./endian.ts";

class ParseContext {
  pos: number;
  constructor() {
    this.pos = 0;
  }

  async alignRead(
    reader: ReadableStreamBYOBReader,
    alignment: number,
  ): Promise<void> {
    const pad = (alignment - ((this.pos) % alignment)) % alignment;
    let rest = pad;
    while (rest > 0) {
      const r = await reader.read(new Uint8Array(pad));
      if (r.done) {
        throw new Error("unexpected EOF.");
      }
      rest -= r.value.byteLength;
    }
    this.pos += pad;
  }

  async alignWrite(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    alignment: number,
  ): Promise<void> {
    const pad = (alignment - ((this.pos) % alignment)) % alignment;
    await writer.write(new Uint8Array(pad));
    this.pos += pad;
  }

  async readExact(
    reader: ReadableStreamBYOBReader,
    buf: Uint8Array,
    alignment: number | null,
  ): Promise<Uint8Array> {
    if (alignment) {
      await this.alignRead(reader, alignment);
    }

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
    this.pos += len;
    return new Uint8Array(b.buffer, off, len);
  }

  async writeAll(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    buf: Uint8Array,
    alignment: number | null,
  ): Promise<void> {
    if (alignment) {
      await this.alignWrite(writer, alignment);
    }

    const len = buf.byteLength;
    await writer.write(buf);
    this.pos += len;
  }
}

const nativeEndian = (() => {
  const b = Uint8Array.of(0x12, 0x34);
  switch (new Uint16Array(b.buffer)[0]) {
    case 0x3412:
      return endian.LITTLE_ENDIAN;
    case 0x1234:
      return endian.BIG_ENDIAN;
    default:
      throw new Error();
  }
})();

function convertEndian<V extends Uint8Array | ArrayBuffer>(
  endian: endian.Endian,
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
  endian: endian.Endian,
  typedarray: { of: (b: T) => ArrayBufferView; BYTES_PER_ELEMENT: number },
  val: T,
  out: WritableStreamDefaultWriter<Uint8Array>,
  ctx: ParseContext,
): Promise<void> {
  const buf = typedarray.of(val);
  await ctx.writeAll(
    out,
    convertEndian(endian, new Uint8Array(buf.buffer)),
    typedarray.BYTES_PER_ELEMENT,
  );
}

async function unmarshallFixed<
  V extends ArrayBufferView & ArrayLike<R> & { reverse(): V },
  R,
>(
  endian: endian.Endian,
  typedarray: (new (b: ArrayBuffer) => V) & { BYTES_PER_ELEMENT: number },
  input: ReadableStreamBYOBReader,
  ctx: ParseContext,
): Promise<R> {
  const value = await ctx.readExact(
    input,
    new Uint8Array(typedarray.BYTES_PER_ELEMENT),
    typedarray.BYTES_PER_ELEMENT,
  );
  const buf = new typedarray(convertEndian(endian, value.buffer));
  if (!buf.length) {
    throw new Error();
  }
  return buf[0];
}

async function marshallText(
  endian: endian.Endian,
  lengthType: DbusType<number>,
  text: string,
  out: WritableStreamDefaultWriter<Uint8Array>,
  ctx: ParseContext,
): Promise<void> {
  const buf = new TextEncoder().encode(text);
  const len = buf.byteLength;

  await lengthType.marshall(endian, len, out, ctx);
  await ctx.writeAll(out, buf, null);
  await ctx.writeAll(out, Uint8Array.of(0), null);
}

async function unmarshallText(
  endian: endian.Endian,
  lengthType: DbusType<number>,
  input: ReadableStreamBYOBReader,
  ctx: ParseContext,
): Promise<string> {
  const len = await lengthType.unmarshall(endian, input, ctx);
  const value = await ctx.readExact(input, new Uint8Array(len + 1), null);
  return new TextDecoder().decode(value.subarray(0, len));
}

export abstract class DbusType<Output> {
  readonly _output!: Output;

  abstract marshall(
    endian: endian.Endian,
    val: Output,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void>;

  abstract unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<Output>;
  abstract signature(): string;
}

class DbusByte extends DbusType<number> {
  marshall(
    endian: endian.Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      Uint8Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<number> {
    return unmarshallFixed(
      endian,
      Uint8Array,
      input,
      ctx ?? new ParseContext(),
    );
  }

  signature(): string {
    return "y";
  }
}

class DbusBoolean extends DbusType<boolean> {
  marshall(
    endian: endian.Endian,
    val: boolean,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      Uint32Array,
      val ? 1 : 0,
      out,
      ctx ?? new ParseContext(),
    );
  }

  async unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<boolean> {
    const v = await unmarshallFixed(
      endian,
      Uint32Array,
      input,
      ctx ?? new ParseContext(),
    );
    return v === 1;
  }

  signature(): string {
    return "b";
  }
}

class DbusInt16 extends DbusType<number> {
  marshall(
    endian: endian.Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      Int16Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<number> {
    return unmarshallFixed(
      endian,
      Int16Array,
      input,
      ctx ?? new ParseContext(),
    );
  }

  signature(): string {
    return "n";
  }
}

class DbusUint16 extends DbusType<number> {
  marshall(
    endian: endian.Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      Uint16Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<number> {
    return unmarshallFixed(
      endian,
      Uint16Array,
      input,
      ctx ?? new ParseContext(),
    );
  }

  signature(): string {
    return "q";
  }
}

class DbusInt32 extends DbusType<number> {
  marshall(
    endian: endian.Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      Int32Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<number> {
    return unmarshallFixed(
      endian,
      Int32Array,
      input,
      ctx ?? new ParseContext(),
    );
  }

  signature(): string {
    return "i";
  }
}

class DbusUint32 extends DbusType<number> {
  marshall(
    endian: endian.Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      Uint32Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<number> {
    return unmarshallFixed(
      endian,
      Uint32Array,
      input,
      ctx ?? new ParseContext(),
    );
  }

  signature(): string {
    return "u";
  }
}

class DbusInt64 extends DbusType<bigint> {
  marshall(
    endian: endian.Endian,
    val: bigint,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      BigInt64Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<bigint> {
    return unmarshallFixed(
      endian,
      BigInt64Array,
      input,
      ctx ?? new ParseContext(),
    );
  }

  signature(): string {
    return "x";
  }
}

class DbusUint64 extends DbusType<bigint> {
  marshall(
    endian: endian.Endian,
    val: bigint,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      BigUint64Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<bigint> {
    return unmarshallFixed(
      endian,
      BigUint64Array,
      input,
      ctx ?? new ParseContext(),
    );
  }

  signature(): string {
    return "t";
  }
}

class DbusDouble extends DbusType<number> {
  marshall(
    endian: endian.Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      Float64Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<number> {
    return unmarshallFixed(
      endian,
      Float64Array,
      input,
      ctx ?? new ParseContext(),
    );
  }

  signature(): string {
    return "d";
  }
}

class DbusString extends DbusType<string> {
  marshall(
    endian: endian.Endian,
    val: string,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallText(endian, uint32(), val, out, ctx ?? new ParseContext());
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<string> {
    return unmarshallText(endian, uint32(), input, ctx ?? new ParseContext());
  }

  signature(): string {
    return "s";
  }
}

class DbusObjectPath extends DbusType<string> {
  marshall(
    endian: endian.Endian,
    val: string,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallText(endian, uint32(), val, out, ctx ?? new ParseContext());
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<string> {
    return unmarshallText(endian, uint32(), input, ctx ?? new ParseContext());
  }

  signature(): string {
    return "o";
  }
}

class DbusSignature extends DbusType<string> {
  marshall(
    endian: endian.Endian,
    val: string,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallText(endian, byte(), val, out, ctx ?? new ParseContext());
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<string> {
    return unmarshallText(endian, byte(), input, ctx ?? new ParseContext());
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
    endian: endian.Endian,
    val: T[],
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    const dummyCtx = new ParseContext();
    const dummy = new WritableStream().getWriter();
    for (const v of val) {
      await this.elementType.marshall(endian, v, dummy, dummyCtx);
    }

    ctx = ctx ?? new ParseContext();
    await uint32().marshall(endian, dummyCtx.pos, out, ctx);
    for (const v of val) {
      await this.elementType.marshall(endian, v, out, ctx);
    }
  }

  async unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<T[]> {
    ctx = ctx ?? new ParseContext();
    let remaining = await uint32().unmarshall(endian, input, ctx);

    const result = [];
    while (remaining > 0) {
      const n = ctx.pos;
      result.push(await this.elementType.unmarshall(endian, input, ctx));
      remaining -= ctx.pos - n;
    }
    return result;
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
    endian: endian.Endian,
    val: T,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    ctx = ctx ?? new ParseContext();
    await ctx.alignWrite(out, 8);

    for (let i = 0; i < this.items.length; i++) {
      await this.items[i].marshall(endian, val[i], out, ctx);
    }
  }

  async unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<T> {
    ctx = ctx ?? new ParseContext();
    await ctx.alignRead(input, 8);

    const result = [];
    for (let i = 0; i < this.items.length; i++) {
      result.push(await this.items[i].unmarshall(endian, input, ctx));
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
    endian: endian.Endian,
    //deno-lint-ignore no-explicit-any
    [ty, val]: [DbusType<any>, any],
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    ctx = ctx ?? new ParseContext();

    await signature().marshall(endian, ty.signature(), out, ctx);
    await ty.marshall(endian, val, out, ctx);
  }

  async unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
    //deno-lint-ignore no-explicit-any
  ): Promise<[DbusType<any>, any]> {
    ctx = ctx ?? new ParseContext();

    const ty = parseSignature(await signature().unmarshall(endian, input, ctx));
    const val = await ty.unmarshall(endian, input, ctx);
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
    endian: endian.Endian,
    val: [K, V],
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    throw new Error("not implemented.");
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    pos?: ParseContext,
  ): Promise<[K, V]> {
    throw new Error("not implemented.");
  }

  signature(): string {
    return `{${this.key.signature()}${this.val.signature()}}`;
  }
}

class DbusUnixFd extends DbusType<number> {
  marshall(
    endian: endian.Endian,
    val: number,
    out: WritableStreamDefaultWriter<Uint8Array>,
    ctx?: ParseContext,
  ): Promise<void> {
    return marshallFixed(
      endian,
      Uint32Array,
      val,
      out,
      ctx ?? new ParseContext(),
    );
  }

  unmarshall(
    endian: endian.Endian,
    input: ReadableStreamBYOBReader,
    ctx?: ParseContext,
  ): Promise<number> {
    return unmarshallFixed(
      endian,
      Uint32Array,
      input,
      ctx ?? new ParseContext(),
    );
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
  //deno-lint-ignore no-explicit-any
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
      //deno-lint-ignore no-explicit-any
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

//deno-lint-ignore no-explicit-any
export async function marshall<T extends [any, ...any[]]>(
  endian: endian.Endian,
  types: { [P in keyof T]: DbusType<T[P]> },
  values: T,
  output: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
  const ctx = new ParseContext();

  for (let n = 0; n < types.length; n++) {
    const t = types[n];
    const v = values[n];
    await t.marshall(endian, v, output, ctx);
  }
}

//deno-lint-ignore no-explicit-any
export async function unmarshall<T extends [any, ...any[]]>(
  endian: endian.Endian,
  types: { [P in keyof T]: DbusType<T[P]> },
  input: ReadableStreamBYOBReader,
): Promise<T> {
  const ctx = new ParseContext();

  const result = [];
  for (const ty of types) {
    result.push(await ty.unmarshall(endian, input, ctx));
  }
  return result as T;
}

// ----
/*
const X = struct([string(), array(byte())]);
type X = TypeOf<typeof X>;
*/
