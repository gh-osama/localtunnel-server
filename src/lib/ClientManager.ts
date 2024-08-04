import { hri } from 'human-readable-ids';
import Debug from 'debug';

import Client from './Client';
import TunnelAgent from './TunnelAgent';

interface ClientManagerOptions {
  max_tcp_sockets?: number;
}

class ClientManager {
  private opt: ClientManagerOptions;
  private clients: { [id: string]: Client };
  private _stats: { tunnels: number };
  private debug: Debug.Debugger;

  constructor(opt: ClientManagerOptions = {}) {
    this.opt = opt;
    this.clients = {};
    this._stats = {
      tunnels: 0
    };
    this.debug = Debug('lt:ClientManager');
  }

  public get stats() {
    return this._stats;
  }

  async newClient(id?: string): Promise<{ id: string; port: number; max_conn_count: number }> {
    const clients = this.clients;
    const stats = this._stats;

    if (id && clients[id]) {
      id = hri.random();
    }

    const maxSockets = this.opt.max_tcp_sockets || 10;
    const agent = new TunnelAgent({
      clientId: id,
      maxSockets: 10,
    });

    const client = new Client({
      id: id!,
      agent,
    });

    clients[id!] = client;

    client.once('close', () => {
      this.removeClient(id!);
    });

    try {
      const info = await agent.listen();
      ++stats.tunnels;
      return {
        id: id!,
        port: info.port,
        max_conn_count: maxSockets,
      };
    }
    catch (err) {
      this.removeClient(id!);
      throw err;
    }
  }

  removeClient(id: string): void {
    this.debug('removing client: %s', id);
    const client = this.clients[id];
    if (!client) {
      return;
    }
    --this._stats.tunnels;
    delete this.clients[id];
    client.close();
  }

  hasClient(id: string): boolean {
    return !!this.clients[id];
  }

  getClient(id: string): Client | undefined {
    return this.clients[id];
  }
}

export default ClientManager;