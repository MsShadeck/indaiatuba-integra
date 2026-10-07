import { useEffect, useState } from 'react';
import { api } from './api';
import Mapa, { type Camadas } from './components/Mapa';
import PainelCamadas from './components/PainelCamadas';
import { useAoVivo } from './hooks/useAoVivo';
import { IcCamadas } from './icones';
import type { Config, Rede } from './tipos';

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [rede, setRede] = useState<Rede | null>(null);
  const [ciclovias, setCiclovias] = useState<GeoJSON.FeatureCollection | null>(null);
  const [camadas, setCamadas] = useState<Camadas>({ onibus: true, linhas: true, ecobike: true, patinetes: true, ciclovias: true });
  const [verCamadas, setVerCamadas] = useState(false);
  const { dados, conectado } = useAoVivo();

  useEffect(() => {
    api.config().then(setConfig);
    api.rede().then(setRede);
    api.ciclovias().then(setCiclovias);
  }, []);

  if (!config) return <div className="vazio">Carregando Indaiatuba Integra…</div>;

  return (
    <div className="app">
      <Mapa config={config} rede={rede} ciclovias={ciclovias} aoVivo={dados} camadas={camadas}
        itinerario={null} de={null} para={null} posicaoUsuario={null} />
      <header className="topo">
        <div className="marca">
          <img src="/favicon.svg" alt="" />
          <div>Indaiatuba Integra<small className={`status-vivo ${conectado ? '' : 'off'}`}>{conectado ? 'ao vivo' : 'reconectando…'}</small></div>
        </div>
        <button className="btn-topo" aria-pressed={verCamadas} onClick={() => setVerCamadas((v) => !v)} aria-label="Camadas do mapa">
          <IcCamadas /><span className="rotulo">Camadas</span>
        </button>
      </header>
      {verCamadas && <PainelCamadas camadas={camadas} onChange={setCamadas} onFechar={() => setVerCamadas(false)} />}
    </div>
  );
}
