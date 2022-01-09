import { Client } from "../client.ts";

const client = await Client.connect("unix:path=/run/user/1000/bus");
try {
  const result = await client.request(
    "/org/freedesktop/DBus",
    "org.freedesktop.DBus",
    "org.freedesktop.DBus",
    "GetId",
    [],
  );
  console.log("OK", result);
} finally {
  await client.close();
}
