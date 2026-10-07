import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import CampoBusca from './components/CampoBusca';
import CardOpcao from './components/CardOpcao';
import ControlesSimulacao from './components/ControlesSimulacao';
import DetalheViagem from './components/DetalheViagem';
import Mapa, { type Camadas } from './components/Mapa';
import PainelCamadas from './components/PainelCamadas';
import PainelDemo from './components/PainelDemo';
import PainelImpacto from './components/PainelImpacto';
import { registrarViagem } from './impacto';
import Toasts from './components/Toasts';
import { useAlertas, type Toast } from './hooks/useAlertas';
import { useAgora, useAoVivo } from './hooks/useAoVivo';
import { useSimulacao } from './hooks/useSimulacao';
import { IcAlvo, IcCamadas, IcFolha, IcTrocar, IcVaritaDemo } from './icones';
import { kg } from './util';
import type { Config, Itinerario, Lugar, Rede } from './tipos';

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [rede, setRede] = useState<Rede | null>(null);
  const [ciclovias, setCiclovias] = useState<GeoJSON.FeatureCollection | null>(null);
  const [locais, setLocais] = useState<Lugar[]>([]);
  const [camadas, setCamadas] = useState<Camadas>({ onibus: true, linhas: true, ecobike: true, patinetes: true, ciclovias: true });
  const [verCamadas, setVerCamadas] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const painelRef = useRef<HTMLElement>(null);
  // recolhido, o painel mostra só o topo (alça + barra de simulação)
  useEffect(() => {
    if (recolhido && painelRef.current) painelRef.current.scrollTop = 0;
  }, [recolhido]);

  const [de, setDe] = useState<Lugar | null>(null);
  const [para, setPara] = useState<Lugar | null>(null);
  const [opcoes, setOpcoes] = useState<Itinerario[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [verDemo, setVerDemo] = useState(false);
  const [verImpacto, setVerImpacto] = useState(false);

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

  const notificar = useCallback(
    (t: Toast) => setToasts((ts) => [...ts, { ...t, id: `${t.id}-${Math.random().toString(36).slice(2, 7)}` }]),
    [],
  );
  const aoConcluir = useCallback((it: Itinerario) => {
    registrarViagem(it, de?.nome ?? 'Origem', para?.nome ?? 'Destino');
    notificar({
      id: `fim-${Date.now()}`, tipo: 'ok', titulo: 'Você chegou! Viagem concluída.',
      texto: `Você evitou ${kg(it.co2.evitadoKg)} de CO₂ em relação ao carro. Veja "Meu impacto".`,
      acao: { rotulo: 'Meu impacto', fn: () => setVerImpacto(true) },
    });
  }, [notificar, de?.nome, para?.nome]);
  const simulacao = useSimulacao(selecionado, aoConcluir);
  const { sim } = simulacao;
  // ao simular, recolhe o painel para o mapa ficar visível (no celular)
  const controlesSim = { ...simulacao, iniciar: () => { simulacao.iniciar(); setRecolhido(true); } };

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

  function replanejar() {
    if (sim.ativo && sim.pos) {
      const atual = { nome: 'Posição atual', lat: sim.pos[0], lon: sim.pos[1] };
      simulacao.parar();
      setDe(atual);
    } else planejar();
  }

  useAlertas({
    it: selecionado, aoVivo: dados, agora, sim, terminais: rede?.terminais ?? [], notificar, replanejar,
  });

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
        itinerario={selecionado} de={de} para={para} posicaoUsuario={sim.ativo ? sim.pos : null} painelRecolhido={recolhido} />

      <header className="topo">
        <div className="marca">
          <img src="/favicon.svg" alt="" />
          <div>Indaiatuba Integra<small className={`status-vivo ${conectado ? '' : 'off'}`}>{conectado ? 'ao vivo' : 'reconectando…'}</small></div>
        </div>
        <button className="btn-topo" onClick={() => setVerImpacto(true)} aria-label="Meu impacto">
          <IcFolha /><span className="rotulo">Meu impacto</span>
        </button>
        <button className="btn-topo" onClick={() => setVerDemo(true)} aria-label="Modo apresentação">
          <IcVaritaDemo /><span className="rotulo">Demo</span>
        </button>
        <button className="btn-topo" aria-pressed={verCamadas} onClick={() => setVerCamadas((v) => !v)} aria-label="Camadas do mapa">
          <IcCamadas /><span className="rotulo">Camadas</span>
        </button>
      </header>
      {verCamadas && <PainelCamadas camadas={camadas} onChange={setCamadas} onFechar={() => setVerCamadas(false)} />}
      <Toasts itens={toasts} onFechar={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
      {verImpacto && <PainelImpacto config={config} itinerario={selecionado} onFechar={() => setVerImpacto(false)} />}
      {verDemo && (
        <PainelDemo it={selecionado} onFechar={() => setVerDemo(false)} onErro={setErro}
          onSimular={controlesSim.iniciar} />
      )}

      <main ref={painelRef} className={`painel ${recolhido ? 'recolhido' : ''}`}>
        <button className="alca" onClick={() => setRecolhido((r) => !r)} aria-label={recolhido ? 'Expandir painel' : 'Recolher painel'}><span /></button>
        {selecionado && sim.ativo && <ControlesSimulacao it={selecionado} {...controlesSim} />}
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
        {selecionado && (
          <DetalheViagem it={selecionado} aoVivo={dados} agora={agora}>
            {!sim.ativo && <ControlesSimulacao it={selecionado} {...controlesSim} />}
          </DetalheViagem>
        )}
      </main>
    </div>
  );
}
