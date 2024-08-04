"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const ws_1 = __importDefault(require("ws"));
const ws_2 = require("ws");
const net_1 = __importDefault(require("net"));
const server_1 = __importDefault(require("../src/server"));
describe('Server', () => {
    it('server starts and stops', async () => {
        const server = (0, server_1.default)();
        await new Promise((resolve, reject) => server.listen((err) => err ? reject(err) : resolve()));
        await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    });
    it('should redirect root requests to landing page', async () => {
        const server = (0, server_1.default)();
        const res = await (0, supertest_1.default)(server).get('/');
        expect(res.headers.location).toBe('https://localtunnel.github.io/www/');
    });
    it('should support custom base domains', async () => {
        const server = (0, server_1.default)({
            domain: 'domain.example.com',
        });
        const res = await (0, supertest_1.default)(server).get('/');
        expect(res.headers.location).toBe('https://localtunnel.github.io/www/');
    });
    it('reject long domain name requests', async () => {
        const server = (0, server_1.default)();
        const res = await (0, supertest_1.default)(server).get('/thisdomainisoutsidethesizeofwhatweallowwhichissixtythreecharacters');
        expect(res.body.message).toBe('Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.');
    });
    it('should upgrade websocket requests', async () => {
        const hostname = 'websocket-test';
        const server = (0, server_1.default)({
            domain: 'example.com',
        });
        await new Promise((resolve, reject) => server.listen((err) => err ? reject(err) : resolve()));
        const res = await (0, supertest_1.default)(server).get('/websocket-test');
        const localTunnelPort = res.body.port;
        const wss = await new Promise((resolve) => {
            const wsServer = new ws_2.WebSocketServer({ port: 0 }, () => {
                resolve(wsServer);
            });
        });
        const websocketServerPort = wss.address().port;
        const ltSocket = net_1.default.createConnection({ port: localTunnelPort });
        const wsSocket = net_1.default.createConnection({ port: websocketServerPort });
        ltSocket.pipe(wsSocket).pipe(ltSocket);
        wss.once('connection', (ws) => {
            ws.once('message', (message) => {
                ws.send(message);
            });
        });
        const ws = new ws_1.default(`http://localhost:${server.address().port}`, {
            headers: {
                host: `${hostname}.example.com`,
            }
        });
        ws.on('open', () => {
            ws.send('something');
        });
        await new Promise((resolve) => {
            ws.once('message', (msg) => {
                expect(msg).toBe('something');
                resolve();
            });
        });
        wss.close();
        await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    });
    it('should support the /api/tunnels/:id/status endpoint', async () => {
        const server = (0, server_1.default)();
        await new Promise((resolve, reject) => server.listen((err) => err ? reject(err) : resolve()));
        // no such tunnel yet
        const res = await (0, supertest_1.default)(server).get('/api/tunnels/foobar-test/status');
        expect(res.statusCode).toBe(404);
        // request a new client called foobar-test
        {
            const res = await (0, supertest_1.default)(server).get('/foobar-test');
        }
        {
            const res = await (0, supertest_1.default)(server).get('/api/tunnels/foobar-test/status');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                connected_sockets: 0,
            });
        }
        await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    });
});
