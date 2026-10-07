// App Express + Socket.IO. Exportado para rodar local (index.ts) e como função na Vercel (api/index.ts).
import http from 'node:http';
import os from 'node:os';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { ciclovias, config, emissoes, lugares, terminais } from './dados.js';
import { estacoes, esvaziarEstacao, gbfs, listaPatinetes, passoGbfs, resetarGbfs } from './gbfs.js';
import { geocodificar } from './geocode.js';
import { patterns, routes, shapes, stops } from './gtfs.js';
import {
  atualizarVeiculos, definirAtraso, feedTripUpdates, limparAtrasosForcados, feedVehiclePositions, proximasPartidas, veiculosAtuais,
} from './realtime.js';
import { impactoMockado } from './impacto.js';
import { planejar } from './planner.js';

const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
export const TICK_MS = 3000;

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Estáticos / configuração ----------
app.get('/api/config', (_req, res) => res.json({ ...config, emissoes }));
app.get('/api/ciclovias', (_req, res) => res.json(ciclovias));
app.get('/api/lugares', (_req, res) => res.json(lugares));

app.get('/api/info', (_req, res) => {
  // IPs da rede local, para o QR code do totem abrir o app no celular
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
  res.json({ ips, webPort: WEB_PORT, urls: ips.map((ip) => `http://${ip}:${WEB_PORT}`) });
});

// Rede de ônibus resumida para o mapa (derivada do GTFS estático)
app.get('/api/rede', (_req, res) => {
  const linhas = [...patterns.values()].map((p) => {
    const r = routes.get(p.routeId)!;
    return { key: p.key, routeId: r.id, linha: r.curto, nome: r.longo, cor: r.cor, sentido: p.dir, destino: p.headsign, pontos: shapes.get(p.shapeId)!.pts, paradas: p.stops };
  });
  res.json({ paradas: [...stops.values()], linhas, terminais });
});

// ---------- GTFS-Realtime (simulado, JSON no esquema FeedMessage) ----------
app.get('/api/vehicles', (_req, res) => res.json(veiculosAtuais()));
app.get('/api/gtfs-rt/vehicle-positions', (_req, res) => res.json(feedVehiclePositions()));
app.get('/api/gtfs-rt/trip-updates', (_req, res) => res.json(feedTripUpdates()));

app.get('/api/paradas/:id/partidas', (req, res) => {
  if (!stops.has(req.params.id)) return res.status(404).json({ erro: 'parada não encontrada' });
  res.json({ parada: stops.get(req.params.id), partidas: proximasPartidas(req.params.id, Date.now(), Number(req.query.limite ?? 8)) });
});

// ---------- GBFS (simulado) ----------
app.get(['/api/gbfs', '/api/gbfs/gbfs.json'], (req, res) =>
  res.json(gbfs.descoberta(`${req.protocol}://${req.get('host')}/api/gbfs`)));
app.get('/api/gbfs/system_information.json', (_q, r) => r.json(gbfs.systemInformation()));
app.get('/api/gbfs/vehicle_types.json', (_q, r) => r.json(gbfs.vehicleTypes()));
app.get('/api/gbfs/station_information.json', (_q, r) => r.json(gbfs.stationInformation()));
app.get('/api/gbfs/station_status.json', (_q, r) => r.json(gbfs.stationStatus()));
app.get('/api/gbfs/vehicle_status.json', (_q, r) => r.json(gbfs.vehicleStatus()));
app.get('/api/gbfs/free_bike_status.json', (_q, r) => r.json(gbfs.freeBikeStatus()));

// ---------- Busca e planejamento ----------
app.get('/api/geocode', async (req, res) => res.json(await geocodificar(String(req.query.q ?? ''))));

app.post('/api/planejar', (req, res) => {
  const { de, para } = req.body ?? {};
  const ok = (p: any) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  if (!ok(de) || !ok(para)) return res.status(400).json({ erro: 'Informe origem e destino com lat/lon.' });
  try {
    res.json(planejar(de, para));
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Falha ao planejar a rota.' });
  }
});

app.get('/api/impacto', (_req, res) => res.json(impactoMockado()));

// ---------- Modo demo (apresentação) ----------
app.post('/api/demo/estacao/:id/esvaziar', (req, res) => {
  const e = esvaziarEstacao(req.params.id);
  if (!e) return res.status(404).json({ erro: 'estação não encontrada' });
  emitirTick();
  res.json(e);
});
// Faz o ônibus de uma viagem chegar em N minutos (para demonstrar o alerta "seu ônibus chega em 3 min")
app.post('/api/demo/onibus', (req, res) => {
  const { tripId, programadaMs, emMin = 3 } = req.body ?? {};
  if (!tripId || !Number.isFinite(programadaMs)) return res.status(400).json({ erro: 'tripId e programadaMs são obrigatórios' });
  const atraso = Math.round((Date.now() + emMin * 60000 - programadaMs) / 1000);
  definirAtraso(tripId, atraso);
  atualizarVeiculos();
  emitirTick();
  res.json({ tripId, atrasoS: atraso });
});
app.post('/api/demo/reset', (_req, res) => {
  resetarGbfs();
  limparAtrasosForcados();
  emitirTick();
  res.json({ ok: true });
});

// ---------- Tempo real ----------
// Fallback por polling (quando o WebSocket não conecta, p.ex. atrás de proxy)
app.get('/api/aovivo', (_req, res) => res.json(estadoAoVivo()));

export const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

function estadoAoVivo() {
  return { t: Date.now(), veiculos: veiculosAtuais(), estacoes: estacoes(), patinetes: listaPatinetes() };
}
function emitirTick() {
  io.emit('tick', estadoAoVivo());
}

io.on('connection', (socket) => socket.emit('tick', estadoAoVivo()));

setInterval(() => {
  atualizarVeiculos();
  passoGbfs();
  emitirTick();
}, TICK_MS);
atualizarVeiculos();

export default server;
