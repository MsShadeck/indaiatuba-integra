// Leitor de GTFS estático (subconjunto: stops, routes, trips, stop_times, shapes).
// Para usar o feed real da operadora, basta substituir os arquivos em data/gtfs
// (ou apontar GTFS_DIR para outra pasta) – o formato é o padrão GTFS.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './dados';
import { cumulative, type LatLon } from './geo';

const GTFS_DIR = process.env.GTFS_DIR ?? path.join(DATA_DIR, 'gtfs');

/** CSV simples com suporte a campos entre aspas. */
function parseCsv(texto: string): Record<string, string>[] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const split = (l: string) => {
    const out: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) {
        if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const cab = split(linhas[0]).map((h) => h.trim());
  return linhas.slice(1).map((l) => {
    const v = split(l);
    const o: Record<string, string> = {};
    cab.forEach((h, i) => (o[h] = (v[i] ?? '').trim()));
    return o;
  });
}

const ler = (arq: string) => parseCsv(fs.readFileSync(path.join(GTFS_DIR, arq), 'utf8'));
const seg = (hms: string) => {
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

export interface Stop { id: string; nome: string; lat: number; lon: number }
export interface Route { id: string; curto: string; longo: string; cor: string; corTexto: string }
export interface StopTime { stopId: string; seq: number; arr: number; dep: number; dist: number }
export interface Trip {
  id: string; routeId: string; dir: number; shapeId: string; headsign: string; stopTimes: StopTime[];
}
export interface Shape { id: string; pts: LatLon[]; cum: number[] }
/** Padrão = sequência de paradas de uma linha/sentido, com suas viagens ordenadas. */
export interface Pattern { key: string; routeId: string; dir: number; shapeId: string; stops: string[]; trips: Trip[]; headsign: string }

export const stops = new Map<string, Stop>();
export const routes = new Map<string, Route>();
export const trips = new Map<string, Trip>();
export const shapes = new Map<string, Shape>();
export const patterns = new Map<string, Pattern>();

for (const s of ler('stops.txt'))
  stops.set(s.stop_id, { id: s.stop_id, nome: s.stop_name, lat: +s.stop_lat, lon: +s.stop_lon });

for (const r of ler('routes.txt'))
  routes.set(r.route_id, {
    id: r.route_id, curto: r.route_short_name || r.route_id, longo: r.route_long_name,
    cor: '#' + (r.route_color || '1D4ED8'), corTexto: '#' + (r.route_text_color || 'FFFFFF'),
  });

const pontosShape = new Map<string, { seq: number; p: LatLon }[]>();
for (const s of ler('shapes.txt')) {
  const arr = pontosShape.get(s.shape_id) ?? [];
  arr.push({ seq: +s.shape_pt_sequence, p: [+s.shape_pt_lat, +s.shape_pt_lon] });
  pontosShape.set(s.shape_id, arr);
}
for (const [id, arr] of pontosShape) {
  const pts = arr.sort((a, b) => a.seq - b.seq).map((x) => x.p);
  shapes.set(id, { id, pts, cum: cumulative(pts) });
}

for (const t of ler('trips.txt'))
  trips.set(t.trip_id, {
    id: t.trip_id, routeId: t.route_id, dir: +(t.direction_id || 0), shapeId: t.shape_id,
    headsign: t.trip_headsign, stopTimes: [],
  });

for (const st of ler('stop_times.txt')) {
  const t = trips.get(st.trip_id);
  if (!t) continue;
  t.stopTimes.push({
    stopId: st.stop_id, seq: +st.stop_sequence, arr: seg(st.arrival_time), dep: seg(st.departure_time),
    dist: st.shape_dist_traveled ? +st.shape_dist_traveled : NaN,
  });
}

for (const t of trips.values()) {
  t.stopTimes.sort((a, b) => a.seq - b.seq);
  // Se o feed não trouxer shape_dist_traveled, projeta a parada no shape.
  const sh = shapes.get(t.shapeId);
  if (sh && t.stopTimes.some((s) => Number.isNaN(s.dist))) {
    let ultimo = 0;
    for (const s of t.stopTimes) {
      const st = stops.get(s.stopId)!;
      let best = ultimo, bestD = Infinity;
      for (let i = 0; i < sh.pts.length; i++) {
        const d = Math.hypot(sh.pts[i][0] - st.lat, sh.pts[i][1] - st.lon);
        if (sh.cum[i] >= ultimo && d < bestD) { bestD = d; best = sh.cum[i]; }
      }
      s.dist = ultimo = best;
    }
  }
  const key = `${t.routeId}|${t.dir}|${t.stopTimes.map((s) => s.stopId).join('>')}`;
  let p = patterns.get(key);
  if (!p) {
    p = { key, routeId: t.routeId, dir: t.dir, shapeId: t.shapeId, stops: t.stopTimes.map((s) => s.stopId), trips: [], headsign: t.headsign };
    patterns.set(key, p);
  }
  p.trips.push(t);
}
for (const p of patterns.values()) p.trips.sort((a, b) => a.stopTimes[0].dep - b.stopTimes[0].dep);

/** Para cada parada, os padrões que passam por ela e o índice na sequência. */
export const padroesPorParada = new Map<string, { pattern: Pattern; idx: number }[]>();
for (const p of patterns.values())
  p.stops.forEach((s, idx) => {
    const arr = padroesPorParada.get(s) ?? [];
    arr.push({ pattern: p, idx });
    padroesPorParada.set(s, arr);
  });

console.log(`[gtfs] ${stops.size} paradas, ${routes.size} linhas, ${trips.size} viagens, ${patterns.size} padrões`);
