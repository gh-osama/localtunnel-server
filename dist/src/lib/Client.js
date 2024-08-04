"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const debug_1 = __importDefault(require("debug"));
const pump_1 = __importDefault(require("pump"));
const events_1 = require("events");
class Client extends events_1.EventEmitter {
    constructor(options) {
        super();
        const agent = this.agent = options.agent;
        const id = this.id = options.id;
        this.debug = (0, debug_1.default)(`lt:Client[${this.id}]`);
        this.graceTimeout = setTimeout(() => {
            this.close();
        }, 1000);
        agent.on('online', () => {
            this.debug('client online %s', id);
            clearTimeout(this.graceTimeout);
        });
        agent.on('offline', () => {
            this.debug('client offline %s', id);
            clearTimeout(this.graceTimeout);
            this.graceTimeout = setTimeout(() => {
                this.close();
            }, 1000);
        });
        agent.once('error', (err) => {
            this.close();
        });
    }
    stats() {
        return this.agent.stats();
    }
    close() {
        clearTimeout(this.graceTimeout);
        this.agent.destroy();
        this.emit('close');
    }
    handleRequest(req, res) {
        this.debug('> %s', req.url);
        const opt = {
            path: req.url,
            agent: this.agent,
            method: req.method,
            headers: req.headers
        };
        const clientReq = http_1.default.request(opt, (clientRes) => {
            this.debug('< %s', req.url);
            res.writeHead(clientRes.statusCode, clientRes.headers);
            (0, pump_1.default)(clientRes, res);
        });
        clientReq.once('error', (err) => {
            // TODO: if headers not sent - respond with gateway unavailable
        });
        (0, pump_1.default)(req, clientReq);
    }
    handleUpgrade(req, socket) {
        this.debug('> [up] %s', req.url);
        socket.once('error', (err) => {
            if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
                return;
            }
            console.error(err);
        });
        this.agent.createConnection({}, (err, conn) => {
            this.debug('< [up] %s', req.url);
            if (err) {
                socket.end();
                return;
            }
            if (!socket.readable || !socket.writable) {
                conn.destroy();
                socket.end();
                return;
            }
            const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
            for (let i = 0; i < (req.rawHeaders.length - 1); i += 2) {
                arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
            }
            arr.push('');
            arr.push('');
            (0, pump_1.default)(conn, socket);
            (0, pump_1.default)(socket, conn);
            conn.write(arr.join('\r\n'));
        });
    }
}
exports.default = Client;
