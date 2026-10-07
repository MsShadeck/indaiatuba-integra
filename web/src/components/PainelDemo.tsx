import { api } from '../api';
import { IcFechar } from '../icones';
import type { Itinerario } from '../tipos';

/** Atalhos para a apresentação: forçam no simulador as situações que geram alertas. */
export default function PainelDemo({ it, onFechar, onSimular, onErro }: {
  it: Itinerario | null; onFechar: () => void; onSimular: () => void; onErro: (m: string) => void;
}) {
  const bus = it?.trechos.find((t) => t.onibus)?.onibus;
  const retiradas = it?.trechos.filter((t) => t.estacaoRetirada).map((t) => t.estacaoRetirada!) ?? [];
  const rodar = (p: Promise<unknown>) => p.then(onFechar).catch((e) => onErro((e as Error).message));

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" role="dialog" aria-label="Modo apresentação" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cab">
          <h2>Modo apresentação</h2>
          <button onClick={onFechar} aria-label="Fechar"><IcFechar /></button>
        </div>
        <p className="nota" style={{ marginTop: 0 }}>
          Estes botões alteram o <b>simulador</b> no servidor (GTFS-RT/GBFS simulados) para provocar situações reais durante a demo.
          Os alertas aparecem sozinhos, a partir dos dados ao vivo.
        </p>

        <div className="demo-grupo">
          <h4>Viagem selecionada</h4>
          {!it && <p className="nota">Escolha uma opção de jornada primeiro (ex.: “Demo: Casa → Fábrica”).</p>}
          {it && <button className="btn btn-primario" onClick={() => { onSimular(); onFechar(); }}>▶ Simular a viagem (30× mais rápido)</button>}
          {bus && (
            <button className="btn btn-secundario" onClick={() => rodar(api.anteciparOnibus(bus.tripId, bus.partidaProgramadaMs, 3))}>
              Fazer o ônibus {bus.linha} chegar em 3 min
            </button>
          )}
          {retiradas.map((e) => (
            <button key={e.id} className="btn btn-secundario" onClick={() => rodar(api.esvaziarEstacao(e.id))}>
              Esvaziar {e.nome}
            </button>
          ))}
        </div>

        <div className="demo-grupo">
          <h4>Hubs</h4>
          <button className="btn btn-borda" onClick={() => rodar(api.esvaziarEstacao('eco-tc'))}>Esvaziar Ecobike Terminal Central</button>
          <a className="btn btn-borda" href="/totem/central" target="_blank" rel="noreferrer">Abrir totem do Terminal Central ↗</a>
          <a className="btn btn-borda" href="/totem/rodoviario" target="_blank" rel="noreferrer">Abrir totem do Terminal Rodoviário ↗</a>
        </div>

        <div className="demo-grupo">
          <h4>Reiniciar</h4>
          <button className="btn btn-borda" onClick={() => rodar(api.resetDemo())}>Restaurar estações, patinetes e horários</button>
        </div>
      </div>
    </div>
  );
}
