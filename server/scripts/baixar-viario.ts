/**
 * Baixa o viário REAL de Indaiatuba do OpenStreetMap (Overpass API) e gera:
 *   - server/data/viario.json      grafo compacto de ruas usado pelo roteamento (grafo.ts) e pelo gerar-gtfs
 *   - server/data/ciclovias.geojson ciclovias/ciclofaixas reais do OSM (camada do mapa)
 *
 * Uso: npm run baixar-viario            (baixa da Overpass)
 *      npm run baixar-viario -- osm.json (reaproveita uma resposta da Overpass já salva)
 *
 * Dados © colaboradores do OpenStreetMap, licença ODbL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const config = JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8'));
const { sul, oeste, norte, leste } = config.limitesBusca;

const TIPOS = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  'cycleway', 'footway', 'pedestrian', 'path', 'steps',
];
const consulta = `[out:json][timeout:120];way["highway"~"^(${TIPOS.join('|')})$"](${sul},${oeste},${norte},${leste});(._;>;);out body qt;`;

async function baixar(): Promise<any> {
  const local = process.argv[2];
  if (local) return JSON.parse(fs.readFileSync(local, 'utf8'));
  console.log('Baixando o viário da Overpass API...');
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': process.env.NOMINATIM_UA || 'IndaiatubaIntegra/0.1 (prototipo de hackathon)' },
    body: 'data=' + encodeURIComponent(consulta),
  });
  if (!r.ok) throw new Error(`Overpass respondeu ${r.status}`);
  return r.json();
}

type Infra = 'ciclovia' | 'ciclofaixa' | 'compartilhada' | 'sem';

const osm = await baixar();
const nosOsm = new Map<number, [number, number]>();
for (const e of osm.elements) if (e.type === 'node') nosOsm.set(e.id, [e.lat, e.lon]);

const indice = new Map<number, number>();
const nos: number[] = [];
const idx = (id: number) => {
  let i = indice.get(id);
  if (i === undefined) {
    const p = nosOsm.get(id)!;
    i = nos.length / 2;
    nos.push(+p[0].toFixed(6), +p[1].toFixed(6));
    indice.set(id, i);
  }
  return i;
};

const rapidas = /^(motorway|trunk|primary|secondary)(_link)?$/;
const ehFaixa = (t: Record<string, string>) =>
  Object.entries(t).some(([k, v]) => /^cycleway(:(left|right|both))?$/.test(k) && /^(lane|share_sidewalk|shared_lane)$/.test(v));
const ehTrack = (t: Record<string, string>) =>
  Object.entries(t).some(([k, v]) => /^cycleway(:(left|right|both))?$/.test(k) && v === 'track');

interface Via {
  /** classe OSM (highway) */ h: string;
  /** mão única para veículos: 1 = sentido dos nós, -1 = contrário, 0 = mão dupla */ o: number;
  /** mão única também vale para bike? */ ob: number;
  /** modos permitidos: c = carro/ônibus, b = bike/patinete, p = pedestre */ m: string;
  /** infraestrutura cicloviária */ i: Infra;
  /** nome da via */ n?: string;
  /** nós (índices em `nos`) */ v: number[];
}
const vias: Via[] = [];
const cicloFeatures: any[] = [];

for (const e of osm.elements) {
  if (e.type !== 'way' || !e.nodes?.every((n: number) => nosOsm.has(n))) continue;
  const t: Record<string, string> = e.tags ?? {};
  const h = t.highway;
  if (t.area === 'yes' || t.access === 'private' || t.access === 'no') continue;
  if (h === 'service' && /^(parking_aisle|driveway)$/.test(t.service ?? '')) continue;

  const pedonal = /^(footway|pedestrian|path|steps)$/.test(h);
  const bikeOk = h === 'cycleway' || (!/^(motorway|motorway_link|steps)$/.test(h) && t.bicycle !== 'no' &&
    (!/^(footway|pedestrian)$/.test(h) || /^(yes|designated|permissive)$/.test(t.bicycle ?? '')));
  const peOk = !/^(motorway|motorway_link|trunk)$/.test(h) && t.foot !== 'no' && (h !== 'cycleway' || t.foot !== 'no');
  const carroOk = !pedonal && h !== 'cycleway' && t.motor_vehicle !== 'no' && t.motorcar !== 'no';
  const m = (carroOk ? 'c' : '') + (bikeOk ? 'b' : '') + (peOk ? 'p' : '');
  if (!m) continue;

  let infra: Infra;
  if (h === 'cycleway' || ehTrack(t) || (pedonal && t.bicycle === 'designated')) infra = 'ciclovia';
  else if (ehFaixa(t)) infra = 'ciclofaixa';
  else if (rapidas.test(h)) infra = 'sem';
  else infra = 'compartilhada';

  const ow = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || /^motorway/.test(h) ? 1 : t.oneway === '-1' ? -1 : 0;
  const ob = ow !== 0 && t['oneway:bicycle'] !== 'no' && h !== 'cycleway' ? 1 : 0;

  const via: Via = { h, o: ow, ob, m, i: infra, v: e.nodes.map(idx) };
  if (t.name) via.n = t.name;
  vias.push(via);

  if (infra === 'ciclovia' || infra === 'ciclofaixa')
    cicloFeatures.push({
      type: 'Feature',
      properties: { nome: t.name ?? (h === 'cycleway' ? 'Ciclovia' : 'Ciclofaixa'), tipo: infra, fonte: 'OpenStreetMap', osm_id: e.id },
      geometry: { type: 'LineString', coordinates: e.nodes.map((n: number) => { const p = nosOsm.get(n)!; return [p[1], p[0]]; }) },
    });
}

fs.writeFileSync(path.join(DATA, 'viario.json'), JSON.stringify({
  _fonte: `© colaboradores do OpenStreetMap (ODbL) – extraído em ${new Date().toISOString().slice(0, 10)} via Overpass API`,
  nos, vias,
}));
fs.writeFileSync(path.join(DATA, 'ciclovias.geojson'), JSON.stringify({
  type: 'FeatureCollection',
  _aviso: 'Malha cicloviária REAL extraída do OpenStreetMap (highway=cycleway e cycleway=lane/track). Pode estar incompleta; complemente com o cadastro oficial da Prefeitura.',
  features: cicloFeatures,
}, null, 1));

console.log(`Viário salvo: ${nos.length / 2} nós, ${vias.length} vias, ${cicloFeatures.length} trechos de ciclovia/ciclofaixa.`);
