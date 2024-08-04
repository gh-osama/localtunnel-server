"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const net_1 = __importDefault(require("net"));
const ClientManager_1 = __importDefault(require("../../src/lib/ClientManager"));
describe('ClientManager', () => {
    it('should construct with no tunnels', () => {
        const manager = new ClientManager_1.default();
        expect(manager.stats.tunnels).toBe(0);
    });
    it('should create a new client with random id', async () => {
        const manager = new ClientManager_1.default();
        const client = await manager.newClient();
        (0, assert_1.default)(manager.hasClient(client.id));
        manager.removeClient(client.id);
    });
    it('should create a new client with id', async () => {
        const manager = new ClientManager_1.default();
        const client = await manager.newClient('foobar');
        (0, assert_1.default)(manager.hasClient('foobar'));
        manager.removeClient('foobar');
    });
    it('should create a new client with random id if previous exists', async () => {
        const manager = new ClientManager_1.default();
        const clientA = await manager.newClient('foobar');
        const clientB = await manager.newClient('foobar');
        (0, assert_1.default)(clientA.id, 'foobar');
        (0, assert_1.default)(manager.hasClient(clientB.id));
        (0, assert_1.default)(clientB.id != clientA.id);
        manager.removeClient(clientB.id);
        manager.removeClient('foobar');
    });
    it('should remove client once it goes offline', async () => {
        const manager = new ClientManager_1.default();
        const client = await manager.newClient('foobar');
        const socket = await new Promise((resolve) => {
            const netClient = net_1.default.createConnection({ port: client.port }, () => {
                resolve(netClient);
            });
        });
        const closePromise = new Promise(resolve => socket.once('close', resolve));
        socket.end();
        await closePromise;
        // should still have client - grace period has not expired
        (0, assert_1.default)(manager.hasClient('foobar'));
        // wait past grace period (1s)
        await new Promise(resolve => setTimeout(resolve, 1500));
        (0, assert_1.default)(!manager.hasClient('foobar'));
    });
    test('should remove correct client once it goes offline', async () => {
        jest.setTimeout(5000);
        const manager = new ClientManager_1.default();
        const clientFoo = await manager.newClient('foo');
        const clientBar = await manager.newClient('bar');
        const socket = await new Promise((resolve) => {
            const netClient = net_1.default.createConnection({ port: clientFoo.port }, () => {
                resolve(netClient);
            });
        });
        await new Promise(resolve => setTimeout(resolve, 1500));
        // foo should still be ok
        (0, assert_1.default)(manager.hasClient('foo'));
        // clientBar shound be removed - nothing connected to it
        (0, assert_1.default)(!manager.hasClient('bar'));
        manager.removeClient('foo');
        socket.end();
    });
    test('should remove clients if they do not connect within 5 seconds', async () => {
        jest.setTimeout(5000);
        const manager = new ClientManager_1.default();
        const clientFoo = await manager.newClient('foo');
        (0, assert_1.default)(manager.hasClient('foo'));
        // wait past grace period (1s)
        await new Promise(resolve => setTimeout(resolve, 1500));
        (0, assert_1.default)(!manager.hasClient('foo'));
    });
});
