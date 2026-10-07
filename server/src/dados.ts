// Carrega os arquivos de configuração e dados estáticos de server/data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

const lerJson = <T = any>(arquivo: string): T => JSON.parse(fs.readFileSync(path.join(DATA_DIR, arquivo), 'utf8'));

export interface Terminal {
  id: string; nome: string; nomeCurto: string; lat: number; lon: number; raioAreaM: number;
}

export interface Config {
  cidade: string;
  centroMapa: { lat: number; lon: number; zoom: number };
  limitesBusca: { oeste: number; norte: number; leste: number; sul: number };
  terminais: Record<'central' | 'rodoviario', Terminal>;
  velocidadesKmh: { caminhada: number; bike: number; patinete: number; patineteAreaTerminal: number; onibusMedia: number };
  planejador: {
    raioCaminhadaMaxM: number; raioAcessoMaxM: number; raioEstacaoM: number; raioPatineteM: number;
    bateriaMinimaPatinete: number; distanciaMaxSoMicroM: number; folgaEmbarqueS: number;
  };
  zonasIndustriais: { nome: string; lat: number; lon: number; raioM: number }[];
}

export interface Emissoes {
  fatoresKgPorKm: Record<'carro' | 'onibus' | 'bike' | 'caminhada' | 'patinete', number>;
  fatorDesvioCarro: number;
  equivalencias: { kgCo2PorArvoreAno: number };
}

export interface Lugar { id: string; nome: string; lat: number; lon: number; tipo: string }

export const config = lerJson<Config>('config.json');
export const emissoes = lerJson<Emissoes>('emissoes.json');
export const lugares = lerJson<{ lugares: Lugar[] }>('lugares.json').lugares;
export const ciclovias = lerJson<any>('ciclovias.geojson');
export const stationInformation = lerJson<any>('gbfs/station_information.json');
export const terminais = Object.values(config.terminais);
