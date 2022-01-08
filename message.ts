import * as endian from "./endian.ts";
import * as t from "./types.ts";

export const INVALID = 0;
export const METHOD_CALL = 1;
export const METHOD_RETURN = 2;
export const ERROR = 3;
export const SIGNAL = 4;

export type MessageType =
  | typeof INVALID
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

export class Message {
  endian: endian.Endian;
  type: MessageType;
  flags: Set<Flags>;
  protocolVersion: 1;
  serial: number;
  headers: [number, [t.DbusType<any>, any]][];
  body: [t.DbusType<any>[], any];

  constructor(
    endian: endian.Endian,
    type: MessageType,
    flags: Set<Flags>,
    protocolVersion: 1,
    serial: number,
    headers: [number, [t.DbusType<any>, any]][],
    body: [t.DbusType<any>[], any],
  ) {
    this.endian = endian;
    this.type = type;
    this.flags = flags;
    this.protocolVersion = protocolVersion;
    this.serial = serial;
    this.headers = headers;
    this.body = body;
  }
}
