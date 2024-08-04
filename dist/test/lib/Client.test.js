"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const http_1 = __importDefault(require("http"));
const stream_1 = require("stream");
const net_1 = __importDefault(require("net"));
const Client_1 = __importDefault(require("../../src/lib/Client"));
const TunnelAgent_1 = __importDefault(require("../../src/lib/TunnelAgent"));
class DummySocket extends stream_1.Duplex {
    constructor(options) {
        super(options);
    }
    _write(chunk, encoding, callback) {
        callback();
    }
    _read(size) {
        this.push('HTTP/1.1 304 Not Modified\r\nX-Powered-By: dummy\r\n\r\n\r\n');
        this.push(null);
    }
}
class DummyWebsocket extends stream_1.Duplex {
    constructor(options) {
        super(options);
        this.sentHeader = false;
    }
    _write(chunk, encoding, callback) {
        const str = chunk.toString();
        // if chunk contains `GET / HTTP/1.1` -> queue headers
        // otherwise echo back received data
        if (str.indexOf('GET / HTTP/1.1') === 0) {
            const arr = [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
            ];
            this.push(arr.join('\r\n'));
            this.push('\r\n\r\n');
        }
        else {
            this.push(str);
        }
        callback();
    }
    _read(size) {
        // nothing to implement
    }
}
class DummyAgent extends TunnelAgent_1.default {
    createConnection(options, cb) {
        cb(null, new DummySocket());
    }
}
describe('Client', () => {
    it('should handle request', async () => {
        const agent = new DummyAgent();
        const client = new Client_1.default({ id: 'test', agent });
        const server = http_1.default.createServer((req, res) => {
            client.handleRequest(req, res);
        });
        await new Promise(resolve => server.listen(resolve));
        const address = server.address();
        const opt = {
            host: 'localhost',
            port: address.port,
            path: '/',
        };
        const res = await new Promise((resolve) => {
            const req = http_1.default.get(opt, (res) => {
                resolve(res);
            });
            req.end();
        });
        assert_1.default.equal(res.headers['x-powered-by'], 'dummy');
        server.close();
    });
    it('should handle upgrade', async () => {
        // need a websocket server and a socket for it
        class DummyWebsocketAgent extends http_1.default.Agent {
            createConnection(options, cb) {
                cb(null, new DummyWebsocket());
            }
        }
        const agent = new DummyWebsocketAgent();
        const client = new Client_1.default({ id: 'test', agent: agent });
        const server = http_1.default.createServer();
        server.on('upgrade', (req, socket, head) => {
            client.handleUpgrade(req, socket);
        });
        await new Promise(resolve => server.listen(resolve));
        const address = server.address();
        const netClient = await new Promise((resolve) => {
            const newClient = net_1.default.createConnection({ port: address.port }, () => {
                resolve(newClient);
            });
        });
        const out = [
            'GET / HTTP/1.1',
            'Connection: Upgrade',
            'Upgrade: websocket'
        ];
        netClient.write(out.join('\r\n') + '\r\n\r\n');
        {
            const data = await new Promise((resolve) => {
                netClient.once('data', (chunk) => {
                    resolve(chunk.toString());
                });
            });
            const exp = [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
            ];
            assert_1.default.equal(exp.join('\r\n') + '\r\n\r\n', data);
        }
        {
            netClient.write('foobar');
            const data = await new Promise((resolve) => {
                netClient.once('data', (chunk) => {
                    resolve(chunk.toString());
                });
            });
            assert_1.default.equal('foobar', data);
        }
        netClient.destroy();
        server.close();
    });
});
