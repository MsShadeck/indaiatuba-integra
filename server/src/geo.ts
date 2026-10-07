// Utilitários geográficos simples (suficientes para distâncias urbanas de poucos km).

export type LatLon = [number, number]; // [lat, lon]

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distância em metros (haversine). */
export function dist(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rumo em graus (0 = norte) de a para b. */
export function bearing(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x =
    Math.cos(rad(a[0])) * Math.sin(rad(b[0])) -
    Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function lerp(a: LatLon, b: LatLon, t: number): LatLon {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Distâncias acumuladas ao longo de uma polilinha. */
export function cumulative(points: LatLon[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + dist(points[i - 1], points[i]));
  return out;
}

export function lineLength(points: LatLon[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  return s;
}

/** Ponto a `d` metros do início da polilinha (com distâncias acumuladas `cum`). */
export function pointAlong(points: LatLon[], cum: number[], d: number): { p: LatLon; i: number } {
  if (d <= 0) return { p: points[0], i: 0 };
  const total = cum[cum.length - 1];
  if (d >= total) return { p: points[points.length - 1], i: points.length - 2 };
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  return { p: lerp(points[lo], points[hi], (d - cum[lo]) / seg), i: lo };
}

/** Trecho da polilinha entre as distâncias d0 e d1. */
export function slice(points: LatLon[], cum: number[], d0: number, d1: number): LatLon[] {
  const a = pointAlong(points, cum, d0);
  const b = pointAlong(points, cum, d1);
  const out: LatLon[] = [a.p];
  for (let i = a.i + 1; i <= b.i; i++) out.push(points[i]);
  out.push(b.p);
  return out;
}

/** Projeta p na polilinha; retorna distância ao longo dela e distância perpendicular. */
export function project(points: LatLon[], cum: number[], p: LatLon): { along: number; off: number } {
  let best = { along: 0, off: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // aproximação plana local
    const kx = Math.cos(rad(a[0]));
    const ax = 0, ay = 0;
    const bx = (b[1] - a[1]) * kx, by = b[0] - a[0];
    const px = (p[1] - a[1]) * kx, py = p[0] - a[0];
    const len2 = bx * bx + by * by || 1e-12;
    let t = ((px - ax) * bx + (py - ay) * by) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = lerp(a, b, t);
    const off = dist(q, p);
    if (off < best.off) best = { along: cum[i] + (cum[i + 1] - cum[i]) * t, off };
  }
  return best;
}

/** Densifica a polilinha para que nenhum segmento passe de `step` metros. */
export function densify(points: LatLon[], step: number): LatLon[] {
  const out: LatLon[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1], points[i]);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push(lerp(points[i - 1], points[i], k / n));
  }
  return out;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Desloca um ponto em metros (norte, leste). */
export function offset(p: LatLon, northM: number, eastM: number): LatLon {
  return [p[0] + northM / 111320, p[1] + eastM / (111320 * Math.cos(rad(p[0])))];
}
