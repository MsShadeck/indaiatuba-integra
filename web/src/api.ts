import type { Config, Itinerario, Lugar, Rede } from './tipos';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(corpo.erro ?? `Erro ${r.status} em ${url}`);
  }
  return r.json();
}

export const api = {
  config: () => json<Config>('/api/config'),
  rede: () => json<Rede>('/api/rede'),
  ciclovias: () => json<GeoJSON.FeatureCollection>('/api/ciclovias'),
  lugares: () => json<Lugar[]>('/api/lugares'),
  info: () => json<{ urls: string[] }>('/api/info'),
  geocode: (q: string, signal?: AbortSignal) =>
    json<{ resultados: Lugar[]; offline: boolean }>(`/api/geocode?q=${encodeURIComponent(q)}`, { signal }),
  planejar: (de: Lugar, para: Lugar) =>
    json<{ opcoes: Itinerario[]; avisos?: string[] }>('/api/planejar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ de, para }),
    }),
  partidas: (paradaId: string) => json<{ parada: { nome: string }; partidas: any[] }>(`/api/paradas/${paradaId}/partidas?limite=8`),
  impacto: () => json<{ viagens: ViagemImpacto[] }>('/api/impacto'),
  esvaziarEstacao: (id: string) => json(`/api/demo/estacao/${id}/esvaziar`, { method: 'POST' }),
  resetDemo: () => json('/api/demo/reset', { method: 'POST' }),
};

export interface ViagemImpacto {
  data: string; descricao: string; modos: string[]; distanciaKm: number;
  carroKg: number; viagemKg: number; evitadoKg: number; mock?: boolean;
}
