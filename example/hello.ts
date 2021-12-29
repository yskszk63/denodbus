import { Client } from '../client.ts';

const client = await Client.connect('unix:path=/run/user/1000/bus');
