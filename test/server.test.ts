import request from 'supertest';
import { strict as assert } from 'assert';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import net from 'net';

import createServer from '../src/server';

describe('Server', () => {
    it('server starts and stops', async () => {
        const server = createServer();
        await new Promise<void>((resolve, reject) => server.listen((err?: Error) => err ? reject(err) : resolve()));
        await new Promise<void>((resolve, reject) => server.close((err?: Error) => err ? reject(err) : resolve()));
    });

    it('should redirect root requests to landing page', async () => {
        const server = createServer();
        const res = await request(server).get('/');
        expect(res.headers.location).toBe('https://localtunnel.github.io/www/');
    });

    it('should support custom base domains', async () => {
        const server = createServer({
            domain: 'domain.example.com',
        });

        const res = await request(server).get('/');
        expect(res.headers.location).toBe('https://localtunnel.github.io/www/');
    });

    it('reject long domain name requests', async () => {
        const server = createServer();
        const res = await request(server).get('/thisdomainisoutsidethesizeofwhatweallowwhichissixtythreecharacters');
        expect(res.body.message).toBe('Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.');
    });

    it('should upgrade websocket requests', async () => {
        const hostname = 'websocket-test';
        const server = createServer({
            domain: 'example.com',
        });
        await new Promise<void>((resolve, reject) => server.listen((err?: Error) => err ? reject(err) : resolve()));

        const res = await request(server).get('/websocket-test');
        const localTunnelPort = res.body.port;

        const wss = await new Promise<WebSocketServer>((resolve) => {
            const wsServer = new WebSocketServer({ port: 0 }, () => {
                resolve(wsServer);
            });
        });

        const websocketServerPort = (wss.address() as net.AddressInfo).port;

        const ltSocket = net.createConnection({ port: localTunnelPort });
        const wsSocket = net.createConnection({ port: websocketServerPort });
        ltSocket.pipe(wsSocket).pipe(ltSocket);

        wss.once('connection', (ws) => {
            ws.once('message', (message) => {
                ws.send(message);
            });
        });

        const ws = new WebSocket(`http://localhost:${(server.address() as net.AddressInfo).port}`, {
            headers: {
                host: `${hostname}.example.com`,
            }
        });

        ws.on('open', () => {
            ws.send('something');
        });

        await new Promise<void>((resolve) => {
            ws.once('message', (msg) => {
                expect(msg).toBe('something');
                resolve();
            });
        });

        wss.close();
        await new Promise<void>((resolve, reject) => server.close((err?: Error) => err ? reject(err) : resolve()));
    });

    it('should support the /api/tunnels/:id/status endpoint', async () => {
        const server = createServer();
        await new Promise<void>((resolve, reject) => server.listen((err?: Error) => err ? reject(err) : resolve()));

        // no such tunnel yet
        const res = await request(server).get('/api/tunnels/foobar-test/status');
        expect(res.statusCode).toBe(404);

        // request a new client called foobar-test
        {
            const res = await request(server).get('/foobar-test');
        }

        {
            const res = await request(server).get('/api/tunnels/foobar-test/status');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                connected_sockets: 0,
            });
        }

        await new Promise<void>((resolve, reject) => server.close((err?: Error) => err ? reject(err) : resolve()));
    });
});