import { useEffect, useState } from 'react';
import { api, type ViagemImpacto } from '../api';
import { IcFechar } from '../icones';
import { viagensLocais } from '../impacto';
import type { Config, Itinerario } from '../tipos';
import { kg, num } from '../util';

export default function PainelImpacto({ config, itinerario, onFechar }: {
  config: Config; itinerario: Itinerario | null; onFechar: () => void;
}) {
  const [viagens, setViagens] = useState<ViagemImpacto[]>([]);

  useEffect(() => {
    api.impacto()
      .then((r) => setViagens([...r.viagens, ...viagensLocais()]))
      .catch(() => setViagens(viagensLocais()));
  }, []);

  const hoje = new Date();
  const doMes = viagens.filter((v) => {
    const d = new Date(v.data);
    return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
  });
  const evitado = doMes.reduce((s, v) => s + v.evitadoKg, 0);
  const kmLimpos = doMes.reduce((s, v) => s + v.distanciaKm, 0);
  const f = config.emissoes.fatoresKgPorKm;
  const kgArvoreMes = config.emissoes.equivalencias.kgCo2PorArvoreAno / 12;
  const arvores = evitado / kgArvoreMes;
  const kmCarro = evitado / f.carro;
  const mes = hoje.toLocaleDateString('pt-BR', { month: 'long' });

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" role="dialog" aria-label="Meu impacto" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cab">
          <h2>Meu impacto em {mes}</h2>
          <button onClick={onFechar} aria-label="Fechar"><IcFechar /></button>
        </div>

        <div className="kpis">
          <div className="kpi destaque">
            <b>{num(evitado, 1)} kg</b>
            <span>de CO₂ que deixaram de ir para o ar em {doMes.length} viagens, comparando com o mesmo trajeto de carro</span>
          </div>
          <div className="kpi">
            <b>{num(arvores, 1)}</b>
            <span>árvores trabalhando um mês inteiro para absorver isso</span>
          </div>
          <div className="kpi">
            <b>{Math.round(kmCarro)} km</b>
            <span>de carro que não foram rodados</span>
          </div>
          <div className="kpi">
            <b>{Math.round(kmLimpos)} km</b>
            <span>percorridos com ônibus, bike e patinete</span>
          </div>
          <div className="kpi">
            <b>{doMes.length}</b>
            <span>viagens integradas no mês</span>
          </div>
        </div>

        {itinerario && (
          <>
            <h3 className="titulo-secao">Viagem selecionada: {itinerario.titulo}</h3>
            <ul className="lista-viagens">
              <li><span>Mesmo trajeto de carro</span><span>{kg(itinerario.co2.carroKg)}</span></li>
              <li><span>Esta combinação de modais</span><span>{kg(itinerario.co2.viagemKg)}</span></li>
              <li><span><strong>CO₂ evitado</strong></span><b>{kg(itinerario.co2.evitadoKg)}</b></li>
            </ul>
          </>
        )}

        <h3 className="titulo-secao">Últimas viagens</h3>
        <ul className="lista-viagens">
          {[...doMes].reverse().slice(0, 6).map((v, i) => (
            <li key={i}>
              <span>
                {new Date(v.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {v.descricao}
                {v.mock ? '' : ' (registrada agora)'}
              </span>
              <b>−{kg(v.evitadoKg)}</b>
            </li>
          ))}
        </ul>

        <p className="nota">
          Fatores de referência aproximados (kg CO₂/km por passageiro): carro {num(f.carro, 2)}, ônibus {num(f.onibus, 2)},
          patinete elétrico {num(f.patinete, 3)}, bike e caminhada 0. Uma árvore absorve cerca de {config.emissoes.equivalencias.kgCo2PorArvoreAno} kg
          de CO₂ por ano. Ajuste em <code>server/data/emissoes.json</code> com fontes oficiais. O histórico anterior é simulado para a demonstração.
        </p>
      </div>
    </div>
  );
}
