/// <reference types="node" />
/// <reference types="node" />
import http from 'http';
import { EventEmitter } from 'events';
import TunnelAgent from './TunnelAgent';
interface ClientOptions {
    id: string;
    agent: TunnelAgent;
}
declare class Client extends EventEmitter {
    private agent;
    private id;
    private debug;
    private graceTimeout;
    constructor(options: ClientOptions);
    stats(): {
        connectedSockets: number;
    };
    close(): void;
    handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void;
    handleUpgrade(req: http.IncomingMessage, socket: any): void;
}
export default Client;
