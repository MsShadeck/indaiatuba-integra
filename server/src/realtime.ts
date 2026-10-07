// Simulador GTFS-Realtime: move cada ônibus ao longo do shape da sua viagem,
// seguindo o horário programado (stop_times) mais um atraso aleatório pequeno.
// Num cenário real, este módulo seria substituído pela leitura do feed GTFS-RT
// (VehiclePositions + TripUpdates) da operadora.
import { bearing, pointAlong } from './geo.js';
import { patterns, routes, shapes, stops, trips, type Trip } from './gtfs.js';

const DIA = 86400;

/** Segundos desde a meia-noite no fuso de Indaiatuba (America/Sao_Paulo). */
export function segundosDoDia(ms = Date.now()): number {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const g = (t: string) => +(p.find((x) => x.type === t)?.value ?? 0);
  return g('hour') * 3600 + g('minute') * 60 + g('second') + (ms % 1000) / 1000;
}

/** Converte "segundos de serviço" (base = meia-noite de hoje) para epoch ms. */
export function servicoParaMs(seg: number, agora = Date.now()): number {
  return agora + (seg - segundosDoDia(agora)) * 1000;
}

// Atraso atual (s) de cada viagem; positivo = atrasado.
const atrasos = new Map<string, number>();
let semente = 12345;
const rand = () => {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff;
  return semente / 0x7fffffff;
};

export function atrasoDe(tripId: string): number {
  return atrasos.get(tripId) ?? 0;
}

/** Ajusta manualmente o atraso de uma viagem (usado no modo demo). */
const forcados = new Set<string>();
export function definirAtraso(tripId: string, s: number) {
  atrasos.set(tripId, s);
  forcados.add(tripId); // não sofre o passeio aleatório
}
export function limparAtrasosForcados() {
  for (const id of forcados) atrasos.delete(id);
  forcados.clear();
}

export interface Veiculo {
  id: string; tripId: string; routeId: string; linha: string; cor: string; corTexto: string;
  destino: string; lat: number; lon: number; rumo: number; atrasoS: number;
  proximaParadaId: string | null; proximaParadaNome: string | null; sequenciaAtual: number;
  status: 'IN_TRANSIT_TO' | 'STOPPED_AT';
}

function posicaoDaViagem(t: Trip, tempo: number) {
  const st = t.stopTimes;
  // o ônibus aparece parado no ponto inicial até 10 min antes da partida (aguardando no terminal)
  if (tempo < st[0].dep - 600 || tempo > st[st.length - 1].arr + 30) return null;
  const sh = shapes.get(t.shapeId)!;
  let d = st[0].dist;
  let prox = 0;
  let parado = false;
  if (tempo <= st[0].dep) { d = st[0].dist; prox = 0; parado = true; }
  else if (tempo >= st[st.length - 1].arr) { d = st[st.length - 1].dist; prox = st.length - 1; parado = true; }
  else {
    for (let i = 0; i < st.length; i++) {
      if (tempo >= st[i].arr && tempo <= st[i].dep) { d = st[i].dist; prox = i; parado = true; break; }
      if (i < st.length - 1 && tempo > st[i].dep && tempo < st[i + 1].arr) {
        const f = (tempo - st[i].dep) / (st[i + 1].arr - st[i].dep);
        d = st[i].dist + (st[i + 1].dist - st[i].dist) * f;
        prox = i + 1;
        break;
      }
    }
  }
  const a = pointAlong(sh.pts, sh.cum, d);
  const b = pointAlong(sh.pts, sh.cum, Math.min(d + 15, sh.cum[sh.cum.length - 1]));
  const rumo = a.p[0] === b.p[0] && a.p[1] === b.p[1] ? 0 : bearing(a.p, b.p);
  return { p: a.p, rumo, prox, parado };
}

let cache: { t: number; v: Veiculo[] } = { t: 0, v: [] };

/** Avança a simulação (atrasos) e devolve os veículos ativos agora. */
export function atualizarVeiculos(agora = Date.now()): Veiculo[] {
  const s = segundosDoDia(agora);
  const out: Veiculo[] = [];
  for (const p of patterns.values()) {
    const r = routes.get(p.routeId)!;
    for (const t of p.trips) {
      // considera também viagens de "ontem" que passam da meia-noite (horários > 24:00)
      for (const base of [s, s + DIA]) {
        const ini = t.stopTimes[0].dep, fim = t.stopTimes[t.stopTimes.length - 1].arr;
        const tEff = base - (atrasos.get(t.id) ?? 0); // considera adiantamento/atraso atual
        if (tEff < ini - 900 || tEff > fim + 400) continue;
        let atraso = atrasos.get(t.id);
        if (atraso === undefined) atraso = Math.round(rand() * 150 - 20); // -20 s a +130 s
        // passeio aleatório pequeno, limitado a [-60 s, +300 s]
        if (!forcados.has(t.id)) atraso = Math.max(-60, Math.min(300, atraso + Math.round((rand() - 0.5) * 6)));
        atrasos.set(t.id, atraso);
        const pos = posicaoDaViagem(t, base - atraso);
        if (!pos) continue;
        const prox = t.stopTimes[pos.prox];
        out.push({
          id: `bus-${t.id}`, tripId: t.id, routeId: r.id, linha: r.curto, cor: r.cor, corTexto: r.corTexto,
          destino: t.headsign, lat: pos.p[0], lon: pos.p[1], rumo: Math.round(pos.rumo), atrasoS: atraso,
          proximaParadaId: prox?.stopId ?? null, proximaParadaNome: prox ? stops.get(prox.stopId)?.nome ?? null : null,
          sequenciaAtual: prox?.seq ?? 0, status: pos.parado ? 'STOPPED_AT' : 'IN_TRANSIT_TO',
        });
      }
    }
  }
  cache = { t: agora, v: out };
  return out;
}

