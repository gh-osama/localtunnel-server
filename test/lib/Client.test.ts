import assert from 'assert';
import http from 'http';
import { Duplex } from 'stream';
import WebSocket from 'ws';
import net from 'net';

import Client from '../../src/lib/Client';
import TunnelAgent from '../../src/lib/TunnelAgent';

class DummySocket extends Duplex {
    constructor(options?: any) {
        super(options);
    }

    _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
        callback();
    }

    _read(size: number): void {
        this.push('HTTP/1.1 304 Not Modified\r\nX-Powered-By: dummy\r\n\r\n\r\n');
        this.push(null);
    }
}

class DummyWebsocket extends Duplex {
    sentHeader: boolean;

    constructor(options?: any) {
        super(options);
        this.sentHeader = false;
    }

    _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
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

    _read(size: number): void {
        // nothing to implement
    }
}

class DummyAgent extends TunnelAgent {
    createConnection(options: any, cb: (err: Error | null, socket?: net.Socket) => void): void {
        cb(null, new DummySocket() as unknown as net.Socket);
    }
}

describe('Client', () => {
    it('should handle request', async () => {
        const agent = new DummyAgent();
        const client = new Client({ id: 'test', agent });

        const server = http.createServer((req, res) => {
            client.handleRequest(req, res);
        });

        await new Promise<void>(resolve => server.listen(resolve));

        const address = server.address() as net.AddressInfo;
        const opt = {
            host: 'localhost',
            port: address.port,
            path: '/',
        };

        const res = await new Promise<http.IncomingMessage>((resolve) => {
            const req = http.get(opt, (res) => {
                resolve(res);
            });
            req.end();
        });
        assert.equal(res.headers['x-powered-by'], 'dummy');
        server.close();
    });

    it('should handle upgrade', async () => {
        // need a websocket server and a socket for it
        class DummyWebsocketAgent extends http.Agent {
            createConnection(options: any, cb: (err: Error | null, socket?: net.Socket) => void): void {
                cb(null, new DummyWebsocket() as unknown as net.Socket);
            }
        }

        const agent = new DummyWebsocketAgent();
        const client = new Client({ id: 'test', agent: agent as unknown as TunnelAgent });

        const server = http.createServer();
        server.on('upgrade', (req, socket, head) => {
            client.handleUpgrade(req, socket);
        });

        await new Promise<void>(resolve => server.listen(resolve));

        const address = server.address() as net.AddressInfo;

        const netClient = await new Promise<net.Socket>((resolve) => {
            const newClient = net.createConnection({ port: address.port }, () => {
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
            const data = await new Promise<string>((resolve) => {
                netClient.once('data', (chunk) => {
                    resolve(chunk.toString());
                });
            });
            const exp = [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
            ];
            assert.equal(exp.join('\r\n') + '\r\n\r\n', data);
        }

        {
            netClient.write('foobar');
            const data = await new Promise<string>((resolve) => {
                netClient.once('data', (chunk) => {
                    resolve(chunk.toString());
                });
            });
            assert.equal('foobar', data);
        }

        netClient.destroy();
        server.close();
    });
});