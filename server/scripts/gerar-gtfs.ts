/**
 * Gera um feed GTFS estático FICTÍCIO para Indaiatuba em server/data/gtfs.
 * As linhas abaixo são inventadas para o protótipo; os terminais vêm de data/config.json.
 *
 * Uso: npm run gerar-gtfs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cumulative, type LatLon } from '../src/geo';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const OUT = path.join(DATA, 'gtfs');
const config = JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8'));

const { central, rodoviario } = config.terminais;
const VEL_KMH: number = config.velocidadesKmh.onibusMedia;

type Stop = { id: string; nome: string; lat: number; lon: number };
const stops: Stop[] = [
  { id: central.id, nome: central.nome, lat: central.lat, lon: central.lon },
  { id: rodoviario.id, nome: rodoviario.nome, lat: rodoviario.lat, lon: rodoviario.lon },
  { id: 'morada1', nome: 'Jd. Morada do Sol – Ponto Final', lat: -23.1220, lon: -47.2420 },
  { id: 'morada2', nome: 'Jd. Morada do Sol – Av. Principal', lat: -23.1170, lon: -47.2340 },
  { id: 'tancredo', nome: 'Jd. Tancredo Neves', lat: -23.1090, lon: -47.2290 },
  { id: 'parqueeco', nome: 'Parque Ecológico', lat: -23.0985, lon: -47.2235 },
  { id: 'centro', nome: 'Centro – Praça Prudente de Moraes', lat: -23.0893, lon: -47.2150 },
  { id: 'cidadenova', nome: 'Cidade Nova', lat: -23.0810, lon: -47.2050 },
  { id: 'morumbi', nome: 'Jd. Morumbi', lat: -23.0650, lon: -47.2130 },
  { id: 'pompeia', nome: 'Jd. Pompéia', lat: -23.0960, lon: -47.2170 },
  { id: 'recanto', nome: 'Jd. Recanto do Vale', lat: -23.1020, lon: -47.2190 },
  { id: 'bartolomai', nome: 'Distrito Industrial Bartolomai', lat: -23.1057, lon: -47.2040 },
  { id: 'di_giomi', nome: 'Distrito Industrial Domingos Giomi', lat: -23.1316, lon: -47.2321 },
  { id: 'di_novaera', nome: 'Distrito Industrial Nova Era', lat: -23.1373, lon: -47.2290 },
];
const stopById = new Map(stops.map((s) => [s.id, s]));

// Um item do traçado é uma parada (string) ou um ponto de curva [lat, lon].
type Item = string | LatLon;
type Route = {
  id: string; curto: string; longo: string; cor: string; corTexto: string;
  headwayMin: number; offsetMin: number; circular?: boolean; tracado: Item[];
};

const routes: Route[] = [
  {
    id: '101', curto: '101', longo: 'Terminal Central ↔ Distrito Industrial Nova Era', cor: '1D4ED8', corTexto: 'FFFFFF',
    headwayMin: 10, offsetMin: 0,
    tracado: [central.id, [-23.0990, -47.2098], rodoviario.id, [-23.1150, -47.2200], 'morada2', [-23.1250, -47.2335], 'di_giomi', 'di_novaera'],
  },
  {
    id: '102', curto: '102', longo: 'Jd. Morada do Sol ↔ Rodoviária (via Parque Ecológico e Centro)', cor: 'B45309', corTexto: 'FFFFFF',
    headwayMin: 15, offsetMin: 4,
    tracado: ['morada1', 'morada2', 'tancredo', [-23.1040, -47.2255], 'parqueeco', [-23.0900, -47.2200], 'centro', central.id, [-23.0990, -47.2098], rodoviario.id],
  },
  {
    id: '103', curto: '103', longo: 'Jd. Morumbi ↔ Distrito Industrial Bartolomai', cor: 'BE185D', corTexto: 'FFFFFF',
    headwayMin: 20, offsetMin: 7,
    tracado: ['morumbi', [-23.0740, -47.2090], 'cidadenova', central.id, [-23.0990, -47.2098], rodoviario.id, 'bartolomai'],
  },
  {
    id: '104', curto: '104', longo: 'Circular Centro (Central → Pompéia → Rodoviária → Bartolomai)', cor: '0E7490', corTexto: 'FFFFFF',
    headwayMin: 12, offsetMin: 2, circular: true,
    tracado: [central.id, 'centro', 'pompeia', 'recanto', rodoviario.id, 'bartolomai', [-23.0980, -47.2030], central.id],
  },
];


const hms = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return [h, m, x].map((v) => String(v).padStart(2, '0')).join(':');
};
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';

const coord = (it: Item): LatLon => (typeof it === 'string' ? [stopById.get(it)!.lat, stopById.get(it)!.lon] : it);

const shapesRows: (string | number)[][] = [['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence', 'shape_dist_traveled']];
const tripsRows: (string | number)[][] = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
const stRows: (string | number)[][] = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'shape_dist_traveled']];

const secPorMetro = 3.6 / VEL_KMH;
for (const r of routes) {
  const dirs = r.circular ? [r.tracado] : [r.tracado, [...r.tracado].reverse()];
  dirs.forEach((tracado, dir) => {
    const shapeId = `${r.id}_${dir}`;
    const pts = tracado.map(coord);
    const cum = cumulative(pts);
    pts.forEach((p, i) => shapesRows.push([shapeId, p[0].toFixed(6), p[1].toFixed(6), i + 1, cum[i].toFixed(1)]));

    // horários relativos ao início da viagem
    const paradas: { stop: string; arr: number; dep: number; dist: number }[] = [];
    let t = 0;
    tracado.forEach((it, i) => {
      if (i > 0) t += (cum[i] - cum[i - 1]) * secPorMetro;
      if (typeof it !== 'string') return;
      const terminal = it === central.id || it === rodoviario.id;
      const dwell = i === 0 || i === tracado.length - 1 ? 0 : terminal ? 60 : 20;
      paradas.push({ stop: it, arr: Math.round(t), dep: Math.round(t + dwell), dist: cum[i] });
      t += dwell;
    });

    const ultimo = typeof tracado[tracado.length - 1] === 'string' ? stopById.get(tracado[tracado.length - 1] as string)! : null;
    // letreiro: nome curto do terminal; linhas circulares mostram o percurso
    const headsign = r.circular ? 'Circular: Pompéia · Rodoviária · Bartolomai'
      : ultimo?.id === central.id ? central.nomeCurto
      : ultimo?.id === rodoviario.id ? rodoviario.nomeCurto
      : ultimo?.nome ?? r.longo;
    // Serviço contínuo 24 h (simulação para a demo funcionar a qualquer hora).
    const inicio = (r.offsetMin + (dir === 1 ? r.headwayMin / 2 : 0)) * 60;
    for (let start = inicio; start < 24 * 3600; start += r.headwayMin * 60) {
      const tripId = `${r.id}_${dir}_${hms(start).slice(0, 5).replace(':', '')}`;
      tripsRows.push([r.id, 'DIARIO', tripId, headsign, dir, shapeId]);
      paradas.forEach((p, k) =>
        stRows.push([tripId, hms(start + p.arr), hms(start + p.dep), p.stop, k + 1, p.dist.toFixed(1)]));
    }
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'agency.txt'), csv([
  ['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang'],
  ['SIM', 'Operadora Simulada (dados fictícios)', 'https://example.org', 'America/Sao_Paulo', 'pt'],
]));
fs.writeFileSync(path.join(OUT, 'calendar.txt'), csv([
  ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
  ['DIARIO', 1, 1, 1, 1, 1, 1, 1, '20260101', '20271231'],
]));
fs.writeFileSync(path.join(OUT, 'stops.txt'), csv([
  ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type'],
  ...stops.map((s) => [s.id, s.nome, s.lat, s.lon, 0]),
]));
fs.writeFileSync(path.join(OUT, 'routes.txt'), csv([
  ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color', 'route_text_color'],
  ...routes.map((r) => [r.id, 'SIM', r.curto, r.longo, 3, r.cor, r.corTexto]),
]));
fs.writeFileSync(path.join(OUT, 'shapes.txt'), csv(shapesRows));
fs.writeFileSync(path.join(OUT, 'trips.txt'), csv(tripsRows));
fs.writeFileSync(path.join(OUT, 'stop_times.txt'), csv(stRows));

console.log(`GTFS gerado em ${OUT}: ${stops.length} paradas, ${routes.length} linhas, ${tripsRows.length - 1} viagens, ${stRows.length - 1} stop_times.`);