export function veiculosAtuais(): Veiculo[] {
  return Date.now() - cache.t > 2500 ? atualizarVeiculos() : cache.v;
}

export interface Partida {
  tripId: string; routeId: string; linha: string; cor: string; corTexto: string; destino: string;
  stopId: string; idx: number;
  programadaS: number; // segundos de serviço (base hoje)
  atrasoS: number;
  previstaMs: number; programadaMs: number;
  aoVivo: boolean; // a viagem já está em andamento (posição real disponível)
}

/**
 * Próximas partidas a partir de uma parada, após `aPartirMs`.
 * Opcionalmente filtra por padrão (rota/sentido) e índice da parada no padrão.
 */
export function proximasPartidas(stopId: string, aPartirMs: number, limite = 6, filtroPadrao?: string): Partida[] {
  const agora = Date.now();
  const sAgora = segundosDoDia(agora);
  const sMin = sAgora + (aPartirMs - agora) / 1000;
  const ativos = new Set(veiculosAtuais().map((v) => v.tripId));
  const out: Partida[] = [];
  for (const p of patterns.values()) {
    if (filtroPadrao && p.key !== filtroPadrao) continue;
    const idx = p.stops.indexOf(stopId);
    if (idx < 0 || idx === p.stops.length - 1) continue; // não embarca no ponto final
    const r = routes.get(p.routeId)!;
    for (const desloc of [-DIA, 0, DIA]) {
      for (const t of p.trips) {
        const prog = t.stopTimes[idx].dep + desloc;
        if (prog < sMin - 400 || prog > sMin + 3 * 3600) continue;
        const atraso = atrasoDe(t.id);
        const prev = prog + atraso;
        if (prev < sMin) continue;
        out.push({
          tripId: t.id, routeId: r.id, linha: r.curto, cor: r.cor, corTexto: r.corTexto, destino: t.headsign,
          stopId, idx, programadaS: prog, atrasoS: atraso,
          previstaMs: servicoParaMs(prev, agora), programadaMs: servicoParaMs(prog, agora), aoVivo: ativos.has(t.id),
        });
      }
    }
  }
  return out.sort((a, b) => a.previstaMs - b.previstaMs).slice(0, limite);
}

/** Chegada prevista (epoch ms) da viagem em um índice de parada, dada a partida usada no planejamento. */
export function chegadaPrevista(tripId: string, idx: number, partida: Partida): number {
  const t = trips.get(tripId)!;
  const desloc = partida.programadaS - t.stopTimes[partida.idx].dep;
  return servicoParaMs(t.stopTimes[idx].arr + desloc + partida.atrasoS);
}

/** Feed no formato GTFS-Realtime (FeedMessage) serializado em JSON. */
export function feedVehiclePositions() {
  const ts = Math.floor(Date.now() / 1000);
  return {
    header: { gtfs_realtime_version: '2.0', incrementality: 'FULL_DATASET', timestamp: ts },
    entity: veiculosAtuais().map((v) => ({
      id: v.id,
      vehicle: {
        trip: { trip_id: v.tripId, route_id: v.routeId },
        vehicle: { id: v.id, label: v.linha },
        position: { latitude: v.lat, longitude: v.lon, bearing: v.rumo },
        current_stop_sequence: v.sequenciaAtual,
        stop_id: v.proximaParadaId,
        current_status: v.status,
        timestamp: ts,
      },
    })),
  };
}

export function feedTripUpdates() {
  const ts = Math.floor(Date.now() / 1000);
  return {
    header: { gtfs_realtime_version: '2.0', incrementality: 'FULL_DATASET', timestamp: ts },
    entity: veiculosAtuais().map((v) => ({
      id: `tu-${v.tripId}`,
      trip_update: {
        trip: { trip_id: v.tripId, route_id: v.routeId },
        vehicle: { id: v.id, label: v.linha },
        stop_time_update: trips.get(v.tripId)!.stopTimes
          .filter((s) => s.seq >= v.sequenciaAtual)
          .map((s) => ({ stop_sequence: s.seq, stop_id: s.stopId, arrival: { delay: v.atrasoS }, departure: { delay: v.atrasoS } })),
        timestamp: ts,
        delay: v.atrasoS,
      },
    })),
  };
}
