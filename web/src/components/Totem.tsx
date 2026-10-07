import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAgora, useAoVivo } from '../hooks/useAoVivo';
import { IcBike, IcOnibus, IcPatinete } from '../icones';
import type { Config } from '../tipos';
import { distM, hora } from '../util';

interface Partida {
  tripId: string; linha: string; cor: string; corTexto: string; destino: string;
  previstaMs: number; programadaMs: number; atrasoS: number; aoVivo: boolean;
}

/**
 * Tela de totem para os hubs (/totem/central e /totem/rodoviario), em paisagem e tela cheia.
 * Atualiza sozinha: estações e patinetes via Socket.IO, partidas a cada 5 s.
 */
export default function Totem({ hub }: { hub: 'central' | 'rodoviario' }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [urlApp, setUrlApp] = useState(window.location.origin);
  const { dados, conectado } = useAoVivo();
  const agora = useAgora(1000);
  const terminal = config?.terminais[hub];

  useEffect(() => {
    api.config().then(setConfig);
    // o QR code precisa do IP da rede local (o celular não enxerga "localhost")
    if (['localhost', '127.0.0.1'].includes(window.location.hostname))
      api.info().then((i) => {
        const url = i.urls.find((u) => !u.includes('192.168.56.')) ?? i.urls[0];
        if (url) setUrlApp(url.replace(/:\d+$/, `:${window.location.port || 5173}`));
      }).catch(() => {});
    document.title = 'Totem – Indaiatuba Integra';
  }, []);

  useEffect(() => {
    if (!terminal) return;
    const carregar = () => api.partidas(terminal.id).then((r) => setPartidas(r.partidas)).catch(() => {});
    carregar();
    const id = setInterval(carregar, 5000);
    return () => clearInterval(id);
  }, [terminal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const perto = useMemo(() => {
    if (!terminal || !dados) return null;
    const p: [number, number] = [terminal.lat, terminal.lon];
    const estacao = dados.estacoes.map((e) => ({ e, d: distM(p, [e.lat, e.lon]) })).sort((a, b) => a.d - b.d)[0]?.e;
    const patinetes = dados.patinetes.map((v) => ({ v, d: distM(p, [v.lat, v.lon]) }))
      .filter((x) => x.d <= 400).sort((a, b) => a.d - b.d);
    return { estacao, patinetes };
  }, [terminal, dados]);

  if (!config || !terminal) return <div className="totem">Carregando…</div>;
  const qr = `${urlApp}/?de=${terminal.id}`;

  return (
    <div className="totem">
      <header className="totem-cab">
        <div>
          <div className="sub">Indaiatuba Integra · Hub de mobilidade</div>
          <h1>{terminal.nome}</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="totem-relogio">{new Date(agora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</div>
          <span className="ao-vivo" style={{ color: conectado ? '#4ade80' : '#fca5a5' }}>{conectado ? 'dados ao vivo' : 'reconectando…'}</span>
        </div>
      </header>

      <main className="totem-corpo">
        <section className="totem-bloco" aria-label="Próximas partidas">
          <h2><IcOnibus size={28} /> Próximas partidas</h2>
          <table className="partidas">
            <thead><tr><th>Linha</th><th>Destino</th><th style={{ textAlign: 'right' }}>Saída</th></tr></thead>
            <tbody>
              {partidas.slice(0, 6).map((p) => {
                const min = Math.round((p.previstaMs - agora) / 60000);
                return (
                  <tr key={p.tripId}>
                    <td><span className="linha-badge" style={{ background: p.cor, color: p.corTexto }}>{p.linha}</span></td>
                    <td>
                      {p.destino}
                      <div style={{ fontSize: '.6em', color: p.atrasoS > 90 ? '#fcd34d' : '#a7f3d0' }}>
                        {p.aoVivo ? '● ao vivo · ' : ''}{p.atrasoS > 90 ? `atraso de ${Math.round(p.atrasoS / 60)} min` : 'no horário'}
                      </div>
                    </td>
                    <td className="min">{min <= 0 ? 'agora' : `${min} min`}<small>{hora(p.previstaMs)}</small></td>
                  </tr>
                );
              })}
              {!partidas.length && <tr><td colSpan={3}>Sem partidas nas próximas horas.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="totem-bloco" aria-label="Micromobilidade">
          <h2><IcBike size={28} /> Ecobike</h2>
          {perto?.estacao ? (
            <>
              <p style={{ margin: '0 0 1vh', opacity: 0.85 }}>{perto.estacao.nome}</p>
              <div className="totem-par">
                <div className={perto.estacao.bikes === 0 ? 'vazia' : ''}>
                  <div className="grande">{perto.estacao.bikes}<small>bikes disponíveis</small></div>
                </div>
                <div><div className="grande">{perto.estacao.vagas}<small>vagas livres</small></div></div>
              </div>
              {perto.estacao.bikes === 0 && <p className="vazia" style={{ marginTop: 0, fontWeight: 700 }}>Estação vazia: use um patinete abaixo.</p>}
            </>
          ) : <p>Sem estação próxima.</p>}
          <h2 style={{ marginTop: '1vh' }}><IcPatinete size={28} /> Patinetes a até 400 m</h2>
          <ul className="totem-lista">
            {perto?.patinetes.slice(0, 5).map(({ v, d }) => (
              <li key={v.id}><span>Patinete {v.id.replace('pat-', '#')}</span><span>{v.bateria}% · {Math.round(d / 10) * 10} m</span></li>
            ))}
            {perto && !perto.patinetes.length && <li>Nenhum patinete por perto agora.</li>}
          </ul>
        </section>

        <section className="totem-bloco totem-qr" aria-label="Abrir o app">
          <h2 style={{ justifyContent: 'center' }}>Planeje no celular</h2>
          <div className="qr"><QRCodeSVG value={qr} size={Math.round(Math.min(window.innerWidth * 0.16, window.innerHeight * 0.34))} level="M" /></div>
          <p>Aponte a câmera e veja ônibus, bikes e patinetes saindo <b>deste terminal</b>, com rotas seguras e o CO₂ que você evita.</p>
          <p style={{ fontSize: '.7em', opacity: 0.7, wordBreak: 'break-all' }}>{qr}</p>
        </section>
      </main>

      <footer className="totem-rodape" role="status">
        <span>⚠ Área do terminal: limite de 6 km/h para autopropelidos</span>
        <span style={{ fontWeight: 600 }}>Bike + ônibus + patinete: chegue ao trabalho sem carro.</span>
      </footer>
    </div>
  );
}
