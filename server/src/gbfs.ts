// Simulador GBFS: estações Ecobike (station_information + station_status)
// e patinetes elétricos soltos (vehicle_status, GBFS v3 / free_bike_status v2).
// Para usar dados reais, troque as funções abaixo pela leitura do feed GBFS do operador.
import { config, stationInformation } from './dados.js';
import { dist, offset, rng, type LatLon } from './geo.js';

export interface Estacao {
  id: string; nome: string; lat: number; lon: number; capacidade: number; bikes: number; vagas: number;
}
export interface Patinete {
  id: string; lat: number; lon: number; bateria: number; autonomiaM: number; tipo: 'patinete'; reservado: boolean;
}

const info: { station_id: string; name: string; lat: number; lon: number; capacity: number }[] =
  stationInformation.data.stations;

// Ocupação inicial pensada para a demo (o restante é aleatório).
const inicial: Record<string, number> = { 'eco-tc': 4, 'eco-esplendor': 5, 'eco-di': 3, 'eco-tr': 6, 'eco-giomi': 2 };

let bikes = new Map<string, number>();
let patinetes: Patinete[] = [];
let r = rng(42);

/** Estações que o modo demo forçou a ficar vazias (não voltam a encher sozinhas). */
const forcadasVazias = new Set<string>();

function semear() {
  r = rng(42);
  forcadasVazias.clear();
  bikes = new Map(info.map((s) => [s.station_id, inicial[s.station_id] ?? 2 + Math.floor(r() * (s.capacity - 3))]));
  const pontos: { c: LatLon; n: number; raio: number }[] = [
    // 2 patinetes a ~100 m dos terminais e do distrito (garantem o alerta da demo)
    { c: [config.terminais.central.lat, config.terminais.central.lon], n: 3, raio: 140 },
    { c: [config.terminais.rodoviario.lat, config.terminais.rodoviario.lon], n: 2, raio: 140 },
    { c: [-23.1369, -47.2284], n: 3, raio: 130 }, // Distrito Industrial Nova Era
    { c: [-23.1316, -47.2321], n: 2, raio: 200 }, // Domingos Giomi
    { c: [-23.0893, -47.2150], n: 3, raio: 300 }, // centro
    { c: [-23.0810, -47.2050], n: 2, raio: 300 }, // cidade nova
    { c: [-23.0870, -47.1930], n: 1, raio: 300 }, // jardim esplendor
    { c: [-23.1057, -47.2040], n: 2, raio: 250 }, // bartolomai
    { c: [-23.1200, -47.2400], n: 2, raio: 400 }, // morada do sol
    { c: [-23.1043, -47.2281], n: 2, raio: 250 }, // parque ecológico
  ];
  patinetes = [];
  let n = 1;
  for (const p of pontos)
    for (let i = 0; i < p.n; i++) {
      const ang = r() * Math.PI * 2;
      const d = p.raio * (0.5 + r() * 0.5);
      const pos = offset(p.c, Math.cos(ang) * d, Math.sin(ang) * d);
      const bateria = Math.round(40 + r() * 58);
      patinetes.push({
        id: `pat-${String(n++).padStart(3, '0')}`, lat: pos[0], lon: pos[1], bateria,
        autonomiaM: bateria * 250, tipo: 'patinete', reservado: false,
      });
    }
}
semear();

/** Um passo da simulação (chamado a cada 3 s). */
export function passoGbfs() {
  for (const s of info) {
    if (forcadasVazias.has(s.station_id)) continue;
    if (r() < 0.06) {
      const atual = bikes.get(s.station_id)!;
      const delta = r() < 0.5 ? -1 : 1;
      // limites [1, capacidade-1]: a estação só fica vazia/cheia de verdade pelo modo demo
      bikes.set(s.station_id, Math.max(1, Math.min(s.capacity - 1, atual + delta)));
    }
  }
  for (const p of patinetes) {
    if (r() < 0.02) p.bateria = Math.max(5, p.bateria - 1);
    if (p.bateria < 15 && r() < 0.01) p.bateria = 100; // recolhido e recarregado
    p.autonomiaM = p.bateria * 250;
    // pequeno deslocamento de GPS (ruído)
    const q = offset([p.lat, p.lon], (r() - 0.5) * 2, (r() - 0.5) * 2);
    p.lat = q[0]; p.lon = q[1];
  }
}

