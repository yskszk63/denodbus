export type AuthCommand = {
  command: "AUTH",
  mechanism: string,
  initialResponse: Uint8Array | string,
}

export type CancelCommand = {
  command: "CANCEL",
}

export type BeginCommand = {
  command: "BEGIN",
}

export type DataCommand = {
  command: "DATA",
  data: Uint8Array | string,
}

export type ErrorCommand = {
  command: "ERROR",
  explanation: string,
}

export type NegotiateUnixFdCommand = {
  command: "NEGOTIATE_UNIX_FD",
}

export type RejectedCommand = {
  command: "REJECTED",
  mechanisms: string[],
}

export type OkCommand = {
  command: "OK",
  guid: Uint8Array,
}

export type AgreeUnixFdCommand = {
  command: "AGREE_UNIX_FD",
}

export type ClientToServerCommand = AuthCommand | CancelCommand | BeginCommand | DataCommand | ErrorCommand | NegotiateUnixFdCommand;

export type ServerToClientCommand = RejectedCommand | OkCommand | DataCommand | ErrorCommand | AgreeUnixFdCommand;

function toHex(m: Uint8Array | string): string {
  const b = typeof m === 'string' ? new TextEncoder().encode(m) : m;
  return Array.from(b, v => {
    const h = v.toString(16);
    return h.length === 1 ? "0" + h : h;
  }).join("");
}

function fromHex(m: string): Uint8Array {
  if (m.length % 2 !== 0) {
    throw new Error();
  }

  const bytes = Array.from((function*() {
    let rest = m;
    while (rest.length) {
      const v = rest.slice(0, 2);
      yield parseInt(v, 16);
      rest = rest.slice(2);
    }
  })());
  return Uint8Array.from(bytes);
}

function encode(command: ClientToServerCommand): string {
  switch (command.command) {
    case "AUTH": return `AUTH ${command.mechanism} ${toHex(command.initialResponse)}`;
    case "CANCEL": return "CANCEL";
    case "BEGIN": return "BEGIN";
    case "DATA": return `DATA ${toHex(command.data)}`;
    case "ERROR": return `ERROR ${command.explanation}`;
    case "NEGOTIATE_UNIX_FD": return "NEGOTIATE_UNIX_FD";
  }
}

function decode(text: string): ServerToClientCommand {
  const [command, rest] = text.split(' ', 2);
  switch (command) {
    case "REJECTED": return { command: "REJECTED", mechanisms: rest.split(' ') };
    case "OK": return { command: "OK", guid: fromHex(rest) };
    case "DATA": return { command: "DATA", data: fromHex(rest) };
    case "ERROR": return { command: "ERROR", explanation: rest };
    case "AGREE_UNIX_FD": return { command: "AGREE_UNIX_FD" };
    default: throw new Error(`unknown command ${command}`);
  }
}

export async function send(command: ClientToServerCommand, out: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
  const encoded = encode(command) + "\r\n";
  await out.write(new TextEncoder().encode(encoded));
}

async function readline(input: ReadableStreamBYOBReader): Promise<string> {
  const buf = [];
  while (true) {
    const result = await input.read(new Uint8Array(1));
    if (result.done) {
      throw new Error('unexpected EOF.');
    }
    if (result.value.length !== 1) {
      throw new Error();
    }
    buf.push(result.value[0]);
    if (buf.at(-2) === 0x0d && buf.at(-1) === 0x0a) {
      return new TextDecoder().decode(Uint8Array.from(buf.slice(0, buf.length - 2)));
    }
  }
}

export async function recv(input: ReadableStreamBYOBReader): Promise<ServerToClientCommand> {
  const line = await readline(input);
  return decode(line);
}
