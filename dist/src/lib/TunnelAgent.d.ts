/// <reference types="node" />
/// <reference types="node" />
import { Agent } from 'http';
import net from 'net';
interface TunnelAgentOptions {
    clientId?: string;
    maxSockets?: number;
}
declare class TunnelAgent extends Agent {
    private availableSockets;
    private waitingCreateConn;
    private debug;
    private connectedSockets;
    private maxTcpSockets;
    private server;
    private _started;
    private closed;
    constructor(options?: TunnelAgentOptions);
    get started(): boolean;
    stats(): {
        connectedSockets: number;
    };
    listen(): Promise<{
        port: number;
    }>;
    private _onClose;
    private _onConnection;
    createConnection(options: any, cb: (err: Error | null, socket?: net.Socket) => void): void;
    destroy(): void;
}
export default TunnelAgent;
