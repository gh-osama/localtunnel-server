import Client from './Client';
interface ClientManagerOptions {
    max_tcp_sockets?: number;
}
declare class ClientManager {
    private opt;
    private clients;
    private _stats;
    private debug;
    constructor(opt?: ClientManagerOptions);
    get stats(): {
        tunnels: number;
    };
    newClient(id?: string): Promise<{
        id: string;
        port: number;
        max_conn_count: number;
    }>;
    removeClient(id: string): void;
    hasClient(id: string): boolean;
    getClient(id: string): Client | undefined;
}
export default ClientManager;
