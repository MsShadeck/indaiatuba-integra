import type { EstadoSim } from '../hooks/useSimulacao';
import { IcPlay } from '../icones';
import { rotuloModo } from '../icones';
import type { Itinerario } from '../tipos';
import { hora } from '../util';

export default function ControlesSimulacao({ it, sim, iniciar, pausar, parar, setVelocidade }: {
  it: Itinerario; sim: EstadoSim; iniciar: () => void; pausar: () => void; parar: () => void; setVelocidade: (v: number) => void;
}) {
  if (!sim.ativo)
    return (
      <div className="linha-botoes" style={{ marginTop: 0 }}>
        <button className="btn btn-primario" onClick={iniciar}><IcPlay /> Simular viagem</button>
      </div>
    );
  const t = it.trechos[sim.trechoIdx];
  const relogio = it.partidaMs + sim.tMs;
  const esperando = t && (relogio < t.inicioMs || relogio >= t.fimMs);
  return (
    <div className="sim-barra" aria-live="polite">
      <div className="info">
        <span>
          {sim.concluida ? 'Viagem concluída' : esperando && t?.modo === 'onibus' ? `Aguardando o ônibus ${t.onibus?.linha}` : `${rotuloModo[t?.modo ?? 'caminhada']} em andamento`}
        </span>
        <span>{hora(relogio)}</span>
      </div>
      <div className="progresso"><span style={{ width: `${Math.round(sim.progresso * 100)}%` }} /></div>
      <div className="info">
        <div className="velocidades" role="group" aria-label="Velocidade da simulação">
          {[10, 30, 60].map((v) => (
            <button key={v} aria-pressed={sim.velocidade === v} onClick={() => setVelocidade(v)}>{v}×</button>
          ))}
        </div>
        <div className="velocidades">
          {!sim.concluida && <button onClick={pausar}>{sim.pausado ? 'Continuar' : 'Pausar'}</button>}
          <button onClick={parar}>Encerrar</button>
        </div>
      </div>
    </div>
  );
}
