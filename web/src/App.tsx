import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import CampoBusca from './components/CampoBusca';
import CardOpcao from './components/CardOpcao';
import DetalheViagem from './components/DetalheViagem';
import Mapa, { type Camadas } from './components/Mapa';
import PainelCamadas from './components/PainelCamadas';
import { useAgora, useAoVivo } from './hooks/useAoVivo';
import { IcAlvo, IcCamadas, IcTrocar } from './icones';
import type { Config, Itinerario, Lugar, Rede } from './tipos';

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [rede, setRede] = useState<Rede | null>(null);
  const [ciclovias, setCiclovias] = useState<GeoJSON.FeatureCollection | null>(null);
  const [locais, setLocais] = useState<Lugar[]>([]);
  const [camadas, setCamadas] = useState<Camadas>({ onibus: true, linhas: true, ecobike: true, patinetes: true, ciclovias: true });
  const [verCamadas, setVerCamadas] = useState(false);
  const [recolhido, setRecolhido] = useState(false);

  const [de, setDe] = useState<Lugar | null>(null);
  const [para, setPara] = useState<Lugar | null>(null);
  const [opcoes, setOpcoes] = useState<Itinerario[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { dados, conectado } = useAoVivo();
  const agora = useAgora(1000);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setErro('Não foi possível conectar ao servidor.'));
    api.rede().then(setRede);
    api.ciclovias().then(setCiclovias);
    api.lugares().then((ls) => {
      setLocais(ls);
      // ?de=TC (vindo do QR code do totem) já preenche a origem
      const q = new URLSearchParams(window.location.search).get('de');
      const l = q && ls.find((x) => x.id === q);
      if (l) setDe(l);
    });
  }, []);

  const selecionado = useMemo(() => opcoes.find((o) => o.id === selId) ?? null, [opcoes, selId]);

  async function planejar(d = de, p = para) {
    if (!d || !p) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await api.planejar(d, p);
      setOpcoes(r.opcoes);
      setSelId(r.opcoes[0]?.id ?? null);
      if (!r.opcoes.length) setErro(r.avisos?.[0] ?? 'Nenhuma opção encontrada.');
      setRecolhido(false);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  // planeja automaticamente quando origem e destino estão definidos
  useEffect(() => {
    if (de && para) planejar(de, para);
    else { setOpcoes([]); setSelId(null); }
  }, [de?.lat, de?.lon, para?.lat, para?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  function minhaLocalizacao() {
    if (!navigator.geolocation) return setErro('Este navegador não oferece geolocalização.');
    navigator.geolocation.getCurrentPosition(
      (pos) => setDe({ nome: 'Minha localização', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setErro('Não foi possível obter sua localização. No celular, o navegador exige HTTPS (use npm run dev:https) e permissão de localização.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const exemplo = (a: string, b: string) => {
    setDe(locais.find((l) => l.id === a) ?? null);
    setPara(locais.find((l) => l.id === b) ?? null);
  };

  if (!config) return <div className="vazio">{erro ?? 'Carregando Indaiatuba Integra…'}</div>;

  return (
    <div className="app">
      <Mapa config={config} rede={rede} ciclovias={ciclovias} aoVivo={dados} camadas={camadas}
        itinerario={selecionado} de={de} para={para} posicaoUsuario={null} />

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

      <main className={`painel ${recolhido ? 'recolhido' : ''}`}>
        <button className="alca" onClick={() => setRecolhido((r) => !r)} aria-label={recolhido ? 'Expandir painel' : 'Recolher painel'}><span /></button>
        <div className="busca">
          <div className="busca-campos">
            <CampoBusca rotulo="De" placeholder="Onde você está?" valor={de} locais={locais} onSelecionar={setDe} />
            <CampoBusca rotulo="Para" placeholder="Para onde vai?" valor={para} locais={locais} onSelecionar={setPara} />
          </div>
          <button className="btn-trocar" aria-label="Inverter origem e destino" onClick={() => { setDe(para); setPara(de); }}>
            <IcTrocar />
          </button>
        </div>
        <div className="linha-botoes">
          <button className="btn btn-borda" onClick={minhaLocalizacao}><IcAlvo /> Usar minha localização</button>
          <button className="btn btn-primario" disabled={!de || !para || carregando} onClick={() => planejar()}>
            {carregando ? 'Calculando…' : 'Ver opções'}
          </button>
        </div>
        {!de && !para && (
          <div className="atalhos" aria-label="Exemplos">
            <button onClick={() => exemplo('casa-demo', 'fabrica-demo')}>Demo: Casa → Fábrica</button>
            <button onClick={() => exemplo('TC', 'di-bartolomai')}>Terminal Central → Distrito Bartolomai</button>
            <button onClick={() => exemplo('TR', 'centro')}>Rodoviária → Centro</button>
          </div>
        )}
        {erro && <div className="erro" role="alert">{erro}</div>}

        {opcoes.length > 0 && (
          <>
            <h2 className="titulo-secao">{opcoes.length} opções de jornada</h2>
            <div className="opcoes">
              {opcoes.map((o) => (
                <CardOpcao key={o.id} it={o} ativo={o.id === selId} aoVivo={dados} agora={agora} onClick={() => setSelId(o.id)} />
              ))}
            </div>
          </>
        )}
        {selecionado && <DetalheViagem it={selecionado} aoVivo={dados} agora={agora} />}
      </main>
    </div>
  );
}
