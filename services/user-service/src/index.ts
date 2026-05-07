import { createServer, startServer } from './server';

async function main() {
  const fastify = await createServer();
  await startServer(fastify);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
