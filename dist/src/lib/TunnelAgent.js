"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const net_1 = __importDefault(require("net"));
const debug_1 = __importDefault(require("debug"));
class TunnelAgent extends http_1.Agent {
    constructor(options = {}) {
        super({
            keepAlive: true,
            maxFreeSockets: 1,
        });
        this._started = false;
        this.availableSockets = [];
        this.waitingCreateConn = [];
        this.debug = (0, debug_1.default)(`lt:TunnelAgent[${options.clientId}]`);
        this.connectedSockets = 0;
        this.maxTcpSockets = options.maxSockets || 10;
        this.server = net_1.default.createServer();
        this.closed = false;
    }
    get started() {
        return this._started;
    }
    stats() {
        return {
            connectedSockets: this.connectedSockets,
        };
    }
    listen() {
        const server = this.server;
        if (this._started) {
            throw new Error('already started');
        }
        this._started = true;
        server.on('close', this._onClose.bind(this));
        server.on('connection', this._onConnection.bind(this));
        server.on('error', (err) => {
            if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
                return;
            }
            console.error(err);
        });
        return new Promise((resolve) => {
            server.listen(() => {
                const address = server.address();
                this.debug('tcp server listening on port: %d', address.port);
                resolve({
                    port: address.port,
                });
            });
        });
    }
    _onClose() {
        this.closed = true;
        this.debug('closed tcp socket');
        for (const conn of this.waitingCreateConn) {
            conn(new Error('closed'));
        }
        this.waitingCreateConn = [];
        this.emit('end');
    }
    _onConnection(socket) {
        if (this.connectedSockets >= this.maxTcpSockets) {
            this.debug('no more sockets allowed');
            socket.destroy();
            return false;
        }
        socket.once('close', (hadError) => {
            this.debug('closed socket (error: %s)', hadError);
            this.connectedSockets -= 1;
            const idx = this.availableSockets.indexOf(socket);
            if (idx >= 0) {
                this.availableSockets.splice(idx, 1);
            }
            this.debug('connected sockets: %s', this.connectedSockets);
            if (this.connectedSockets <= 0) {
                this.debug('all sockets disconnected');
                this.emit('offline');
            }
        });
        socket.once('error', (err) => {
            socket.destroy();
        });
        if (this.connectedSockets === 0) {
            this.emit('online');
        }
        this.connectedSockets += 1;
        const addr = socket.address();
        this.debug('new connection from: %s:%s', addr.address, addr.port);
        const fn = this.waitingCreateConn.shift();
        if (fn) {
            this.debug('giving socket to queued conn request');
            setTimeout(() => {
                fn(null, socket);
            }, 0);
            return;
        }
        this.availableSockets.push(socket);
    }
    createConnection(options, cb) {
        if (this.closed) {
            cb(new Error('closed'));
            return;
        }
        this.debug('create connection');
        const sock = this.availableSockets.shift();
        if (!sock) {
            this.waitingCreateConn.push(cb);
            this.debug('waiting connected: %s', this.connectedSockets);
            this.debug('waiting available: %s', this.availableSockets.length);
            return;
        }
        this.debug('socket given');
        cb(null, sock);
    }
    destroy() {
        this.server.close();
        super.destroy();
    }
}
exports.default = TunnelAgent;
