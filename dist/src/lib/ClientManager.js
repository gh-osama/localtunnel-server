"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const human_readable_ids_1 = require("human-readable-ids");
const debug_1 = __importDefault(require("debug"));
const Client_1 = __importDefault(require("./Client"));
const TunnelAgent_1 = __importDefault(require("./TunnelAgent"));
class ClientManager {
    constructor(opt = {}) {
        this.opt = opt;
        this.clients = {};
        this._stats = {
            tunnels: 0
        };
        this.debug = (0, debug_1.default)('lt:ClientManager');
    }
    get stats() {
        return this._stats;
    }
    async newClient(id) {
        const clients = this.clients;
        const stats = this._stats;
        if (id && clients[id]) {
            id = human_readable_ids_1.hri.random();
        }
        const maxSockets = this.opt.max_tcp_sockets || 10;
        const agent = new TunnelAgent_1.default({
            clientId: id,
            maxSockets: 10,
        });
        const client = new Client_1.default({
            id: id,
            agent,
        });
        clients[id] = client;
        client.once('close', () => {
            this.removeClient(id);
        });
        try {
            const info = await agent.listen();
            ++stats.tunnels;
            return {
                id: id,
                port: info.port,
                max_conn_count: maxSockets,
            };
        }
        catch (err) {
            this.removeClient(id);
            throw err;
        }
    }
    removeClient(id) {
        this.debug('removing client: %s', id);
        const client = this.clients[id];
        if (!client) {
            return;
        }
        --this._stats.tunnels;
        delete this.clients[id];
        client.close();
    }
    hasClient(id) {
        return !!this.clients[id];
    }
    getClient(id) {
        return this.clients[id];
    }
}
exports.default = ClientManager;
