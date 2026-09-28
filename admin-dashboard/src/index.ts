import { startServer } from './server.js';

const port = parseInt(process.env.PORT ?? '3001', 10);
startServer(port).catch((err) => {
  console.error('Failed to start admin server:', err);
  process.exit(1);
});
