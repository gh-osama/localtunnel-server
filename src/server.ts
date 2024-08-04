import Koa from 'koa';
import tldjs from 'tldjs';
import Debug from 'debug';
import http from 'http';
import { hri } from 'human-readable-ids';
import Router from 'koa-router';

import ClientManager from './lib/ClientManager';

const debug = Debug('localtunnel:server');

interface ServerOptions {
  port?: number;
  secure?: boolean;
  domain?: string;
  max_tcp_sockets?: number;
  landing?: string;
}

interface ClientInfo {
  id: string;
  port: number;
  max_conn_count: number;
  url?: string;
}

export default function createServer(opt: ServerOptions = {}) {
  const port = process.env.PORT || opt.port || 3000;

  const validHosts = opt.domain ? [opt.domain] : undefined;
  const myTldjs = tldjs.fromUserSettings({ validHosts });
  const landingPage = opt.landing || 'https://localtunnel.github.io/www/';

  function GetClientIdFromHostname(hostname: string): string | null {
    return myTldjs.getSubdomain(hostname);
  }

  const manager = new ClientManager(opt);

  const schema = opt.secure ? 'https' : 'http';

  const app = new Koa();
  const router = new Router();

  router.get('/api/status', async (ctx) => {
    const stats = manager.stats;
    ctx.body = {
      tunnels: stats.tunnels,
      mem: process.memoryUsage(),
    };
  });

  router.get('/api/tunnels/:id/status', async (ctx) => {
    const clientId = ctx.params.id;
    const client = manager.getClient(clientId);
    if (!client) {
      ctx.throw(404);
      return;
    }

    const stats = client.stats();
    ctx.body = {
      connected_sockets: stats.connectedSockets,
    };
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  // root endpoint
  app.use(async (ctx, next) => {
    const path = ctx.request.path;

    if (path !== '/') {
      await next();
      return;
    }

    const isNewClientRequest = ctx.query['new'] !== undefined;
    if (isNewClientRequest) {
      const reqId = hri.random();
      debug('making new client with id %s', reqId);
      const info: ClientInfo = await manager.newClient(reqId);

      info.url = `${schema}://${info.id}.${ctx.request.host}`;
      ctx.body = info;
      return;
    }

    ctx.redirect(landingPage);
  });

  // anything after the / path is a request for a specific client name
  app.use(async (ctx, next) => {
    const parts = ctx.request.path.split('/');

    if (parts.length !== 2) {
      await next();
      return;
    }

    const reqId = parts[1];

    if (!/^(?:[a-z0-9][a-z0-9\-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/.test(reqId)) {
      const msg = 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.';
      ctx.status = 403;
      ctx.body = { message: msg };
      return;
    }

    debug('making new client with id %s', reqId);
    const info: ClientInfo = await manager.newClient(reqId);

    info.url = `${schema}://${info.id}.${ctx.request.host}`;
    ctx.body = info;
  });

  const server = http.createServer();

  const appCallback = app.callback();

  server.on('request', (req, res) => {
    const hostname = req.headers.host;
    if (!hostname) {
      res.statusCode = 400;
      res.end('Host header is required');
      return;
    }

    const clientId = GetClientIdFromHostname(hostname);
    if (!clientId) {
      appCallback(req, res);
      return;
    }

    const client = manager.getClient(clientId);
    if (!client) {
      res.statusCode = 404;
      res.end('404');
      return;
    }

    client.handleRequest(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    const hostname = req.headers.host;
    if (!hostname) {
      socket.destroy();
      return;
    }

    const clientId = GetClientIdFromHostname(hostname);
    if (!clientId) {
      socket.destroy();
      return;
    }

    const client = manager.getClient(clientId);
    if (!client) {
      socket.destroy();
      return;
    }

    client.handleUpgrade(req, socket);
  });

  server.listen(port, () => {
    debug('server listening on port: %d', port);
  });

  return server;
}