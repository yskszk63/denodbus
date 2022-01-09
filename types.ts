import { MarshallContext, UnmarshallContext } from "./marshall.ts";

export class Variant<T> {
  type: DbusType<T>;
  value: T;

  constructor(
    type: DbusType<T>,
    value: T,
  ) {
    this.type = type;
    this.value = value;
  }
}

export abstract class DbusType<Output> {
  readonly _output!: Output;

  abstract marshall(
    ctx: MarshallContext,
    val: Output,
  ): Promise<void>;

  abstract unmarshall(
    ctx: UnmarshallContext,
  ): Promise<Output>;
  abstract signature(): string;
}

class DbusByte extends DbusType<number> {
  marshall(
    ctx: MarshallContext,
    val: number,
  ): Promise<void> {
    return ctx.marshallByte(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<number> {
    return ctx.unmarshallByte();
  }

  signature(): string {
    return "y";
  }
}

class DbusBoolean extends DbusType<boolean> {
  marshall(
    ctx: MarshallContext,
    val: boolean,
  ): Promise<void> {
    return ctx.marshallBoolean(val);
  }

  async unmarshall(
    ctx: UnmarshallContext,
  ): Promise<boolean> {
    return ctx.unmarshallBoolean();
  }

  signature(): string {
    return "b";
  }
}

class DbusInt16 extends DbusType<number> {
  marshall(
    ctx: MarshallContext,
    val: number,
  ): Promise<void> {
    return ctx.marshallInt16(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<number> {
    return ctx.unmarshallInt16();
  }

  signature(): string {
    return "n";
  }
}

class DbusUint16 extends DbusType<number> {
  marshall(
    ctx: MarshallContext,
    val: number,
  ): Promise<void> {
    return ctx.marshallUint16(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<number> {
    return ctx.unmarshallUint16();
  }

  signature(): string {
    return "q";
  }
}

class DbusInt32 extends DbusType<number> {
  marshall(
    ctx: MarshallContext,
    val: number,
  ): Promise<void> {
    return ctx.marshallInt32(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<number> {
    return ctx.unmarshallInt32();
  }

  signature(): string {
    return "i";
  }
}

class DbusUint32 extends DbusType<number> {
  marshall(
    ctx: MarshallContext,
    val: number,
  ): Promise<void> {
    return ctx.marshallUint32(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<number> {
    return ctx.unmarshallUint32();
  }

  signature(): string {
    return "u";
  }
}

class DbusInt64 extends DbusType<bigint> {
  marshall(
    ctx: MarshallContext,
    val: bigint,
  ): Promise<void> {
    return ctx.marshallInt64(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<bigint> {
    return ctx.unmarshallInt64();
  }

  signature(): string {
    return "x";
  }
}

class DbusUint64 extends DbusType<bigint> {
  marshall(
    ctx: MarshallContext,
    val: bigint,
  ): Promise<void> {
    return ctx.marshallUint64(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<bigint> {
    return ctx.unmarshallUint64();
  }

  signature(): string {
    return "t";
  }
}

class DbusDouble extends DbusType<number> {
  marshall(
    ctx: MarshallContext,
    val: number,
  ): Promise<void> {
    return ctx.marshallDouble(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<number> {
    return ctx.unmarshallDouble();
  }

  signature(): string {
    return "d";
  }
}

class DbusString extends DbusType<string> {
  marshall(
    ctx: MarshallContext,
    val: string,
  ): Promise<void> {
    return ctx.marshallString(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<string> {
    return ctx.unmarshallString();
  }

  signature(): string {
    return "s";
  }
}

class DbusObjectPath extends DbusType<string> {
  marshall(
    ctx: MarshallContext,
    val: string,
  ): Promise<void> {
    return ctx.marshallPath(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<string> {
    return ctx.unmarshallPath();
  }

  signature(): string {
    return "o";
  }
}

class DbusSignature extends DbusType<string> {
  marshall(
    ctx: MarshallContext,
    val: string,
  ): Promise<void> {
    return ctx.marshallSignature(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<string> {
    return ctx.unmarshallSignature();
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
    ctx: MarshallContext,
    val: T[],
  ): Promise<void> {
    const dummy = new MarshallContext(new WritableStream(), ctx.endian);
    for (const v of val) {
      await this.elementType.marshall(dummy, v);
    }

    await uint32().marshall(ctx, dummy.pos);
    for (const v of val) {
      await this.elementType.marshall(ctx, v);
    }
  }

  async unmarshall(
    ctx: UnmarshallContext,
  ): Promise<T[]> {
    let remaining = await uint32().unmarshall(ctx);

    const result = [];
    while (remaining > 0) {
      const n = ctx.pos;
      result.push(await this.elementType.unmarshall(ctx));
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
    ctx: MarshallContext,
    val: T,
  ): Promise<void> {
    await ctx.align(8);

    for (let i = 0; i < this.items.length; i++) {
      await this.items[i].marshall(ctx, val[i]);
    }
  }

  async unmarshall(
    ctx: UnmarshallContext,
  ): Promise<T> {
    await ctx.align(8);

    const result = [];
    for (let i = 0; i < this.items.length; i++) {
      result.push(await this.items[i].unmarshall(ctx));
    }
    return result as T;
  }

  signature(): string {
    return `(${this.items.map((v) => v.signature()).join("")})`;
  }
}

//deno-lint-ignore no-explicit-any
class DbusVariant extends DbusType<Variant<any>> {
  async marshall(
    ctx: MarshallContext,
    //deno-lint-ignore no-explicit-any
    { type: ty, value: val }: Variant<any>,
  ): Promise<void> {
    await signature().marshall(ctx, ty.signature());
    await ty.marshall(ctx, val);
  }

  async unmarshall(
    ctx: UnmarshallContext,
    //deno-lint-ignore no-explicit-any
  ): Promise<Variant<any>> {
    const ty = parseSignature(await signature().unmarshall(ctx));
    const val = await ty.unmarshall(ctx);
    return new Variant(ty, val);
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
    ctx: MarshallContext,
    val: [K, V],
  ): Promise<void> {
    throw new Error("not implemented.");
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<[K, V]> {
    throw new Error("not implemented.");
  }

  signature(): string {
    return `{${this.key.signature()}${this.val.signature()}}`;
  }
}

class DbusUnixFd extends DbusType<number> {
  marshall(
    ctx: MarshallContext,
    val: number,
  ): Promise<void> {
    return ctx.marshallUnixFd(val);
  }

  unmarshall(
    ctx: UnmarshallContext,
  ): Promise<number> {
    return ctx.unmarshallUnixFd();
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

// ----
/*
const X = struct([string(), array(byte())]);
type X = TypeOf<typeof X>;
*/
