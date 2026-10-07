// Busca de endereços: lista local (offline) + Nominatim/OpenStreetMap.
// A chamada ao Nominatim passa pelo servidor porque navegadores não deixam
// definir o header User-Agent, exigido pela política de uso do Nominatim.
import { config, lugares } from './dados';

// Política do Nominatim: identifique a aplicação. Defina NOMINATIM_UA com um contato real
// da equipe (ex.: "IndaiatubaIntegra/0.1 (equipe@seudominio.com.br)"). E-mails de exemplo são bloqueados.
const UA = process.env.NOMINATIM_UA ?? 'IndaiatubaIntegra/0.1 (prototipo de hackathon)';
const cache = new Map<string, Resultado[]>();
let ultimaChamada = 0;

export interface Resultado { id: string; nome: string; detalhe?: string; lat: number; lon: number; fonte: 'local' | 'osm' }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function buscarLocal(q: string): Resultado[] {
  const termos = norm(q).split(/\s+/).filter(Boolean);
  return lugares
    .filter((l) => termos.every((t) => norm(l.nome).includes(t)))
    .slice(0, 6)
    .map((l) => ({ id: `local-${l.id}`, nome: l.nome, detalhe: 'Indaiatuba (lista local)', lat: l.lat, lon: l.lon, fonte: 'local' }));
}

async function buscarNominatim(q: string): Promise<Resultado[]> {
  const chave = norm(q);
  if (cache.has(chave)) return cache.get(chave)!;
  // política do Nominatim: no máximo 1 requisição por segundo
  const espera = 1000 - (Date.now() - ultimaChamada);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaChamada = Date.now();
  const b = config.limitesBusca;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: /indaiatuba/i.test(q) ? q : `${q}, Indaiatuba`,
    format: 'jsonv2', limit: '6', countrycodes: 'br', 'accept-language': 'pt-BR',
    viewbox: `${b.oeste},${b.norte},${b.leste},${b.sul}`, bounded: '1',
  }).toString();
  const resp = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4000) });
  if (!resp.ok) throw new Error(`Nominatim ${resp.status}`);
  const json = (await resp.json()) as any[];
  const res: Resultado[] = json.map((x) => {
    const partes = String(x.display_name).split(',').map((s: string) => s.trim());
    return {
      id: `osm-${x.osm_type}-${x.osm_id}`, nome: partes[0], detalhe: partes.slice(1, 3).join(', '),
      lat: +x.lat, lon: +x.lon, fonte: 'osm' as const,
    };
  });
  cache.set(chave, res);
  return res;
}

export async function geocodificar(q: string): Promise<{ resultados: Resultado[]; offline: boolean }> {
  const locais = buscarLocal(q);
  if (q.trim().length < 3) return { resultados: locais, offline: false };
  try {
    const osm = await buscarNominatim(q);
    return { resultados: [...locais, ...osm].slice(0, 8), offline: false };
  } catch {
    return { resultados: locais, offline: true };
  }
}
