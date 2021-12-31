export const LITTLE_ENDIAN = 'l';

export const BIG_ENDIAN = 'B';

export type Endian = typeof LITTLE_ENDIAN | typeof BIG_ENDIAN;

const nativeEndian = (() => {
  const b = Uint8Array.of(0x12, 0x34);
  switch (new Uint16Array(b.buffer)[0]) {
    case 0x3412: return LITTLE_ENDIAN;
    case 0x1234: return BIG_ENDIAN;
    default: throw new Error();
  }
})();

function convertEndian<V extends Uint8Array | ArrayBuffer>(endian: Endian, v: V): V {
  if (endian !== nativeEndian) {
    if (v instanceof ArrayBuffer) {
      return new Uint8Array(v).reverse().buffer as V;
    } else {
      return v.reverse() as V;
    }
  }
  return v;
}

async function marshallFixed<T>(endian: Endian, typedarray: { of: (b: T) => ArrayBufferView } , val: T, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
  const buf = typedarray.of(val);
  await out.write(convertEndian(endian, new Uint8Array(buf.buffer)));
  return buf.byteLength;
}

async function unmarshallFixed<V extends ArrayBufferView & ArrayLike<R> & { reverse(): V }, R>(endian: Endian, typedarray: (new (b: ArrayBuffer) => V) & { BYTES_PER_ELEMENT: number }, input: ReadableStreamBYOBReader): Promise<R> {
  const result = await input.read(new Uint8Array(new ArrayBuffer(typedarray.BYTES_PER_ELEMENT)));
  if (result.done) {
    throw new Error('unexpected EOF.');
  }
  const buf = new typedarray(convertEndian(endian, result.value.buffer));
  if (!buf.length) {
    throw new Error();
  }
  return buf[0];
}

async function marshallText(endian: Endian, alignment: 1 | 4, text: string, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
  const buf = new TextEncoder().encode(text);
  const len = buf.byteLength;
  const pad = (alignment - ((len + 1) % alignment) % alignment);

  const n = await marshallFixed(endian, Uint32Array, len, out);
  out.write(buf);
  out.write(new Uint8Array(1 + pad));

  return n + len + 1 + pad;
}

async function unmarshallText(endian: Endian, alignment: 1 | 4, input: ReadableStreamBYOBReader): Promise<string> {
  const len = await unmarshallFixed(endian, Uint32Array, input) as number;
  const pad = (alignment - ((len + 1) % alignment) % alignment);
  const v = new Uint8Array(len + 1 + pad);
  const result = await input.read(v);
  if (result.done) {
    throw new Error('unexpected EOF.');
  }
  return new TextDecoder().decode(result.value.subarray(0, len));
}


abstract class DbusType<Output> {
  readonly _output!: Output;

  abstract marshall(endian: Endian, val: Output, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number>;
  abstract unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<Output>;
}

class DbusByte extends DbusType<number> {
  marshall(endian: Endian, val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, Uint8Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Uint8Array, input);
  }
}

class DbusBoolean extends DbusType<boolean> {
  marshall(endian: Endian, val: boolean, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, Uint8Array, val ? 1 : 0, out);
  }

  async unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<boolean> {
    const v = await unmarshallFixed(endian, Uint8Array, input);
    return v === 1;
  }
}

class DbusInt16 extends DbusType<number> {
  marshall(endian: Endian, val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, Int16Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Int16Array, input);
  }
}

class DbusUint16 extends DbusType<number> {
  marshall(endian: Endian, val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, Uint16Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Uint16Array, input);
  }
}

class DbusInt32 extends DbusType<number> {
  marshall(endian: Endian, val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, Int32Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Int32Array, input);
  }
}

class DbusUint32 extends DbusType<number> {
  marshall(endian: Endian, val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, Uint32Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Uint32Array, input);
  }
}

class DbusInt64 extends DbusType<bigint> {
  marshall(endian: Endian, val: bigint, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, BigInt64Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<bigint> {
    return unmarshallFixed(endian, BigInt64Array, input);
  }
}

class DbusUint64 extends DbusType<bigint> {
  marshall(endian: Endian, val: bigint, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, BigUint64Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<bigint> {
    return unmarshallFixed(endian, BigUint64Array, input);
  }
}

class DbusDouble extends DbusType<number> {
  marshall(endian: Endian, val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, Float64Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Float64Array, input);
  }
}

class DbusString extends DbusType<string> {
  marshall(endian: Endian, val: string, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallText(endian, 4, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(endian, 4, input);
  }
}

class DbusObjectPath extends DbusType<string> {
  marshall(endian: Endian, val: string, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallText(endian, 4, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(endian, 4, input);
  }
}

class DbusSignature extends DbusType<string> {
  marshall(endian: Endian, val: string, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallText(endian, 1, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(endian, 1, input);
  }
}

class DbusArray<T> extends DbusType<T[]> {
  elementType: DbusType<T>;
  constructor(elementType: DbusType<T>) {
    super();
    this.elementType = elementType;
  }

  async marshall(endian: Endian, val: T[], out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    let n = await marshallFixed(endian, Uint32Array, val.length, out); // TODO length -> not elements, but size.
    for (const v of val) {
      n += await this.elementType.marshall(endian, v, out);
    }
    // alignment
    return n
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<T[]> {
    throw new Error('not implemented.');
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

  marshall(endian: Endian, val: T, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    throw new Error('not implemented.');
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<T> {
    throw new Error('not implemented.');
  }
}

//deno-lint-ignore no-explicit-any
class DbusVariant extends DbusType<any> {
  marshall(endian: Endian, val: any, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    throw new Error('not implemented.');
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<any> {
    throw new Error('not implemented.');
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

  marshall(endian: Endian, val: [K, V], out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    throw new Error('not implemented.');
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<[K, V]> {
    throw new Error('not implemented.');
  }
}

class DbusUnixFd extends DbusType<number> {
  marshall(endian: Endian, val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(endian, Uint32Array, val, out);
  }

  unmarshall(endian: Endian, input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(endian, Uint32Array, input);
  }
}

//deno-lint-ignore no-explicit-any
type TypeOf<T extends DbusType<any>> = T['_output'];
export type { TypeOf as infer }

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
export function struct<T extends [any, ...any[]]>(items: { [P in keyof T]: DbusType<T[P]> }): DbusStruct<T> {
  return new DbusStruct<T>(items);
}

const _variant = new DbusVariant();
export function variant(): DbusVariant {
  return _variant;
}

export function dictEntry<K, V>(key: DbusType<K>, val: DbusType<V>): DbusDictEntry<K, V> {
  return new DbusDictEntry(key, val);
}

const _unixFd = new DbusUnixFd();
export function unixFd(): DbusUnixFd {
  return _unixFd;
}

export async function marshall<T extends [any, ...any[]]>(endian: Endian, types: { [P in keyof T]: DbusType<T[P]> }, values: T, output: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
  for (let n = 0; n < types.length; n++) {
    const t = types[n];
    const v = values[n];
    await t.marshall(endian, v, output);
  }
}

export async function unmarshall<T extends [any, ...any[]]>(endian: Endian, types: { [P in keyof T]: DbusType<T[P]> }, input: ReadableStreamBYOBReader): Promise<T> {
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
