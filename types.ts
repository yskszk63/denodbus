async function marshallFixed<T>(typedarray: { of: (b: T) => ArrayBufferView } , val: T, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
  const buf = typedarray.of(val);
  await out.write(new Uint8Array(buf.buffer));
  return buf.byteLength;
}

async function unmarshallFixed<R>(typedarray: (new (b: ArrayBuffer) => ArrayBufferView & ArrayLike<R>) & { BYTES_PER_ELEMENT: number }, input: ReadableStreamBYOBReader): Promise<R> {
  const result = await input.read(new Uint8Array(new ArrayBuffer(typedarray.BYTES_PER_ELEMENT)));
  if (result.done) {
    throw new Error('unexpected EOF.');
  }
  const buf = new typedarray(result.value.buffer);
  if (!buf.length) {
    throw new Error();
  }
  return buf[0];
}

async function marshallText(alignment: 1 | 4, text: string, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
  const buf = new TextEncoder().encode(text);
  const len = buf.byteLength;
  const pad = (alignment - ((len + 1) % alignment) % alignment);

  const n = await marshallFixed(Uint32Array, len, out);
  out.write(buf);
  out.write(new Uint8Array(1 + pad));

  return n + len + 1 + pad;
}

async function unmarshallText(alignment: 1 | 4, input: ReadableStreamBYOBReader): Promise<string> {
  const len = await unmarshallFixed(Uint32Array, input);
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

  abstract marshall(_val: Output, _out: WritableStreamDefaultWriter<Uint8Array>): Promise<number>;

  abstract unmarshall(_input: ReadableStreamBYOBReader): Promise<Output>;
}

class DbusByte extends DbusType<number> {
  marshall(val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(Uint8Array, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(Uint8Array, input);
  }
}

class DbusBoolean extends DbusType<boolean> {
  marshall(val: boolean, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(Uint8Array, val ? 1 : 0, out);
  }

  async unmarshall(input: ReadableStreamBYOBReader): Promise<boolean> {
    const v = await unmarshallFixed(Uint8Array, input);
    return v === 1;
  }
}

class DbusInt16 extends DbusType<number> {
  marshall(val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(Int16Array, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(Int16Array, input);
  }
}

class DbusUint16 extends DbusType<number> {
  marshall(val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(Uint16Array, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(Uint16Array, input);
  }
}

class DbusInt32 extends DbusType<number> {
  marshall(val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(Int32Array, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(Int32Array, input);
  }
}

class DbusUint32 extends DbusType<number> {
  marshall(val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(Uint32Array, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(Uint32Array, input);
  }
}

class DbusInt64 extends DbusType<bigint> {
  marshall(val: bigint, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(BigInt64Array, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<bigint> {
    return unmarshallFixed(BigInt64Array, input);
  }
}

class DbusUint64 extends DbusType<bigint> {
  marshall(val: bigint, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(BigUint64Array, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<bigint> {
    return unmarshallFixed(BigUint64Array, input);
  }
}

class DbusDouble extends DbusType<number> {
  marshall(val: number, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallFixed(Float64Array, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<number> {
    return unmarshallFixed(Float64Array, input);
  }
}

class DbusString extends DbusType<string> {
  marshall(val: string, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallText(4, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(4, input);
  }
}

class DbusObjectPath extends DbusType<string> {
  marshall(val: string, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallText(4, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(4, input);
  }
}

class DbusSignature extends DbusType<string> {
  marshall(val: string, out: WritableStreamDefaultWriter<Uint8Array>): Promise<number> {
    return marshallText(1, val, out);
  }

  unmarshall(input: ReadableStreamBYOBReader): Promise<string> {
    return unmarshallText(1, input);
  }
}

class DbusArray<T> extends DbusType<T[]> {
  elementType: DbusType<T>;
  constructor(elementType: DbusType<T>) {
    super();
    this.elementType = elementType;
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
}

//deno-lint-ignore no-explicit-any
class DbusVariant extends DbusType<any> {
}

class DbusDictEntry<K, V> extends DbusType<[K, V]> {
  key: DbusType<K>;
  val: DbusType<V>;
  constructor(key: DbusType<K>, val: DbusType<V>) {
    super();
    this.key = key;
    this.val = val;
  }
}

class DbusUnixFd extends DbusType<number> {
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

// ----
/*
const X = struct([string(), array(byte())]);
type X = TypeOf<typeof X>;
*/
