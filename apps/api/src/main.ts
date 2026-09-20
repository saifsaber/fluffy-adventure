import { DATA_ROOT, loadLeague } from '@dakka/content';
import { readConfig } from './config.js';
import { buildServer } from './server.js';

/**
 * The entry point, and the only place in this service that reads the process or opens a socket.
 *
 * Content is loaded once, here, and handed to the server — so the request path does no I/O and a
 * malformed club file stops the service at boot rather than on somebody's first match.
 */
const config = readConfig(process.env);
const { league, clubs, data } = loadLeague(DATA_ROOT, config.league);
const app = buildServer({ config, league: { league, clubs, data } });

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error({ err: error }, 'could not start');
  process.exit(1);
}
