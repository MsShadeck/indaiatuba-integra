import type { ReactNode } from 'react';
import { IconeModo, rotuloModo } from '../icones';
import type { AoVivo, Itinerario, Trecho } from '../tipos';
import { etaOnibus, hora, km } from '../util';
import { CORES_INFRA, CORES_MODO } from './Mapa';

function descricao(t: Trecho, it: Itinerario, aoVivo: AoVivo | null, agora: number): ReactNode {
  const min = Math.max(1, Math.round((t.fimMs - t.inicioMs) / 60000));
  if (t.modo === 'onibus' && t.onibus) {
    const eta = etaOnibus(it, aoVivo, agora);
    return (
      <>
        <h4>Linha {t.onibus.linha} → {t.onibus.destino}</h4>
        <p>Embarque em <b>{t.onibus.paradaEmbarque}</b> às {hora(eta?.previstaMs ?? t.inicioMs)}</p>
        {eta && !eta.passou && <p className={`ao-vivo ${eta.atrasoS > 90 ? 'atrasado' : ''}`}>Chega em {eta.min} min {eta.aoVivo ? '(ao vivo)' : '(previsto)'}</p>}
        <p>{t.onibus.paradas} {t.onibus.paradas === 1 ? 'parada' : 'paradas'} · desça em <b>{t.onibus.paradaDesembarque}</b> ({hora(t.fimMs)})</p>
      </>
    );
  }
  if (t.modo === 'bike') {
    return (
      <>
        <h4>Ecobike · {km(t.distanciaM)} · {min} min</h4>
        <p>Retire em <b>{t.estacaoRetirada?.nome}</b> ({t.estacaoRetirada?.bikes} disponíveis)</p>
        <p>Devolva em <b>{t.estacaoDevolucao?.nome}</b> ({t.estacaoDevolucao?.vagas} vagas)</p>
        {t.percentualCiclovia !== undefined && <p>{t.percentualCiclovia}% do trajeto em ciclovia/ciclofaixa</p>}
      </>
    );
  }
  if (t.modo === 'patinete') {
    return (
      <>
        <h4>Patinete elétrico · {km(t.distanciaM)} · {min} min</h4>
        <p>{t.patinete?.id} com {t.patinete?.bateria}% de bateria → {t.para.nome}</p>
        {t.percentualCiclovia !== undefined && <p>{t.percentualCiclovia}% do trajeto em ciclovia/ciclofaixa</p>}
        <p>Limite de 6 km/h na área dos terminais.</p>
      </>
    );
  }
  return (
    <>
      <h4>Caminhe {km(t.distanciaM)} · {min} min</h4>
      <p>até {t.para.nome}</p>
    </>
  );
}

export default function DetalheViagem({ it, aoVivo, agora, children }: {
  it: Itinerario; aoVivo: AoVivo | null; agora: number; children?: ReactNode;
}) {
  return (
    <section className="detalhe" aria-label="Detalhes da viagem">
      {children}
      <div className="legenda" aria-label="Legenda do mapa">
        <span><i style={{ background: CORES_INFRA.ciclovia }} /> Ciclovia/ciclofaixa</span>
        <span><i style={{ background: CORES_INFRA.compartilhada }} /> Rua compartilhada</span>
        <span><i style={{ background: CORES_INFRA.sem }} /> Sem infraestrutura</span>
        <span><i style={{ background: CORES_MODO.caminhada }} /> Caminhada</span>
      </div>
      <ol className="trechos">
        {it.trechos.map((t, i) => {
          const cor = t.onibus?.cor ?? (t.modo === 'caminhada' ? '#cbd5e1' : CORES_MODO[t.modo]);
          return (
            <li key={i} className="trecho" style={{ ['--cor' as string]: cor }}>
              <div className={`trecho-icone ${t.modo}`} title={rotuloModo[t.modo]}>
                <IconeModo modo={t.modo} size={20} />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: '#64748b', fontSize: '.8rem' }}>{hora(t.inicioMs)}</p>
                {descricao(t, it, aoVivo, agora)}
              </div>
            </li>
          );
        })}
        <li className="trecho">
          <div className="trecho-icone" style={{ background: '#b91c1c' }}>B</div>
          <div><p style={{ margin: 0, fontWeight: 700, color: '#64748b', fontSize: '.8rem' }}>{hora(it.chegadaMs)}</p><h4>Chegada</h4></div>
        </li>
      </ol>
    </section>
  );
}
