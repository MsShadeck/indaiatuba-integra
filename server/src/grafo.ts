// Roteamento sobre o viário REAL de Indaiatuba (extrato do OpenStreetMap em data/viario.json,
// gerado por `npm run baixar-viario`).
//
// Perfis:
//   - caminhada: calçadas, ruas e caminhos de pedestre, em qualquer sentido;
//   - micro (bike/patinete): respeita mão única e prioriza ciclovias/ciclofaixas, evitando vias rápidas;
//   - onibus: só vias para veículos, respeita mão única, prefere avenidas (usado para os traçados do GTFS).
// O custo de cada aresta = comprimento × fator do tipo de via (micro) ou tempo de percurso (ônibus).
import fs from 'node:fs';
import path from 'node:path';
import { config, DATA_DIR } from './dados.js';
import { dist, type LatLon } from './geo.js';

export type Infra = 'ciclovia' | 'ciclofaixa' | 'compartilhada' | 'sem';
export type Perfil = 'caminhada' | 'micro' | 'onibus';

const FATORES: Record<Infra, number> = { ciclovia: 0.55, ciclofaixa: 0.7, compartilhada: 1.0, sem: 1.8 };
// velocidade média do ônibus por classe de via (km/h), só para escolher o caminho
const VEL_ONIBUS: Record<string, number> = {
  motorway: 70, trunk: 55, primary: 45, secondary: 40, tertiary: 35, unclassified: 28, residential: 25,
  living_street: 12, service: 10, motorway_link: 40, trunk_link: 35, primary_link: 35, secondary_link: 30, tertiary_link: 28,
};
const BIT: Record<Perfil, number> = { onibus: 1, micro: 2, caminhada: 4 };

interface Via { h: string; o: number; ob: number; m: string; i: Infra; n?: string; v: number[] }
const viario: { nos: number[]; vias: Via[] } = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'viario.json'), 'utf8'));

interface Aresta { para: number; len: number; infra: Infra; mask: number; vel: number }
const lat: number[] = [];
const lon: number[] = [];
const adj: Aresta[][] = [];
for (let k = 0; k < viario.nos.length; k += 2) {
  lat.push(viario.nos[k]);
  lon.push(viario.nos[k + 1]);
  adj.push([]);
}
const pos = (n: number): LatLon => [lat[n], lon[n]];

// Segmentos (para encaixar um ponto qualquer na via mais próxima)
interface Seg { a: number; b: number; len: number; infra: Infra; ida: number; volta: number; vel: number }
const segs: Seg[] = [];

const naZonaIndustrial = (p: LatLon) => config.zonasIndustriais.some((z) => dist(p, [z.lat, z.lon]) <= z.raioM);

for (const v of viario.vias) {
  const carro = v.m.includes('c'), bike = v.m.includes('b'), pe = v.m.includes('p');
  const vel = VEL_ONIBUS[v.h] ?? 20;
  for (let k = 0; k < v.v.length - 1; k++) {
    const a = v.v[k], b = v.v[k + 1];
    if (a === b) continue;
    const len = dist(pos(a), pos(b));
    // na zona industrial (tráfego de caminhões) rua sem ciclovia conta como "sem infraestrutura"
    const infra: Infra = v.i === 'compartilhada' && naZonaIndustrial([(lat[a] + lat[b]) / 2, (lon[a] + lon[b]) / 2]) ? 'sem' : v.i;
    let ida = 0, volta = 0;
    if (carro) { if (v.o >= 0) ida |= 1; if (v.o <= 0) volta |= 1; }
    if (bike) {
      const o = v.ob ? v.o : 0;
      if (o >= 0) ida |= 2;
      if (o <= 0) volta |= 2;
    }
    if (pe) { ida |= 4; volta |= 4; }
    if (ida) adj[a].push({ para: b, len, infra, mask: ida, vel });
    if (volta) adj[b].push({ para: a, len, infra, mask: volta, vel });
    segs.push({ a, b, len, infra, ida, volta, vel });
  }
}

// ---------- Maior componente conexo por perfil (evita encaixar em pedaços isolados do mapa) ----------
const naRede: Record<Perfil, Uint8Array> = { caminhada: new Uint8Array(lat.length), micro: new Uint8Array(lat.length), onibus: new Uint8Array(lat.length) };
for (const perfil of Object.keys(BIT) as Perfil[]) {
  const bit = BIT[perfil];
  const viz: number[][] = adj.map(() => []);
  adj.forEach((es, u) => es.forEach((e) => { if (e.mask & bit) { viz[u].push(e.para); viz[e.para].push(u); } }));
  const comp = new Int32Array(lat.length).fill(-1);
  const tamanhos: number[] = [];
  for (let s = 0; s < lat.length; s++) {
    if (comp[s] >= 0 || !viz[s].length) continue;
    const c = tamanhos.length;
    let n = 0;
    const pilha = [s];
    comp[s] = c;
    while (pilha.length) {
      const u = pilha.pop()!;
      n++;
      for (const w of viz[u]) if (comp[w] < 0) { comp[w] = c; pilha.push(w); }
    }
    tamanhos.push(n);
  }
  const maior = tamanhos.indexOf(Math.max(...tamanhos));
  for (let n = 0; n < lat.length; n++) if (comp[n] === maior) naRede[perfil][n] = 1;
}

