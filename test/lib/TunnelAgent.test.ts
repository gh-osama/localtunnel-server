import http from 'http';
import net from 'net';
import assert from 'assert';

import TunnelAgent from '../../src/lib/TunnelAgent';

describe('TunnelAgent', () => {
    it('should create an empty agent', async () => {
        const agent = new TunnelAgent();
        expect(agent.started).toBe(false);

        const info = await agent.listen();
        expect(info.port).toBeGreaterThan(0);
        agent.destroy();
    });

    it('should create a new server and accept connections', async () => {
        const agent = new TunnelAgent();
        expect(agent.started).toBe(false);

        const info = await agent.listen();
        const sock = net.createConnection({ port: info.port });

        // in this test we wait for the socket to be connected
        await new Promise<void>(resolve => sock.once('connect', resolve));

        const agentSock = await new Promise<net.Socket>((resolve, reject) => {
            agent.createConnection({}, (err, sock) => {
                if (err) {
                    reject(err);
                }
                resolve(sock!);
            });
        });

        agentSock.write('foo');
        await new Promise<void>(resolve => sock.once('readable', resolve));

        expect('foo').toBe(sock.read().toString());
        agent.destroy();
        sock.destroy();
    });

    it('should reject connections over the max', async () => {
        const agent = new TunnelAgent({
            maxSockets: 2,
        });
        expect(agent.started).toBe(false);

        const info = await agent.listen();
        const sock1 = net.createConnection({ port: info.port });
        const sock2 = net.createConnection({ port: info.port });

        // two valid socket connections
        const p1 = new Promise<void>(resolve => sock1.once('connect', resolve));
        const p2 = new Promise<void>(resolve => sock2.once('connect', resolve));
        await Promise.all([p1, p2]);

        const sock3 = net.createConnection({ port: info.port });
        await new Promise<void>(resolve => sock3.once('close', resolve));

        agent.destroy();
        sock1.destroy();
        sock2.destroy();
        sock3.destroy();
    });

    it('should queue createConnection requests', async () => {
        const agent = new TunnelAgent();
        expect(agent.started).toBe(false);

        const info = await agent.listen();

        // create a promise for the next connection
        let fulfilled = false;
        const waitSockPromise = new Promise<net.Socket>((resolve, reject) => {
            agent.createConnection({}, (err, sock) => {
                fulfilled = true;
                if (err) {
                    reject(err);
                }
                resolve(sock!);
            });
        });

        // check that the next socket is not yet available
        await new Promise<void>(resolve => setTimeout(resolve, 500));
        expect(!fulfilled);

        // connect, this will make a socket available
        const sock = net.createConnection({ port: info.port });
        await new Promise<void>(resolve => sock.once('connect', resolve));

        const anotherAgentSock = await waitSockPromise;
        agent.destroy();
        sock.destroy();
    });

    it('should should emit a online event when a socket connects', async () => {
        const agent = new TunnelAgent();
        const info = await agent.listen();

        const onlinePromise = new Promise<void>(resolve => agent.once('online', resolve));

        const sock = net.createConnection({ port: info.port });
        await new Promise<void>(resolve => sock.once('connect', resolve));

        await onlinePromise;
        agent.destroy();
        sock.destroy();
    });

    it('should emit offline event when socket disconnects', async () => {
        const agent = new TunnelAgent();
        const info = await agent.listen();

        const offlinePromise = new Promise<void>(resolve => agent.once('offline', resolve));

        const sock = net.createConnection({ port: info.port });
        await new Promise<void>(resolve => sock.once('connect', resolve));

        sock.end();
        await offlinePromise;
        agent.destroy();
        sock.destroy();
    });

    it('should emit offline event only when last socket disconnects', async () => {
        const agent = new TunnelAgent();
        const info = await agent.listen();

        const offlinePromise = new Promise<void>(resolve => agent.once('offline', resolve));

        const sockA = net.createConnection({ port: info.port });
        await new Promise<void>(resolve => sockA.once('connect', resolve));
        const sockB = net.createConnection({ port: info.port });
        await new Promise<void>(resolve => sockB.once('connect', resolve));

        sockA.end();

        const timeout = new Promise<void>(resolve => setTimeout(resolve, 500));
        await Promise.race([offlinePromise, timeout]);

        sockB.end();
        await offlinePromise;

        agent.destroy();
    });

    it('should error an http request', async () => {
        class ErrorAgent extends http.Agent {
            createConnection(options: any, cb: (err: Error | null, socket?: net.Socket) => void) {
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

        const err = await new Promise<Error>((resolve) => {
            const req = http.get(opt, () => {});
            req.once('error', resolve);
        });
        expect(err.message).toBe('foo');
    });

    it('should return stats', async () => {
        const agent = new TunnelAgent();
        expect(agent.stats()).toEqual({
            connectedSockets: 0,
        });
    });
});