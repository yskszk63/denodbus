import { BIG_ENDIAN, Endian, LITTLE_ENDIAN } from "./endian.ts";
import * as t from "./types.ts";
import { MarshallContext, UnmarshallContext } from "./marshall.ts";

export const METHOD_CALL = 1;
export const METHOD_RETURN = 2;
export const ERROR = 3;
export const SIGNAL = 4;

export type MessageType =
  | typeof METHOD_CALL
  | typeof METHOD_RETURN
  | typeof ERROR
  | typeof SIGNAL;

export const NO_REPLY_EXPECTED = 0x0000_0001;
export const NO_AUTO_START = 0x0000_0010;
export const ALLOW_INTERACTIVE_AUTHORIZATION = 0x0000_0100;

export type Flags =
  | typeof NO_REPLY_EXPECTED
  | typeof NO_AUTO_START
  | typeof ALLOW_INTERACTIVE_AUTHORIZATION;

export const PATH = 1;
export const INTERFACE = 2;
export const MEMBER = 3;
export const ERROR_NAME = 4;
export const REPLY_SERIAL = 5;
export const DESTINATION = 6;
export const SENDER = 7;
export const SIGNATURE = 8;
export const UNIX_FDS = 9;

export type FieldName =
  | typeof PATH
  | typeof INTERFACE
  | typeof MEMBER
  | typeof ERROR_NAME
  | typeof REPLY_SERIAL
  | typeof DESTINATION
  | typeof SENDER
  | typeof SIGNATURE
  | typeof UNIX_FDS;

function endianToNumber(endian: Endian): number {
  switch (endian) {
    case LITTLE_ENDIAN:
      return 0x6c;
    case BIG_ENDIAN:
      return 0x42;
  }
}

function numberToEndian(val: number): Endian {
  switch (val) {
    case 0x6c:
      return LITTLE_ENDIAN;
    case 0x42:
      return BIG_ENDIAN;
    default:
      throw new Error(`unknown endian ${val}`);
  }
}

function isMessageType(val: unknown): val is MessageType {
  switch (val) {
    case METHOD_CALL:
      return true;
    case METHOD_RETURN:
      return true;
    case ERROR:
      return true;
    case SIGNAL:
      return true;
    default:
      return false;
  }
}

function flagsToNumber(flags: Set<Flags>): number {
  let val = 0;
  for (const f of flags) {
    val |= f;
  }
  return val;
}

function numberToFlags(val: number): Set<Flags> {
  if (
    (val &
      (0xFF ^
        (NO_REPLY_EXPECTED | NO_AUTO_START |
          ALLOW_INTERACTIVE_AUTHORIZATION))) !== 0
  ) {
    throw new Error(`unknown flag contained. ${val}`);
  }

  const r = new Set<Flags>();

  for (
    const f of [
      NO_REPLY_EXPECTED,
      NO_AUTO_START,
      ALLOW_INTERACTIVE_AUTHORIZATION,
    ] as Flags[]
  ) {
    if (val & f) {
      r.add(f);
    }
  }

  return r;
}

function checkHeader(
  [name, val]: [number, t.Variant<any>],
): [FieldName, t.Variant<any>] {
  switch (name) {
    case PATH:
      return [name, val];
    case INTERFACE:
      return [name, val];
    case MEMBER:
      return [name, val];
    case ERROR_NAME:
      return [name, val];
    case REPLY_SERIAL:
      return [name, val];
    case DESTINATION:
      return [name, val];
    case SENDER:
      return [name, val];
    case SIGNATURE:
      return [name, val];
    case UNIX_FDS:
      return [name, val];
    default:
      throw new Error(`unknown header ${name}`);
  }
}

const headerty = t.array(t.struct([t.byte(), t.variant()]));

function parseSignatures(signature: string): t.DbusType<any>[] {
  const result = [] as t.DbusType<any>[];
  const ctx = { pos: 0 };
  while (ctx.pos < signature.length) {
    result.push(t.parseSignature(signature, ctx));
  }
  return result;
}

async function unmarshallBody(
  ctx: UnmarshallContext,
  length: number,
  headers: Map<FieldName, t.Variant<any>>,
): Promise<t.Variant<any>[]> {
  if (!headers.has(SIGNATURE)) {
    return [];
  }
  const signature = headers.get(SIGNATURE)?.value;
  if (typeof signature !== "string") {
    throw new Error("unexpected header value");
  }

  let end = ctx.pos + length;
  const types = parseSignatures(signature);
  const result = [] as t.Variant<any>[];
  for (const ty of types) {
    const item = await ty.unmarshall(ctx);
    result.push(new t.Variant(ty, item));
  }
  if (ctx.pos > end) {
    throw new Error("overrun");
  }
  return result;
}

export class Message {
  endian: Endian;
  type: MessageType;
  flags: Set<Flags>;
  protocolVersion: 1;
  serial: number;
  headers: Map<FieldName, t.Variant<any>>;
  body: t.Variant<any>[];

  constructor(
    endian: Endian,
    type: MessageType,
    flags: Set<Flags>,
    protocolVersion: 1,
    serial: number,
    headers: Map<FieldName, t.Variant<any>>,
    body: t.Variant<any>[],
  ) {
    this.endian = endian;
    this.type = type;
    this.flags = flags;
    this.protocolVersion = protocolVersion;
    this.serial = serial;
    this.headers = headers;
    this.body = body;
  }

  async marshall(stream: WritableStream<Uint8Array>): Promise<void> {
    const dummy = new MarshallContext(new WritableStream(), this.endian);
    for (const b of this.body) {
      b.value.marshall(dummy);
    }

    const ctx = new MarshallContext(stream, this.endian);
    try {
      await t.byte().marshall(ctx, endianToNumber(this.endian));
      await t.byte().marshall(ctx, this.type);
      await t.byte().marshall(ctx, flagsToNumber(this.flags));
      await t.byte().marshall(ctx, this.protocolVersion);
      await t.uint32().marshall(ctx, dummy.pos);
      await t.uint32().marshall(ctx, this.serial);
      await headerty.marshall(ctx, Array.from(this.headers));

      await ctx.align(8);
      for (const b of this.body) {
        b.value.marshall(ctx);
      }
    } finally {
      ctx.release();
    }
  }

  static async unmarshall(
    stream: ReadableStream<Uint8Array>,
  ): Promise<Message> {
    const ctx = new UnmarshallContext(stream);
    try {
      const endian = await t.byte().unmarshall(ctx).then(numberToEndian);
      ctx.endian = endian;

      const type = await t.byte().unmarshall(ctx);
      if (!isMessageType(type)) {
        throw new Error(`unknown message type ${type}`);
      }

      const flags = await t.byte().unmarshall(ctx).then(numberToFlags);

      const protocolVersion = await t.byte().unmarshall(ctx);
      if (protocolVersion !== 1) {
        throw new Error(`unknown protocol version. ${protocolVersion}`);
      }

      const bodyLength = await t.uint32().unmarshall(ctx);
      const serial = await t.uint32().unmarshall(ctx);
      const headers = await headerty.unmarshall(ctx).then((a) =>
        new Map(a.map(checkHeader))
      );

      ctx.align(8);
      const body = await unmarshallBody(ctx, bodyLength, headers);
      return new Message(
        endian,
        type,
        flags,
        protocolVersion,
        serial,
        headers,
        body,
      );
    } finally {
      ctx.release();
    }
  }
}