// ---------- Índice espacial dos segmentos (grade de ~220 m) ----------
const CELULA = 0.002;
const grade = new Map<string, number[]>();
const chave = (i: number, j: number) => `${i},${j}`;
segs.forEach((s, k) => {
  const i0 = Math.floor(Math.min(lat[s.a], lat[s.b]) / CELULA), i1 = Math.floor(Math.max(lat[s.a], lat[s.b]) / CELULA);
  const j0 = Math.floor(Math.min(lon[s.a], lon[s.b]) / CELULA), j1 = Math.floor(Math.max(lon[s.a], lon[s.b]) / CELULA);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const c = chave(i, j);
    const l = grade.get(c);
    if (l) l.push(k); else grade.set(c, [k]);
  }
});

console.log(`[grafo] viário real (OSM): ${lat.length} nós, ${segs.length} segmentos`);

interface Encaixe { seg: Seg; t: number; q: LatLon; off: number }

/** Projeta p no segmento de via mais próximo que o perfil pode usar. */
function encaixar(p: LatLon, perfil: Perfil): Encaixe | null {
  const bit = BIT[perfil];
  const ci = Math.floor(p[0] / CELULA), cj = Math.floor(p[1] / CELULA);
  let melhor = null as Encaixe | null;
  const kx = Math.cos((p[0] * Math.PI) / 180);
  for (let raio = 0; raio <= 12; raio++) {
    for (let i = ci - raio; i <= ci + raio; i++)
      for (let j = cj - raio; j <= cj + raio; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== raio) continue; // só o anel novo
        for (const k of grade.get(chave(i, j)) ?? []) {
          const s = segs[k];
          if (!((s.ida | s.volta) & bit) || !naRede[perfil][s.a] || !naRede[perfil][s.b]) continue;
          if (perfil === 'onibus' && s.vel <= 12) continue; // ônibus não parte de via de serviço/viela
          const bx = (lon[s.b] - lon[s.a]) * kx, by = lat[s.b] - lat[s.a];
          const px = (p[1] - lon[s.a]) * kx, py = p[0] - lat[s.a];
          const t = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by || 1e-12)));
          const q: LatLon = [lat[s.a] + (lat[s.b] - lat[s.a]) * t, lon[s.a] + (lon[s.b] - lon[s.a]) * t];
          const off = dist(p, q);
          if (!melhor || off < melhor.off) melhor = { seg: s, t, q, off };
        }
      }
    // achou algo e o próximo anel já está mais longe do que o melhor encontrado
    if (melhor && melhor.off < raio * CELULA * 111320 * kx) break;
  }
  return melhor;
}

