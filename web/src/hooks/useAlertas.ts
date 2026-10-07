import { useEffect, useRef } from 'react';
import type { AoVivo, Itinerario, Terminal } from '../tipos';
import { distM, etaOnibus } from '../util';
import type { EstadoSim } from './useSimulacao';

export interface Toast {
  id: string;
  tipo: 'atencao' | 'perigo' | 'ok' | 'info';
  titulo: string;
  texto?: string;
  acao?: { rotulo: string; fn: () => void };
}

const ANTECEDENCIA_M = 150; // avisa trechos sem ciclovia com 150 m de antecedência

/**
 * Motor de alertas em tempo real. Cada alerta dispara uma única vez por viagem
 * (chave em `disparados`) e vira um toast no app.
 */
export function useAlertas(opts: {
  it: Itinerario | null;
  aoVivo: AoVivo | null;
  agora: number;
  sim: EstadoSim;
  terminais: Terminal[];
  notificar: (t: Toast) => void;
  replanejar: () => void;
}) {
  const { it, aoVivo, agora, sim, terminais, notificar, replanejar } = opts;
  const disparados = useRef(new Set<string>());

  // ao trocar de itinerário, os alertas voltam a valer, exceto os de estação (valem por estação, não por rota)
  useEffect(() => {
    disparados.current = new Set([...disparados.current].filter((k) => k.startsWith('vazia-') || k.startsWith('cheia-')));
  }, [it?.id]);

  // estação reabastecida: o alerta pode disparar de novo no futuro
  useEffect(() => {
    for (const e of aoVivo?.estacoes ?? []) {
      if (e.bikes > 0) disparados.current.delete(`vazia-${e.id}`);
      if (e.vagas > 0) disparados.current.delete(`cheia-${e.id}`);
    }
  }, [aoVivo]);

  const uma = (chave: string, t: Omit<Toast, 'id'>) => {
    if (disparados.current.has(chave)) return;
    disparados.current.add(chave);
    notificar({ id: `${chave}-${Date.now()}`, ...t });
    if ('vibrate' in navigator) navigator.vibrate?.(200);
  };

  // --- Alertas baseados nos dados ao vivo (ônibus e estações) ---
  useEffect(() => {
    if (!it || !aoVivo) return;

    const eta = etaOnibus(it, aoVivo, agora);
    if (eta && !eta.passou && eta.min <= 3) {
      uma(`onibus-${eta.veiculo?.tripId ?? eta.linha}`, {
        tipo: 'atencao',
        titulo: `Seu ônibus ${eta.linha} chega em ${eta.min <= 0 ? 'menos de 1' : eta.min} min`,
        texto: `Embarque em ${eta.parada}.`,
      });
    }

    // Estação Ecobike dos terminais por onde a viagem passa (pontos de integração)
    const patinetesPerto = (lat: number, lon: number) => aoVivo.patinetes
      .map((p) => ({ p, d: distM([lat, lon], [p.lat, p.lon]) }))
      .filter((x) => x.d <= 400 && x.p.bateria >= 25)
      .sort((a, b) => a.d - b.d);
    for (const term of terminais) {
      const passa = it.trechos.some((t, idx) => (!sim.ativo || idx >= sim.trechoIdx) &&
        t.geometria.some((p) => distM(p, [term.lat, term.lon]) <= 250));
      if (!passa) continue;
      const e = aoVivo.estacoes
        .map((x) => ({ x, d: distM([term.lat, term.lon], [x.lat, x.lon]) }))
        .filter((y) => y.d <= 300).sort((a, b) => a.d - b.d)[0]?.x;
      if (e && e.bikes === 0) {
        const pats = patinetesPerto(e.lat, e.lon);
        uma(`vazia-${e.id}`, {
          tipo: 'perigo',
          titulo: `A estação Ecobike do ${term.nomeCurto} ficou vazia.`,
          texto: pats.length
            ? `Há ${pats.length} ${pats.length === 1 ? 'patinete' : 'patinetes'} a ${Math.round(pats[0].d / 10) * 10} m.`
            : 'Não há patinetes por perto agora.',
          acao: { rotulo: 'Replanejar', fn: replanejar },
        });
      }
    }

    it.trechos.forEach((t, idx) => {
      if (sim.ativo && idx < sim.trechoIdx) return; // trecho já percorrido
      if (t.estacaoRetirada) {
        const e = aoVivo.estacoes.find((x) => x.id === t.estacaoRetirada!.id);
        if (e && e.bikes === 0) {
          const pats = aoVivo.patinetes
            .map((p) => ({ p, d: distM([e.lat, e.lon], [p.lat, p.lon]) }))
            .filter((x) => x.d <= 400 && x.p.bateria >= 25)
            .sort((a, b) => a.d - b.d);
          const nome = e.nome.replace(/^Ecobike\s+/, '');
          uma(`vazia-${e.id}`, {
            tipo: 'perigo',
            titulo: `A estação Ecobike ${nome} ficou vazia.`,
            texto: pats.length
              ? `Há ${pats.length} ${pats.length === 1 ? 'patinete' : 'patinetes'} a ${Math.round(pats[0].d / 10) * 10} m.`
              : 'Não há patinetes por perto; veja outras opções.',
            acao: { rotulo: 'Replanejar', fn: replanejar },
          });
        }
      }
      if (t.estacaoDevolucao) {
        const e = aoVivo.estacoes.find((x) => x.id === t.estacaoDevolucao!.id);
        if (e && e.vagas === 0)
          uma(`cheia-${e.id}`, {
            tipo: 'atencao', titulo: `Sem vagas na estação ${e.nome.replace(/^Ecobike\s+/, '')}`,
            texto: 'Procure a estação mais próxima para devolver a bike.', acao: { rotulo: 'Replanejar', fn: replanejar },
          });
      }
    });
  }, [it, aoVivo, agora]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Alertas baseados na posição (simulação ou GPS) ---
  useEffect(() => {
    if (!it || !sim.ativo || !sim.pos) return;
    const t = it.trechos[sim.trechoIdx];
    if (!t || (t.modo !== 'bike' && t.modo !== 'patinete')) return;

    // trecho sem infraestrutura adiante
    if (t.segmentos) {
      let acc = 0;
      for (let k = 0; k < t.segmentos.length; k++) {
        const s = t.segmentos[k];
        const ini = acc;
        acc += s.distanciaM;
        if (s.infra !== 'sem' || s.distanciaM < 60) continue;
        if (ini > sim.distNoTrecho && ini - sim.distNoTrecho <= ANTECEDENCIA_M) {
          uma(`sem-${sim.trechoIdx}-${k}`, {
            tipo: 'perigo',
            titulo: 'Trecho sem ciclovia adiante, reduza a velocidade',
            texto: `${Math.round(s.distanciaM)} m em via sem infraestrutura cicloviária. Use sinalização e atenção redobrada.`,
          });
        }
      }
    }

    // área do terminal (limite para autopropelidos)
    for (const term of terminais) {
      if (distM(sim.pos, [term.lat, term.lon]) <= term.raioAreaM + 30)
        uma(`terminal-${sim.trechoIdx}-${term.id}`, {
          tipo: 'info',
          titulo: 'Área do terminal: limite de 6 km/h para autopropelidos',
          texto: t.modo === 'patinete'
            ? `${term.nomeCurto}: reduza para 6 km/h e dê preferência aos pedestres.`
            : `${term.nomeCurto}: pedale devagar ou desmonte perto das plataformas.`,
        });
    }
  }, [it, sim.pos, sim.trechoIdx, sim.distNoTrecho, sim.ativo]); // eslint-disable-line react-hooks/exhaustive-deps
}
