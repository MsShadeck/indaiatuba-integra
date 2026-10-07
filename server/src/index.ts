import { server, TICK_MS } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);

server.listen(PORT, () => {
  console.log(`[server] Indaiatuba Integra API em http://localhost:${PORT} (tick a cada ${TICK_MS / 1000}s)`);
});
