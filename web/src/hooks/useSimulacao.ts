import { useEffect, useRef, useState } from 'react';
import type { Itinerario, LatLon } from '../tipos';
import { distM } from '../util';

export interface EstadoSim {
  ativo: boolean;
  pausado: boolean;
  velocidade: number; // multiplicador do tempo
  tMs: number; // tempo decorrido desde a partida (no relógio da viagem)
  pos: LatLon | null;
  trechoIdx: number;
  distNoTrecho: number; // metros percorridos dentro do trecho atual
  progresso: number; // 0..1
  concluida: boolean;
}

const inicial: EstadoSim = {
  ativo: false, pausado: false, velocidade: 30, tMs: 0, pos: null, trechoIdx: 0, distNoTrecho: 0, progresso: 0, concluida: false,
};

function posicaoNaGeometria(geo: LatLon[], d: number): LatLon {
  let acc = 0;
  for (let i = 1; i < geo.length; i++) {
    const s = distM(geo[i - 1], geo[i]);
    if (acc + s >= d) {
      const f = s ? (d - acc) / s : 0;
      return [geo[i - 1][0] + (geo[i][0] - geo[i - 1][0]) * f, geo[i - 1][1] + (geo[i][1] - geo[i - 1][1]) * f];
    }
    acc += s;
  }
  return geo[geo.length - 1];
}

export const comprimento = (geo: LatLon[]) => geo.slice(1).reduce((s, p, i) => s + distM(geo[i], p), 0);

/**
 * Simula o deslocamento do usuário pelo itinerário em tempo acelerado (padrão 30×),
 * para demonstrar os alertas que dependem da posição (trecho sem ciclovia, área do terminal).
 * Em produção, a mesma lógica recebe a posição do GPS (navigator.geolocation.watchPosition).
 */
export function useSimulacao(it: Itinerario | null, onConcluir?: (it: Itinerario) => void) {
  const [sim, setSim] = useState<EstadoSim>(inicial);
  const ultimo = useRef<number>(0);
  const concluirRef = useRef(onConcluir);
  concluirRef.current = onConcluir;

  // reinicia ao trocar de itinerário
  useEffect(() => setSim(inicial), [it?.id]);

  useEffect(() => {
    if (!it || !sim.ativo || sim.pausado || sim.concluida) return;
    ultimo.current = performance.now();
    const id = setInterval(() => {
      const agora = performance.now();
      const dt = agora - ultimo.current;
      ultimo.current = agora;
      setSim((s) => {
        const total = it.chegadaMs - it.partidaMs;
        const tMs = Math.min(total, s.tMs + dt * s.velocidade);
        const relogio = it.partidaMs + tMs;
        // trecho atual (nos intervalos de espera, fica no fim do trecho anterior)
        let idx = it.trechos.findIndex((t) => relogio >= t.inicioMs && relogio < t.fimMs);
        let pos: LatLon;
        let distNoTrecho = 0;
        if (idx >= 0) {
          const t = it.trechos[idx];
          const f = (relogio - t.inicioMs) / Math.max(1, t.fimMs - t.inicioMs);
          distNoTrecho = comprimento(t.geometria) * f;
          pos = posicaoNaGeometria(t.geometria, distNoTrecho);
        } else {
          const prox = it.trechos.findIndex((t) => t.inicioMs > relogio);
          idx = prox === -1 ? it.trechos.length - 1 : Math.max(0, prox - 1);
          const t = it.trechos[idx];
          const fim = prox === -1 || relogio >= t.fimMs;
          distNoTrecho = fim ? comprimento(t.geometria) : 0;
          pos = fim ? t.geometria[t.geometria.length - 1] : t.geometria[0];
        }
        const concluida = tMs >= total;
        return { ...s, tMs, pos, trechoIdx: idx, distNoTrecho, progresso: tMs / total, concluida };
      });
    }, 200);
    return () => clearInterval(id);
  }, [it, sim.ativo, sim.pausado, sim.concluida]);

  // dispara a conclusão fora do updater (updaters precisam ser puros; o StrictMode os executa 2×)
  const concluidaDe = useRef<string | null>(null);
  useEffect(() => {
    if (it && sim.concluida && concluidaDe.current !== it.id) {
      concluidaDe.current = it.id;
      concluirRef.current?.(it);
    }
    if (!sim.ativo) concluidaDe.current = null;
  }, [sim.concluida, sim.ativo, it]);

  return {
    sim,
    iniciar: () => setSim({ ...inicial, ativo: true, velocidade: sim.velocidade, pos: it?.trechos[0].geometria[0] ?? null }),
    pausar: () => setSim((s) => ({ ...s, pausado: !s.pausado })),
    parar: () => setSim(inicial),
    setVelocidade: (v: number) => setSim((s) => ({ ...s, velocidade: v })),
  };
}
