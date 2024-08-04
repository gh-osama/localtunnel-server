"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const net_1 = __importDefault(require("net"));
const TunnelAgent_1 = __importDefault(require("../../src/lib/TunnelAgent"));
describe('TunnelAgent', () => {
    it('should create an empty agent', async () => {
        const agent = new TunnelAgent_1.default();
        expect(agent.started).toBe(false);
        const info = await agent.listen();
        expect(info.port).toBeGreaterThan(0);
        agent.destroy();
    });
    it('should create a new server and accept connections', async () => {
        const agent = new TunnelAgent_1.default();
        expect(agent.started).toBe(false);
        const info = await agent.listen();
        const sock = net_1.default.createConnection({ port: info.port });
        // in this test we wait for the socket to be connected
        await new Promise(resolve => sock.once('connect', resolve));
        const agentSock = await new Promise((resolve, reject) => {
            agent.createConnection({}, (err, sock) => {
                if (err) {
                    reject(err);
                }
                resolve(sock);
            });
        });
        agentSock.write('foo');
        await new Promise(resolve => sock.once('readable', resolve));
        expect('foo').toBe(sock.read().toString());
        agent.destroy();
        sock.destroy();
    });
    it('should reject connections over the max', async () => {
        const agent = new TunnelAgent_1.default({
            maxSockets: 2,
        });
        expect(agent.started).toBe(false);
        const info = await agent.listen();
        const sock1 = net_1.default.createConnection({ port: info.port });
        const sock2 = net_1.default.createConnection({ port: info.port });
        // two valid socket connections
        const p1 = new Promise(resolve => sock1.once('connect', resolve));
        const p2 = new Promise(resolve => sock2.once('connect', resolve));
        await Promise.all([p1, p2]);
        const sock3 = net_1.default.createConnection({ port: info.port });
        await new Promise(resolve => sock3.once('close', resolve));
        agent.destroy();
        sock1.destroy();
        sock2.destroy();
        sock3.destroy();
    });
    it('should queue createConnection requests', async () => {
        const agent = new TunnelAgent_1.default();
        expect(agent.started).toBe(false);
        const info = await agent.listen();
        // create a promise for the next connection
        let fulfilled = false;
        const waitSockPromise = new Promise((resolve, reject) => {
            agent.createConnection({}, (err, sock) => {
                fulfilled = true;
                if (err) {
                    reject(err);
                }
                resolve(sock);
            });
        });
        // check that the next socket is not yet available
        await new Promise(resolve => setTimeout(resolve, 500));
        expect(!fulfilled);
        // connect, this will make a socket available
        const sock = net_1.default.createConnection({ port: info.port });
        await new Promise(resolve => sock.once('connect', resolve));
        const anotherAgentSock = await waitSockPromise;
        agent.destroy();
        sock.destroy();
    });
    it('should should emit a online event when a socket connects', async () => {
        const agent = new TunnelAgent_1.default();
        const info = await agent.listen();
        const onlinePromise = new Promise(resolve => agent.once('online', resolve));
        const sock = net_1.default.createConnection({ port: info.port });
        await new Promise(resolve => sock.once('connect', resolve));
        await onlinePromise;
        agent.destroy();
        sock.destroy();
    });
    it('should emit offline event when socket disconnects', async () => {
        const agent = new TunnelAgent_1.default();
        const info = await agent.listen();
        const offlinePromise = new Promise(resolve => agent.once('offline', resolve));
        const sock = net_1.default.createConnection({ port: info.port });
        await new Promise(resolve => sock.once('connect', resolve));
        sock.end();
        await offlinePromise;
        agent.destroy();
        sock.destroy();
    });
    it('should emit offline event only when last socket disconnects', async () => {
        const agent = new TunnelAgent_1.default();
        const info = await agent.listen();
        const offlinePromise = new Promise(resolve => agent.once('offline', resolve));
        const sockA = net_1.default.createConnection({ port: info.port });
        await new Promise(resolve => sockA.once('connect', resolve));
        const sockB = net_1.default.createConnection({ port: info.port });
        await new Promise(resolve => sockB.once('connect', resolve));
        sockA.end();
        const timeout = new Promise(resolve => setTimeout(resolve, 500));
        await Promise.race([offlinePromise, timeout]);
        sockB.end();
        await offlinePromise;
        agent.destroy();
    });
    it('should error an http request', async () => {
        class ErrorAgent extends http_1.default.Agent {
            createConnection(options, cb) {
                cb(new Error('foo'));
            }
        }
        const agent = new ErrorAgent();
        const opt = {
            host: 'localhost',
            port: 1234,
            path: '/',
            agent: agent,
        };
        const err = await new Promise((resolve) => {
            const req = http_1.default.get(opt, () => { });
            req.once('error', resolve);
        });
        expect(err.message).toBe('foo');
    });
    it('should return stats', async () => {
        const agent = new TunnelAgent_1.default();
        expect(agent.stats()).toEqual({
            connectedSockets: 0,
        });
    });
});
