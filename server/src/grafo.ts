// Roteamento leve para caminhada, bike e patinete.
//
// Não temos o viário real offline, então o grafo é:
//   (1) uma malha SINTÉTICA de ruas (grade ~180 m com diagonais), onde algumas linhas da grade
//       fazem o papel de avenidas sem infraestrutura cicloviária e a zona industrial é toda "sem infra";
//   (2) as ciclovias/ciclofaixas do GeoJSON, densificadas e conectadas à malha.
// O custo de cada aresta = comprimento × fator do tipo de via, de acordo com o perfil.
// Para produção: troque a malha sintética pelo viário do OpenStreetMap (ex.: extrato .osm.pbf
// filtrado por highway=*), mantendo a mesma classificação de infraestrutura.
import { ciclovias, config } from './dados';
import { densify, dist, type LatLon } from './geo';

export type Infra = 'ciclovia' | 'ciclofaixa' | 'compartilhada' | 'sem';
export type Perfil = 'caminhada' | 'micro';

const FATORES: Record<Perfil, Record<Infra, number>> = {
  // prioriza ciclovias/ciclofaixas e evita vias sem infraestrutura
  micro: { ciclovia: 0.55, ciclofaixa: 0.7, compartilhada: 1.0, sem: 1.8 },
  caminhada: { ciclovia: 1.0, ciclofaixa: 1.0, compartilhada: 1.0, sem: 1.0 },
};
const FATOR_MIN: Record<Perfil, number> = { micro: 0.55, caminhada: 1.0 };

interface Aresta { para: number; len: number; infra: Infra }
const lat: number[] = [];
const lon: number[] = [];
const adj: Aresta[][] = [];

function novoNo(p: LatLon) {
  lat.push(p[0]);
  lon.push(p[1]);
  adj.push([]);
  return lat.length - 1;
}
function ligar(a: number, b: number, infra: Infra) {
  const len = dist([lat[a], lon[a]], [lat[b], lon[b]]);
  adj[a].push({ para: b, len, infra });
  adj[b].push({ para: a, len, infra });
}

// ---------- (1) Malha sintética ----------
const PASSO_M = 180;
const LAT0 = -23.16, LAT1 = -23.04, LON0 = -47.275, LON1 = -47.155;
const DLAT = PASSO_M / 111320;
const DLON = PASSO_M / (111320 * Math.cos((23.1 * Math.PI) / 180));
const LINHAS = Math.ceil((LAT1 - LAT0) / DLAT) + 1;
const COLS = Math.ceil((LON1 - LON0) / DLON) + 1;
const idGrade = (r: number, c: number) => r * COLS + c;

for (let r = 0; r < LINHAS; r++) for (let c = 0; c < COLS; c++) novoNo([LAT0 + r * DLAT, LON0 + c * DLON]);

const naZonaIndustrial = (p: LatLon) => config.zonasIndustriais.some((z) => dist(p, [z.lat, z.lon]) <= z.raioM);
for (let r = 0; r < LINHAS; r++)
  for (let c = 0; c < COLS; c++) {
    const a = idGrade(r, c);
    const viz: [number, number, boolean][] = [[r, c + 1, false], [r + 1, c, false], [r + 1, c + 1, true], [r + 1, c - 1, true]];
    for (const [r2, c2, diag] of viz) {
      if (r2 >= LINHAS || c2 < 0 || c2 >= COLS) continue;
      const b = idGrade(r2, c2);
      const meio: LatLon = [(lat[a] + lat[b]) / 2, (lon[a] + lon[b]) / 2];
      // avenidas: a cada 5 linhas/colunas da grade (vias rápidas, sem infraestrutura)
      const avenida = !diag && ((r === r2 && r % 5 === 0) || (c === c2 && c % 5 === 0));
      ligar(a, b, naZonaIndustrial(meio) || avenida ? 'sem' : 'compartilhada');
    }
  }
const NOS_GRADE = lat.length;

function noGradeMaisProximo(p: LatLon): number {
  const r = Math.max(0, Math.min(LINHAS - 1, Math.round((p[0] - LAT0) / DLAT)));
  const c = Math.max(0, Math.min(COLS - 1, Math.round((p[1] - LON0) / DLON)));
  return idGrade(r, c);
}

// ---------- (2) Ciclovias e ciclofaixas ----------
const nosCiclo: number[] = [];
for (const f of ciclovias.features as any[]) {
  if (f.geometry?.type !== 'LineString') continue;
  const infra: Infra = f.properties?.tipo === 'ciclovia' ? 'ciclovia' : 'ciclofaixa';
  const pts = densify((f.geometry.coordinates as [number, number][]).map(([x, y]) => [y, x] as LatLon), 50);
  let ant = -1;
  for (const p of pts) {
    // reaproveita nó de ciclovia já existente no mesmo lugar (cruzamentos/encontros)
    let id = nosCiclo.find((n) => dist([lat[n], lon[n]], p) < 20);
    if (id === undefined) {
      id = novoNo(p);
      nosCiclo.push(id);
      // conexão com a malha de ruas
      const g = noGradeMaisProximo(p);
      ligar(id, g, 'compartilhada');
    }
    if (ant >= 0 && ant !== id) ligar(ant, id, infra);
    ant = id;
  }
}

console.log(`[grafo] ${NOS_GRADE} nós de malha + ${nosCiclo.length} nós de ciclovia`);

function noMaisProximo(p: LatLon): number {
  let melhor = noGradeMaisProximo(p);
  let dm = dist(p, [lat[melhor], lon[melhor]]);
  for (const n of nosCiclo) {
    const d = dist(p, [lat[n], lon[n]]);
    if (d < dm) { dm = d; melhor = n; }
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

/** Rota de `a` até `b` no grafo, com os trechos classificados por infraestrutura. */
export function rotear(a: LatLon, b: LatLon, perfil: Perfil): Rota {
  const s = noMaisProximo(a);
  const t = noMaisProximo(b);
  const fat = FATORES[perfil];
  const g = new Map<number, number>([[s, 0]]);
  const veio = new Map<number, { de: number; infra: Infra }>();
  const fechado = new Set<number>();
  const heap = new Heap();
  const h = (n: number) => dist([lat[n], lon[n]], [lat[t], lon[t]]) * FATOR_MIN[perfil];
  heap.push(s, h(s));
  while (heap.tamanho) {
    const u = heap.pop();
    if (u === t) break;
    if (fechado.has(u)) continue;
    fechado.add(u);
    const gu = g.get(u)!;
    for (const e of adj[u]) {
      const custo = gu + e.len * fat[e.infra];
      if (custo < (g.get(e.para) ?? Infinity)) {
        g.set(e.para, custo);
        veio.set(e.para, { de: u, infra: e.infra });
        heap.push(e.para, custo + h(e.para));
      }
    }
  }

  // reconstrói o caminho
  const nos: number[] = [t];
  const infras: Infra[] = [];
  let cur = t;
  while (cur !== s && veio.has(cur)) {
    const v = veio.get(cur)!;
    infras.unshift(v.infra);
    nos.unshift(v.de);
    cur = v.de;
  }
  const pts: LatLon[] = nos.map((n) => [lat[n], lon[n]]);
  // ligações do ponto real até o nó mais próximo
  const pontos: LatLon[] = [a, ...pts, b];
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
