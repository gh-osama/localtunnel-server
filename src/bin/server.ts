#!/usr/bin/env node
import log from 'book';
import 'localenv';
import yargs from 'yargs';
import Debug from 'debug';
import CreateServer from '../server';

const debug = Debug('localtunnel');

const argv = yargs(process.argv.slice(2))
  .usage('Usage: $0 --port [num]')
  .option('secure', {
    type: 'boolean',
    default: false,
    describe: 'use this flag to indicate proxy over https'
  })
  .option('address', {
    type: 'string',
    default: '0.0.0.0',
    describe: 'IP address to bind to'
  })
  .option('domain', {
    type: 'string',
    describe: 'Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)'
  })
  .option('max-sockets', {
    type: 'number',
    default: 10,
    describe: 'maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)'
  })
  .help()
  .parse();

if ((argv as any).help) {
  yargs.showHelp();
  process.exit();
}

const server = CreateServer({
  max_tcp_sockets: (argv as any)['max-sockets'],
  secure: (argv as any).secure,
  domain: 'ollama.stream',
});

server.listen(parseInt(process.env.PORT || '3000', 10), '0.0.0.0', () => {
  debug('server listening on port: %d', parseInt(process.env.PORT || '3000', 10));
});

process.on('SIGINT', () => {
  process.exit();
});

process.on('SIGTERM', () => {
  process.exit();
});

process.on('uncaughtException', (err) => {
  log.error(err);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error(reason);
});

// vim: ft=javascript