export function estacoes(): Estacao[] {
  return info.map((s) => {
    const b = bikes.get(s.station_id) ?? 0;
    return { id: s.station_id, nome: s.name, lat: s.lat, lon: s.lon, capacidade: s.capacity, bikes: b, vagas: s.capacity - b };
  });
}

export function listaPatinetes(): Patinete[] {
  return patinetes.filter((p) => !p.reservado);
}

export function esvaziarEstacao(id: string): Estacao | undefined {
  if (!bikes.has(id)) return undefined;
  bikes.set(id, 0);
  forcadasVazias.add(id);
  return estacoes().find((e) => e.id === id);
}

export function resetarGbfs() {
  semear();
}

export function patinetesProximos(p: LatLon, raio: number, bateriaMin = 0) {
  return listaPatinetes()
    .map((v) => ({ v, d: dist(p, [v.lat, v.lon]) }))
    .filter((x) => x.d <= raio && x.v.bateria >= bateriaMin)
    .sort((a, b) => a.d - b.d);
}

// ---- Feeds no formato GBFS ----
const ttl = 3;
const agoraS = () => Math.floor(Date.now() / 1000);
const envelope = (data: unknown, version = '2.3') => ({ last_updated: agoraS(), ttl, version, data });

export const gbfs = {
  descoberta(base: string) {
    const feeds = ['system_information', 'vehicle_types', 'station_information', 'station_status', 'vehicle_status', 'free_bike_status']
      .map((name) => ({ name, url: `${base}/${name}.json` }));
    return envelope({ pt: { feeds } });
  },
  systemInformation: () => envelope({
    system_id: 'ecobike-indaiatuba-sim', language: 'pt-BR', name: 'Ecobike Indaiatuba (simulado)',
    operator: 'Simulação – Indaiatuba Integra', timezone: 'America/Sao_Paulo',
  }),
  vehicleTypes: () => envelope({
    vehicle_types: [
      { vehicle_type_id: 'bike', form_factor: 'bicycle', propulsion_type: 'human', name: 'Ecobike' },
      { vehicle_type_id: 'patinete', form_factor: 'scooter_standing', propulsion_type: 'electric', max_range_meters: 25000, name: 'Patinete elétrico' },
    ],
  }),
  stationInformation: () => envelope({
    stations: info.map((s) => ({ station_id: s.station_id, name: s.name, lat: s.lat, lon: s.lon, capacity: s.capacity })),
  }),
  stationStatus: () => envelope({
    stations: estacoes().map((e) => ({
      station_id: e.id, num_bikes_available: e.bikes, num_docks_available: e.vagas,
      is_installed: true, is_renting: true, is_returning: true, last_reported: agoraS(),
    })),
  }),
  vehicleStatus: () => envelope({
    vehicles: listaPatinetes().map((p) => ({
      vehicle_id: p.id, lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), is_reserved: p.reservado, is_disabled: false,
      vehicle_type_id: 'patinete', current_range_meters: p.autonomiaM, current_fuel_percent: p.bateria / 100,
      last_reported: agoraS(),
    })),
  }, '3.0'),
  freeBikeStatus: () => envelope({
    bikes: listaPatinetes().map((p) => ({
      bike_id: p.id, lat: p.lat, lon: p.lon, is_reserved: p.reservado, is_disabled: false,
      vehicle_type_id: 'patinete', current_range_meters: p.autonomiaM,
    })),
  }),
};
