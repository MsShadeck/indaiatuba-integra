import { Fragment } from 'react';
import { IcFolha, IconeModo, rotuloModo } from '../icones';
import type { AoVivo, Itinerario } from '../tipos';
import { etaOnibus, hora, kg } from '../util';
import { CORES_INFRA } from './Mapa';

export function ChipsModos({ it }: { it: Itinerario }) {
  // agrupa caminhadas curtas de conexão para não poluir
  const trechos = it.trechos.filter((t, _i, arr) => t.modo !== 'caminhada' || t.distanciaM > 300 || arr.every((x) => x.modo === 'caminhada'));
  return (
    <div className="modos" aria-label="Modais da viagem">
      {trechos.map((t, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="seta" aria-hidden>›</span>}
          <span className={`modo-chip ${t.modo}`} style={t.onibus ? { background: t.onibus.cor, color: t.onibus.corTexto } : undefined}>
            <IconeModo modo={t.modo} size={16} />
            {t.onibus ? t.onibus.linha : t.modo === 'caminhada' ? `${Math.round((t.fimMs - t.inicioMs) / 60000)} min` : rotuloModo[t.modo]}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export function TextoEta({ it, aoVivo, agora }: { it: Itinerario; aoVivo: AoVivo | null; agora: number }) {
  const eta = etaOnibus(it, aoVivo, agora);
  if (!eta) return null;
  if (eta.passou) return <span className="ao-vivo perdido">Ônibus {eta.linha} já passou – replaneje</span>;
  const atrasado = eta.atrasoS > 90;
  return (
    <span className={`ao-vivo ${atrasado ? 'atrasado' : ''}`}>
      Ônibus {eta.linha} chega em {eta.min <= 0 ? 'menos de 1' : eta.min} min
      {eta.aoVivo ? ' (ao vivo)' : ' (previsto)'}
      {atrasado ? ` · ${Math.round(eta.atrasoS / 60)} min de atraso` : ''}
    </span>
  );
}

export function BarraCiclovia({ it }: { it: Itinerario }) {
  const segs = it.trechos.flatMap((t) => t.segmentos ?? []);
  const total = segs.reduce((s, x) => s + x.distanciaM, 0);
  if (!total) return null;
  const por = (inf: string[]) => segs.filter((s) => inf.includes(s.infra)).reduce((s, x) => s + x.distanciaM, 0) / total * 100;
  return (
    <div title="Segurança do trecho de bike/patinete">
      <div className="barra-ciclo" aria-hidden>
        <span style={{ width: `${por(['ciclovia', 'ciclofaixa'])}%`, background: CORES_INFRA.ciclovia }} />
        <span style={{ width: `${por(['compartilhada'])}%`, background: CORES_INFRA.compartilhada }} />
        <span style={{ width: `${por(['sem'])}%`, background: CORES_INFRA.sem }} />
      </div>
    </div>
  );
}

export default function CardOpcao({ it, ativo, aoVivo, agora, onClick }: {
  it: Itinerario; ativo: boolean; aoVivo: AoVivo | null; agora: number; onClick: () => void;
}) {
  return (
    <button className={`card ${ativo ? 'ativo' : ''}`} onClick={onClick} aria-pressed={ativo}>
      <div className="card-topo">
        <span className="card-titulo">{it.titulo}</span>
        <span className="card-tempo">{Math.max(1, Math.round((it.chegadaMs - agora) / 60000))}<small> min</small></span>
      </div>
      <ChipsModos it={it} />
      <div className="card-linha">
        <span>Saída {hora(it.partidaMs)} · Chegada {hora(it.chegadaMs)}</span>
        <TextoEta it={it} aoVivo={aoVivo} agora={agora} />
      </div>
      {it.disponibilidade.length > 0 && (
        <ul className="disp">{it.disponibilidade.map((d) => <li key={d}>{d}</li>)}</ul>
      )}
      <div className="card-linha">
        <span className="co2-chip"><IcFolha size={18} /> {kg(it.co2.evitadoKg)} de CO₂ evitados</span>
        {it.percentualCiclovia !== null && <span>{it.percentualCiclovia}% em ciclovia/ciclofaixa</span>}
      </div>
      <BarraCiclovia it={it} />
    </button>
  );
}
