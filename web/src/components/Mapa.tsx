import L from 'leaflet';
import { Fragment, useEffect, useMemo } from 'react';
import {
  Circle, CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents,
} from 'react-leaflet';
import type { AoVivo, Config, Itinerario, LatLon, Lugar, Rede } from '../tipos';

export interface Camadas { onibus: boolean; linhas: boolean; ecobike: boolean; patinetes: boolean; ciclovias: boolean }

export const CORES_INFRA = { ciclovia: '#15803d', ciclofaixa: '#22c55e', compartilhada: '#eab308', sem: '#dc2626' } as const;
export const CORES_MODO = { caminhada: '#475569', bike: '#0f766e', patinete: '#6d28d9', onibus: '#1d4ed8' } as const;

// Cache de ícones: evita recriar o DOM do marcador a cada tick (mantém a animação suave).
const cacheIcones = new Map<string, L.DivIcon>();
function icone(chave: string, html: string, size: [number, number], className: string) {
  let i = cacheIcones.get(chave);
  if (!i) {
    i = L.divIcon({ html, className, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
    cacheIcones.set(chave, i);
  }
  return i;
}

const iconeOnibus = (linha: string, cor: string, corTexto: string, rumo: number) => {
  const r = Math.round(rumo / 15) * 15;
  return icone(`bus|${linha}|${r}`,
    `<div class="bus-pin" style="--cor:${cor};--txt:${corTexto}"><span class="bus-seta" style="transform:rotate(${r}deg)"></span><b>${linha}</b></div>`,
    [44, 30], 'pin-onibus');
};
const iconeEstacao = (bikes: number, vagas: number) =>
  icone(`eco|${bikes}|${vagas}`,
    `<div class="eco-pin ${bikes === 0 ? 'vazia' : ''}" aria-label="${bikes} bikes, ${vagas} vagas"><b>${bikes}</b><i></i><small>${vagas}</small></div>`,
    [46, 26], 'pin-eco');
const iconePatinete = (bateria: number) => {
  const b = Math.round(bateria / 5) * 5;
  return icone(`pat|${b}`, `<div class="pat-pin ${b < 30 ? 'baixa' : ''}"><span>${b}%</span></div>`, [40, 22], 'pin-pat');
};
const iconePonto = (tipo: 'de' | 'para') =>
  icone(`pt|${tipo}`, `<div class="ponto-pin ${tipo}">${tipo === 'de' ? 'A' : 'B'}</div>`, [30, 30], 'pin-ponto');
const iconeUsuario = () => icone('usuario', '<div class="usuario-pin"></div>', [24, 24], 'pin-usuario');

function AjustarZoom({ itinerario, de, para }: { itinerario: Itinerario | null; de: Lugar | null; para: Lugar | null }) {
  const map = useMap();
  useEffect(() => {
    const pts: LatLon[] = itinerario
      ? itinerario.trechos.flatMap((t) => t.geometria)
      : [de, para].filter(Boolean).map((p) => [p!.lat, p!.lon] as LatLon);
    if (pts.length === 1) map.flyTo(pts[0], 15, { duration: 0.6 });
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  }, [itinerario?.id, de?.lat, de?.lon, para?.lat, para?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Desliga a transição CSS dos marcadores durante o zoom (senão eles "escorregam"). */
function ControleZoom() {
  const map = useMapEvents({
    zoomstart: () => map.getContainer().classList.add('zoom-em-andamento'),
    zoomend: () => setTimeout(() => map.getContainer().classList.remove('zoom-em-andamento'), 50),
  });
  return null;
}

interface Props {
  config: Config;
  rede: Rede | null;
  ciclovias: GeoJSON.FeatureCollection | null;
  aoVivo: AoVivo | null;
  camadas: Camadas;
  itinerario: Itinerario | null;
  de: Lugar | null;
  para: Lugar | null;
  posicaoUsuario: LatLon | null;
}

export default function Mapa({ config, rede, ciclovias, aoVivo, camadas, itinerario, de, para, posicaoUsuario }: Props) {
  const linhasUnicas = useMemo(() => {
    // um traçado por linha basta (o sentido de volta é o mesmo caminho)
    const vistos = new Set<string>();
    return (rede?.linhas ?? []).filter((l) => (vistos.has(l.routeId) ? false : (vistos.add(l.routeId), true)));
  }, [rede]);

  const tripSelecionada = itinerario?.trechos.find((t) => t.onibus)?.onibus?.tripId;

  return (
    <MapContainer center={[config.centroMapa.lat, config.centroMapa.lon]} zoom={config.centroMapa.zoom}
      zoomControl={false} className="mapa" preferCanvas={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      <ControleZoom />
      <AjustarZoom itinerario={itinerario} de={de} para={para} />

      {camadas.ciclovias && ciclovias && (
        <GeoJSON key="ciclovias" data={ciclovias}
          style={(f) => ({
            color: f?.properties?.tipo === 'ciclovia' ? CORES_INFRA.ciclovia : CORES_INFRA.ciclofaixa,
            weight: itinerario ? 3 : 5, opacity: itinerario ? 0.45 : 0.85,
            dashArray: f?.properties?.tipo === 'ciclofaixa' ? '8 6' : undefined,
          })}
          onEachFeature={(f, layer) => layer.bindTooltip(`${f.properties.nome} (${f.properties.tipo}) – ${f.properties.fonte}`, { sticky: true })} />
      )}

      {camadas.linhas && linhasUnicas.map((l) => (
        <Polyline key={l.key} positions={l.pontos} pathOptions={{ color: l.cor, weight: 3, opacity: itinerario ? 0.15 : 0.35 }} />
      ))}

      {rede?.terminais.map((t) => (
        <Fragment key={t.id}>
          <Circle center={[t.lat, t.lon]} radius={t.raioAreaM}
            pathOptions={{ color: '#6d28d9', weight: 2, dashArray: '4 6', fillOpacity: 0.06 }}>
            <Tooltip>{t.nomeCurto} – área do terminal: limite de 6 km/h para autopropelidos</Tooltip>
          </Circle>
          <CircleMarker center={[t.lat, t.lon]} radius={7} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0b5d4b', fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -6]}>{t.nome}</Tooltip>
          </CircleMarker>
        </Fragment>
      ))}

      {/* Itinerário selecionado, colorido por modal (micromobilidade colorida pela segurança do trecho) */}
      {itinerario?.trechos.map((t, i) => {
        if (t.modo === 'onibus')
          return <Polyline key={i} positions={t.geometria} pathOptions={{ color: t.onibus!.cor, weight: 8, opacity: 0.9 }} />;
        if (t.modo === 'caminhada')
          return <Polyline key={i} positions={t.geometria} pathOptions={{ color: CORES_MODO.caminhada, weight: 5, dashArray: '1 10', lineCap: 'round' }} />;
        return (
          <Fragment key={i}>
            <Polyline positions={t.geometria} pathOptions={{ color: CORES_MODO[t.modo], weight: 12, opacity: 0.9 }} />
            {(t.segmentos ?? []).map((s, k) => (
              <Polyline key={k} positions={s.pontos} pathOptions={{ color: CORES_INFRA[s.infra], weight: 5, opacity: 1 }} />
            ))}
          </Fragment>
        );
      })}
      {itinerario?.trechos.slice(1).map((t, i) => (
        <CircleMarker key={`troca${i}`} center={[t.de.lat, t.de.lon]} radius={6}
          pathOptions={{ color: '#111827', weight: 2, fillColor: '#fff', fillOpacity: 1 }}>
          <Tooltip>{t.de.nome}</Tooltip>
        </CircleMarker>
      ))}

      {camadas.ecobike && aoVivo?.estacoes.map((e) => (
        <Marker key={e.id} position={[e.lat, e.lon]} icon={iconeEstacao(e.bikes, e.vagas)} zIndexOffset={200}>
          <Popup>
            <strong>{e.nome}</strong><br />
            {e.bikes} {e.bikes === 1 ? 'bike disponível' : 'bikes disponíveis'} · {e.vagas} vagas livres
          </Popup>
        </Marker>
      ))}

      {camadas.patinetes && aoVivo?.patinetes.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={iconePatinete(p.bateria)} zIndexOffset={100}>
          <Popup>
            <strong>Patinete elétrico {p.id}</strong><br />
            Bateria {p.bateria}% · autonomia ~{(p.autonomiaM / 1000).toFixed(1)} km
          </Popup>
        </Marker>
      ))}

      {camadas.onibus && aoVivo?.veiculos.map((v) => (
        <Marker key={v.id} position={[v.lat, v.lon]} icon={iconeOnibus(v.linha, v.cor, v.corTexto, v.rumo)}
          zIndexOffset={v.tripId === tripSelecionada ? 1000 : 500}>
          <Popup>
            <strong>Linha {v.linha}</strong> → {v.destino}<br />
            Próxima parada: {v.proximaParadaNome ?? '—'}<br />
            {v.atrasoS > 60 ? `Atrasado ${Math.round(v.atrasoS / 60)} min` : v.atrasoS < -30 ? 'Adiantado' : 'No horário'} · ao vivo
          </Popup>
        </Marker>
      ))}

      {de && <Marker position={[de.lat, de.lon]} icon={iconePonto('de')} zIndexOffset={1500}><Tooltip>Origem: {de.nome}</Tooltip></Marker>}
      {para && <Marker position={[para.lat, para.lon]} icon={iconePonto('para')} zIndexOffset={1500}><Tooltip>Destino: {para.nome}</Tooltip></Marker>}
      {posicaoUsuario && <Marker position={posicaoUsuario} icon={iconeUsuario()} zIndexOffset={2000} />}
    </MapContainer>
  );
}
