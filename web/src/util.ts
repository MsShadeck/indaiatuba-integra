import type { AoVivo, Itinerario, LatLon } from './tipos';

export const hora = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`);
export const kg = (v: number) => (v >= 1 ? `${v.toFixed(2).replace('.', ',')} kg` : `${Math.round(v * 1000)} g`);
export const num = (v: number, casas = 1) => v.toFixed(casas).replace('.', ',');

export function distM(a: LatLon, b: LatLon) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Previsão ao vivo do ônibus do itinerário: usa o atraso atual do veículo (GTFS-RT simulado). */
export function etaOnibus(it: Itinerario, aoVivo: AoVivo | null, agora: number) {
  const t = it.trechos.find((x) => x.onibus);
  if (!t?.onibus) return null;
  const v = aoVivo?.veiculos.find((x) => x.tripId === t.onibus!.tripId);
  const previstaMs = v ? t.onibus.partidaProgramadaMs + v.atrasoS * 1000 : t.onibus.partidaPrevistaMs;
  return {
    linha: t.onibus.linha,
    cor: t.onibus.cor,
    parada: t.onibus.paradaEmbarque,
    previstaMs,
    min: Math.max(0, Math.round((previstaMs - agora) / 60000)),
    passou: previstaMs < agora - 30000,
    atrasoS: v?.atrasoS ?? t.onibus.atrasoS,
    aoVivo: !!v,
    veiculo: v ?? null,
  };
}
