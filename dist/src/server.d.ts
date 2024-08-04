/// <reference types="node" />
import http from 'http';
interface ServerOptions {
    port?: number;
    secure?: boolean;
    domain?: string;
    max_tcp_sockets?: number;
    landing?: string;
}
export default function createServer(opt?: ServerOptions): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
export {};
