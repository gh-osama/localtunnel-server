import http from 'http';
import Debug from 'debug';
import pump from 'pump';
import { EventEmitter } from 'events';
import TunnelAgent from './TunnelAgent';

interface ClientOptions {
  id: string;
  agent: TunnelAgent;
}

class Client extends EventEmitter {
  private agent: TunnelAgent;
  private id: string;
  private debug: Debug.Debugger;
  private graceTimeout: NodeJS.Timeout;

  constructor(options: ClientOptions) {
    super();

    const agent = this.agent = options.agent;
    const id = this.id = options.id;

    this.debug = Debug(`lt:Client[${this.id}]`);

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

  handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    this.debug('> %s', req.url);
    const opt = {
      path: req.url,
      agent: this.agent,
      method: req.method,
      headers: req.headers
    };

    const clientReq = http.request(opt, (clientRes) => {
      this.debug('< %s', req.url);
      res.writeHead(clientRes.statusCode!, clientRes.headers);

      pump(clientRes, res);
    });

    clientReq.once('error', (err) => {
      // TODO: if headers not sent - respond with gateway unavailable
    });

    pump(req, clientReq);
  }

  handleUpgrade(req: http.IncomingMessage, socket: any) {
    this.debug('> [up] %s', req.url);
    socket.once('error', (err: Error) => {
      if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
        return;
      }
      console.error(err);
    });

    this.agent.createConnection({}, (err: Error | null, conn: any) => {
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

      pump(conn, socket);
      pump(socket, conn);
      conn.write(arr.join('\r\n'));
    });
  }
}

export default Client;