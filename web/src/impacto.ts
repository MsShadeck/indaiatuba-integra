import type { ViagemImpacto } from './api';
import type { Itinerario } from './tipos';

const CHAVE = 'indaiatuba-integra:viagens';

export function viagensLocais(): ViagemImpacto[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
  } catch {
    return [];
  }
}

export function registrarViagem(it: Itinerario, de: string, para: string) {
  const v: ViagemImpacto = {
    data: new Date().toISOString(),
    descricao: `${de.split(' – ')[0]} → ${para.split(' – ')[0]}`,
    modos: [...new Set(it.modos.filter((m) => m !== 'caminhada'))],
    distanciaKm: it.co2.distanciaKm,
    carroKg: it.co2.carroKg,
    viagemKg: it.co2.viagemKg,
    evitadoKg: it.co2.evitadoKg,
  };
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...viagensLocais(), v]));
  } catch {
    /* navegação privada: ignora */
  }
  return v;
}
