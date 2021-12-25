abstract class DbusType<Output> {
  readonly _output!: Output;
}

class DbusByte extends DbusType<number> {
}

class DbusBoolean extends DbusType<boolean> {
}

class DbusInt16 extends DbusType<number> {
}

class DbusUint16 extends DbusType<number> {
}

class DbusInt32 extends DbusType<number> {
}

class DbusUint32 extends DbusType<number> {
}

class DbusInt64 extends DbusType<bigint> {
}

class DbusUint64 extends DbusType<bigint> {
}

class DbusDouble extends DbusType<number> {
}

class DbusString extends DbusType<string> {
}

class DbusObjectPath extends DbusType<string> {
}

class DbusSignature extends DbusType<string> {
}

class DbusArray<T> extends DbusType<T[]> {
  elementType: DbusType<T>;
  constructor(elementType: DbusType<T>) {
    super();
    this.elementType = elementType;
  }
}

class DbusStruct<T extends [any, ...any]> extends DbusType<T> {
  // Mapped Tuple Type
  items: { [P in keyof T]: DbusType<T[P]> };
  constructor(items: { [P in keyof T]: DbusType<T[P]> }) {
    super();
    this.items = items;
  }
}

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

type TypeOf<T extends DbusType<any>> = T['_output'];

const _byte = new DbusByte();
function byte(): DbusByte {
  return _byte;
}

const _boolean = new DbusBoolean();
function boolean(): DbusBoolean {
  return _boolean;
}

const _int16 = new DbusInt16();
function int16(): DbusInt16 {
  return _int16;
}

const _uint16 = new DbusUint16();
function uint16(): DbusUint16 {
  return _uint16;
}

const _int32 = new DbusInt32();
function int32(): DbusInt32 {
  return _int32;
}

const _uint32 = new DbusUint32();
function uint32(): DbusUint32 {
  return _uint32;
}

const _int64 = new DbusInt64();
function int64(): DbusInt64 {
  return _int64;
}

const _uint64 = new DbusUint64();
function uint64(): DbusUint64 {
  return _uint64;
}

const _double = new DbusDouble();
function double(): DbusDouble {
  return _double;
}

const _string = new DbusString();
function string(): DbusString {
  return _string;
}

const _objectPath = new DbusObjectPath();
function objectPath(): DbusObjectPath {
  return _objectPath;
}

const _signature = new DbusSignature();
function signature(): DbusSignature {
  return _signature;
}

function array<T>(elementType: DbusType<T>): DbusArray<T> {
  return new DbusArray(elementType);
}

function struct<T extends [any, ...any[]]>(items: { [P in keyof T]: DbusType<T[P]> }): DbusStruct<T> {
  return new DbusStruct<T>(items);
}

const _variant = new DbusVariant();
function variant(): DbusVariant {
  return _variant;
}

function dictEntry<K, V>(key: DbusType<K>, val: DbusType<V>): DbusDictEntry<K, V> {
  return new DbusDictEntry(key, val);
}

const _unixFd = new DbusUnixFd();
function unixFd(): DbusUnixFd {
  return _unixFd;
}

// ----
const X = struct([string(), array(byte())]);
type X = TypeOf<typeof X>;