// ---------- A* com heap binário ----------
class Heap {
  private a: [number, number][] = [];
  get tamanho() { return this.a.length; }
  push(n: number, f: number) {
    const a = this.a;
    a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const topo = a[0][1];
    const ult = a.pop()!;
    if (a.length) {
      a[0] = ult;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return topo;
  }
}

export interface Segmento { pontos: LatLon[]; infra: Infra; distanciaM: number }
export interface Rota { pontos: LatLon[]; segmentos: Segmento[]; distanciaM: number; percentualCiclovia: number }

const custoAresta = (len: number, infra: Infra, vel: number, perfil: Perfil) =>
  perfil === 'onibus' ? len / vel : perfil === 'micro' ? len * FATORES[infra] : len;
// heurística admissível: menor custo possível por metro em cada perfil
const CUSTO_MIN: Record<Perfil, number> = { onibus: 1 / 70, micro: FATORES.ciclovia, caminhada: 1 };

function rotaReta(a: LatLon, b: LatLon): Rota {
  const d = dist(a, b);
  return { pontos: [a, b], segmentos: [{ pontos: [a, b], infra: 'compartilhada', distanciaM: d }], distanciaM: d, percentualCiclovia: 0 };
}

/** Rota de `a` até `b` pelas ruas, com os trechos classificados por infraestrutura. */
export function rotear(a: LatLon, b: LatLon, perfil: Perfil): Rota {
  const bit = BIT[perfil];
  const ea = encaixar(a, perfil);
  const eb = encaixar(b, perfil);
  if (!ea || !eb) return rotaReta(a, b);

  // nós virtuais: S (ponto de origem encaixado na via) e T (destino encaixado)
  const S = lat.length, T = lat.length + 1;
  const extra = new Map<number, Aresta[]>([[S, []], [T, []]]);
  const arestas = (u: number) => (u >= S ? extra.get(u)! : adj[u]);
  const temporarias: [number, Aresta][] = [];
  const ligarT = (u: number, e: Aresta) => { adj[u].push(e); temporarias.push([u, e]); };
  const posV = (n: number): LatLon => (n === S ? ea.q : n === T ? eb.q : pos(n));

  {
    const s = ea.seg;
    if (s.volta & bit) extra.get(S)!.push({ para: s.a, len: s.len * ea.t, infra: s.infra, mask: bit, vel: s.vel });
    if (s.ida & bit) extra.get(S)!.push({ para: s.b, len: s.len * (1 - ea.t), infra: s.infra, mask: bit, vel: s.vel });
  }
  {
    const s = eb.seg;
    if (s.ida & bit) ligarT(s.a, { para: T, len: s.len * eb.t, infra: s.infra, mask: bit, vel: s.vel });
    if (s.volta & bit) ligarT(s.b, { para: T, len: s.len * (1 - eb.t), infra: s.infra, mask: bit, vel: s.vel });
  }
  if (ea.seg === eb.seg) {
    const s = ea.seg;
    const frente = eb.t >= ea.t;
    if ((frente ? s.ida : s.volta) & bit)
      extra.get(S)!.push({ para: T, len: s.len * Math.abs(eb.t - ea.t), infra: s.infra, mask: bit, vel: s.vel });
  }

  const g = new Map<number, number>([[S, 0]]);
  const veio = new Map<number, { de: number; infra: Infra }>();
  const fechado = new Set<number>();
  const heap = new Heap();
  const h = (n: number) => dist(posV(n), eb.q) * CUSTO_MIN[perfil];
  heap.push(S, h(S));
  try {
    while (heap.tamanho) {
      const u = heap.pop();
      if (u === T) break;
      if (fechado.has(u)) continue;
      fechado.add(u);
      const gu = g.get(u)!;
      for (const e of arestas(u)) {
        if (!(e.mask & bit)) continue;
        const custo = gu + custoAresta(e.len, e.infra, e.vel, perfil);
        if (custo < (g.get(e.para) ?? Infinity)) {
          g.set(e.para, custo);
          veio.set(e.para, { de: u, infra: e.infra });
          heap.push(e.para, custo + h(e.para));
        }
      }
    }
  } finally {
    for (const [u, e] of temporarias) adj[u].splice(adj[u].indexOf(e), 1);
  }
  if (!veio.has(T)) return rotaReta(a, b);

  // reconstrói o caminho
  const nos: number[] = [T];
  const infras: Infra[] = [];
  let cur = T;
  while (cur !== S) {
    const v = veio.get(cur)!;
    infras.unshift(v.infra);
    nos.unshift(v.de);
    cur = v.de;
  }
  // ligações do ponto real até a via (ex.: de dentro do lote até a rua)
  const pontos: LatLon[] = [a, ...nos.map(posV), b];
  const infraPorAresta: Infra[] = ['compartilhada', ...infras, 'compartilhada'];

  const segmentos: Segmento[] = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const d = dist(pontos[i], pontos[i + 1]);
    if (d < 0.5) continue;
    const inf = infraPorAresta[i];
    const ult = segmentos[segmentos.length - 1];
    if (ult && ult.infra === inf) {
      ult.pontos.push(pontos[i + 1]);
      ult.distanciaM += d;
    } else segmentos.push({ pontos: [pontos[i], pontos[i + 1]], infra: inf, distanciaM: d });
  }
  const distanciaM = segmentos.reduce((s2, x) => s2 + x.distanciaM, 0);
  const ciclo = segmentos.filter((x) => x.infra === 'ciclovia' || x.infra === 'ciclofaixa').reduce((s2, x) => s2 + x.distanciaM, 0);
  return {
    pontos: pontos.filter((p, i) => i === 0 || dist(p, pontos[i - 1]) >= 0.5),
    segmentos, distanciaM, percentualCiclovia: distanciaM > 0 ? Math.round((ciclo / distanciaM) * 100) : 0,
  };
}

/** Ponto da via (do perfil) mais próximo de `p` — usado para colocar paradas na rua. */
export function pontoNaVia(p: LatLon, perfil: Perfil): LatLon {
  return encaixar(p, perfil)?.q ?? p;
}
