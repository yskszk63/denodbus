import * as endian from "./endian.ts";
import * as t from "./types.ts";

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

export class Message {
  endian: endian.Endian;
  type: MessageType;
  flags: Set<Flags>;
  protocolVersion: 1;
  serial: number;
  headers: [FieldName, t.Variant<any>][];
  body: t.Variant<any>[];

  constructor(
    endian: endian.Endian,
    type: MessageType,
    flags: Set<Flags>,
    protocolVersion: 1,
    serial: number,
    headers: [FieldName, t.Variant<any>][],
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

  async marshall(out: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
    throw new Error("not implemented.");
  }

  static async unmarshall(input: ReadableStreamBYOBReader): Promise<Message> {
    throw new Error("not implemented");
  }
}
