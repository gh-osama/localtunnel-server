import { Agent } from 'http';
import net from 'net';
import Debug from 'debug';

interface TunnelAgentOptions {
    clientId?: string;
maxSockets?: number;
}

class TunnelAgent extends Agent {
    private availableSockets: net.Socket[];
    private waitingCreateConn: ((err: Error | null, socket?: net.Socket) => void)[];
    private debug: Debug.Debugger;
    private connectedSockets: number;
    private maxTcpSockets: number;
    private server: net.Server;
    private _started: boolean = false;
    private closed: boolean;

    constructor(options: TunnelAgentOptions = {}) {
    super({
    keepAlive: true,
        maxFreeSockets: 1,
    });

    this.availableSockets = [];
    this.waitingCreateConn = [];
    this.debug = Debug(`lt:TunnelAgent[${options.clientId}]`);
    this.connectedSockets = 0;
    this.maxTcpSockets = options.maxSockets || 10;
    this.server = net.createServer();
    this.closed = false;
  }

  get started(): boolean {
    return this._started;
  }

  stats() {
    return {
      connectedSockets: this.connectedSockets,
    };
  }

  listen(): Promise<{ port: number }> {
    const server = this.server;
    if (this._started) {
      throw new Error('already started');
    }
    this._started = true;

    server.on('close', this._onClose.bind(this));
    server.on('connection', this._onConnection.bind(this));
    server.on('error', (err: Error) => {
      if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
        return;
      }
      console.error(err);
    });

    return new Promise((resolve) => {
      server.listen(() => {
        const address = server.address() as net.AddressInfo;
        this.debug('tcp server listening on port: %d', address.port);

        resolve({
          port: address.port,
        });
      });
    });
    }

    private _onClose() {
        this.closed = true;
        this.debug('closed tcp socket');
        for (const conn of this.waitingCreateConn) {
            conn(new Error('closed'));
    }
    this.waitingCreateConn = [];
    this.emit('end');
  }

  private _onConnection(socket: net.Socket) {
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
    const addr = socket.address() as net.AddressInfo;
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

  createConnection(options: any, cb: (err: Error | null, socket?: net.Socket) => void) {
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

export default TunnelAgent;