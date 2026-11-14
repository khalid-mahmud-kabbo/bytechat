import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { deleteExpiredStories } from './modules/stories/stories.service';
import { initSocket } from './socket';

const server = http.createServer(app);
initSocket(server);

server.listen(env.PORT, () => console.log(`ByteChat API running on :${env.PORT}`));

// expired statuses are already hidden by every query; this just frees the rows
const cleanup = setInterval(() => deleteExpiredStories().catch((e) => console.error('[cleanup]', e)), 60 * 60 * 1000);

const shutdown = async () => {
  clearInterval(cleanup);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
