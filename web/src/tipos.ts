export type LatLon = [number, number];
export type Modo = 'caminhada' | 'bike' | 'patinete' | 'onibus';
export type Infra = 'ciclovia' | 'ciclofaixa' | 'compartilhada' | 'sem';

export interface Lugar { id?: string; nome: string; detalhe?: string; lat: number; lon: number; fonte?: string }

export interface Veiculo {
  id: string; tripId: string; routeId: string; linha: string; cor: string; corTexto: string;
  destino: string; lat: number; lon: number; rumo: number; atrasoS: number;
  proximaParadaId: string | null; proximaParadaNome: string | null; status: string;
}
export interface Estacao { id: string; nome: string; lat: number; lon: number; capacidade: number; bikes: number; vagas: number }
export interface Patinete { id: string; lat: number; lon: number; bateria: number; autonomiaM: number }

export interface AoVivo { t: number; veiculos: Veiculo[]; estacoes: Estacao[]; patinetes: Patinete[] }

export interface Terminal { id: string; nome: string; nomeCurto: string; lat: number; lon: number; raioAreaM: number }
export interface Parada { id: string; nome: string; lat: number; lon: number }
export interface LinhaRede {
  key: string; routeId: string; linha: string; nome: string; cor: string; sentido: number; destino: string;
  pontos: LatLon[]; paradas: string[];
}
export interface Rede { paradas: Parada[]; linhas: LinhaRede[]; terminais: Terminal[] }

export interface Config {
  cidade: string;
  centroMapa: { lat: number; lon: number; zoom: number };
  terminais: Record<'central' | 'rodoviario', Terminal>;
  velocidadesKmh: Record<string, number>;
  emissoes: {
    fatoresKgPorKm: Record<string, number>;
    equivalencias: { kgCo2PorArvoreAno: number };
  };
}

export interface Segmento { pontos: LatLon[]; infra: Infra; distanciaM: number }

export interface Trecho {
  modo: Modo;
  de: { nome: string; lat: number; lon: number };
  para: { nome: string; lat: number; lon: number };
  distanciaM: number;
  inicioMs: number;
  fimMs: number;
  geometria: LatLon[];
  segmentos?: Segmento[];
  percentualCiclovia?: number;
  onibus?: {
    routeId: string; linha: string; cor: string; corTexto: string; destino: string; tripId: string;
    paradaEmbarque: string; paradaDesembarque: string; paradas: number;
    partidaProgramadaMs: number; partidaPrevistaMs: number; atrasoS: number; esperaS: number;
  };
  estacaoRetirada?: { id: string; nome: string; bikes: number };
  estacaoDevolucao?: { id: string; nome: string; vagas: number };
  patinete?: { id: string; bateria: number };
}

export interface Itinerario {
  id: string;
  titulo: string;
  modos: Modo[];
  partidaMs: number;
  chegadaMs: number;
  duracaoMin: number;
  trechos: Trecho[];
  disponibilidade: string[];
  percentualCiclovia: number | null;
  co2: { carroKg: number; viagemKg: number; evitadoKg: number; distanciaKm: number };
}
