// Planejador multimodal próprio (sem OpenTripPlanner, para manter o projeto leve).
//
// 1. Enumera candidatos: [acesso] → ônibus → [egresso], onde acesso/egresso podem ser
//    caminhada, Ecobike (estação→estação) ou patinete solto; e também trajetos só de bike/patinete.
// 2. Estima o tempo de cada um com distâncias em linha reta × fator de desvio e o próximo
//    ônibus REAL do simulador (horário programado + atraso atual).
// 3. Escolhe até 3 opções diferentes e as "materializa" com o roteamento no grafo
//    (ciclovias priorizadas), horários definitivos, disponibilidade e CO₂.
import { config, emissoes, terminais } from './dados';
import { estacoes, listaPatinetes, type Estacao, type Patinete } from './gbfs';
import { dist, slice, type LatLon } from './geo';
import { patterns, routes, shapes, stops, trips, type Pattern } from './gtfs';
import { rotear, type Segmento } from './grafo';
import { chegadaPrevista, proximasPartidas, type Partida } from './realtime';

type Modo = 'caminhada' | 'bike' | 'patinete' | 'onibus';
interface Ponto { nome: string; lat: number; lon: number }

const V = config.velocidadesKmh;
const P = config.planejador;
const ms = (kmh: number) => kmh / 3.6; // m/s
const DESVIO = 1.3; // fator para estimar distância real a partir da linha reta
const DESBLOQUEIO_S = 45;

// ---------- Opções de micromobilidade/caminhada entre dois pontos ----------
type Micro =
  | { tipo: 'caminhada'; t: number }
  | { tipo: 'bike'; t: number; retirada: Estacao; devolucao: Estacao }
  | { tipo: 'patinete'; t: number; patinete: Patinete };

const andar = (a: LatLon, b: LatLon) => (dist(a, b) * DESVIO) / ms(V.caminhada);

function opcoesMicro(a: LatLon, b: LatLon, est: Estacao[], pats: Patinete[], permitirCaminhada = true): Micro[] {
  const d = dist(a, b);
  const out: Micro[] = [];
  if (permitirCaminhada && d <= P.raioCaminhadaMaxM) out.push({ tipo: 'caminhada', t: andar(a, b) });
  if (d < 500) return out; // trecho curto: só caminhada

  const ret = est.filter((e) => e.bikes > 0).map((e) => ({ e, d: dist(a, [e.lat, e.lon]) }))
    .filter((x) => x.d <= P.raioEstacaoM).sort((x, y) => x.d - y.d)[0];
  const dev = est.filter((e) => e.vagas > 0).map((e) => ({ e, d: dist(b, [e.lat, e.lon]) }))
    .filter((x) => x.d <= P.raioEstacaoM).sort((x, y) => x.d - y.d)[0];
  if (ret && dev && ret.e.id !== dev.e.id) {
    const t = andar(a, [ret.e.lat, ret.e.lon]) + DESBLOQUEIO_S +
      (dist([ret.e.lat, ret.e.lon], [dev.e.lat, dev.e.lon]) * DESVIO) / ms(V.bike) + andar([dev.e.lat, dev.e.lon], b);
    out.push({ tipo: 'bike', t, retirada: ret.e, devolucao: dev.e });
  }

  const pat = pats.map((p) => ({ p, d: dist(a, [p.lat, p.lon]) }))
    .filter((x) => x.d <= P.raioPatineteM && x.p.bateria >= P.bateriaMinimaPatinete && x.p.autonomiaM > d * 2)
    .sort((x, y) => x.d - y.d)[0];
  if (pat) {
    const t = andar(a, [pat.p.lat, pat.p.lon]) + DESBLOQUEIO_S + (d * DESVIO) / ms(V.patinete);
    out.push({ tipo: 'patinete', t, patinete: pat.p });
  }
  return out;
}

// ---------- Candidatos ----------
interface Candidato {
  assinatura: string;
  chegadaMs: number;
  score: number;
  acesso?: Micro;
  egresso?: Micro;
  onibus?: { pattern: Pattern; i: number; j: number; partida: Partida };
  direto?: Micro;
}

const modosDe = (c: Candidato): Modo[] => {
  if (c.direto) return [c.direto.tipo];
  return [c.acesso!.tipo, 'onibus', c.egresso!.tipo] as Modo[];
};
const ehMicro = (m: Micro | undefined) => !!m && m.tipo !== 'caminhada';

export function planejar(deIn: Partial<Ponto>, paraIn: Partial<Ponto>) {
  const agora = Date.now();
  const de: Ponto = { nome: deIn.nome || 'Origem', lat: +deIn.lat!, lon: +deIn.lon! };
  const para: Ponto = { nome: paraIn.nome || 'Destino', lat: +paraIn.lat!, lon: +paraIn.lon! };
  const O: LatLon = [de.lat, de.lon];
  const D: LatLon = [para.lat, para.lon];
  const est = estacoes();
  const pats = listaPatinetes();
  const dOD = dist(O, D);
  const candidatos: Candidato[] = [];

  // Só micromobilidade / caminhada (distâncias curtas)
  if (dOD <= P.distanciaMaxSoMicroM) {
    for (const m of opcoesMicro(O, D, est, pats, dOD <= P.raioCaminhadaMaxM)) {
      candidatos.push({ assinatura: `direto-${m.tipo}`, chegadaMs: agora + m.t * 1000, score: m.t, direto: m });
    }
  }

  // Combinações com ônibus
  const proxDeO = new Map<string, number>();
  const proxDeD = new Map<string, number>();
  for (const s of stops.values()) {
    const a = dist(O, [s.lat, s.lon]);
    const b = dist(D, [s.lat, s.lon]);
    if (a <= P.raioAcessoMaxM) proxDeO.set(s.id, a);
    if (b <= P.raioAcessoMaxM) proxDeD.set(s.id, b);
  }
  const cacheAcesso = new Map<string, Micro[]>();
  const cacheEgresso = new Map<string, Micro[]>();
  for (const p of patterns.values()) {
    for (let i = 0; i < p.stops.length - 1; i++) {
      if (!proxDeO.has(p.stops[i])) continue;
      const si = stops.get(p.stops[i])!;
      if (!cacheAcesso.has(si.id)) cacheAcesso.set(si.id, opcoesMicro(O, [si.lat, si.lon], est, pats));
      const acessos = cacheAcesso.get(si.id)!;
      if (!acessos.length) continue;
      for (let j = i + 1; j < p.stops.length; j++) {
        if (!proxDeD.has(p.stops[j])) continue;
        // sem sentido pegar ônibus se o destino fica mais perto da origem do que do desembarque
        if (proxDeD.get(p.stops[j])! >= dOD) continue;
        const sj = stops.get(p.stops[j])!;
        if (!cacheEgresso.has(sj.id)) cacheEgresso.set(sj.id, opcoesMicro([sj.lat, sj.lon], D, est, pats));
        for (const a of acessos) {
          const naParada = agora + (a.t + P.folgaEmbarqueS) * 1000;
          const partida = proximasPartidas(si.id, naParada, 1, p.key)[0];
          if (!partida) continue;
          const chegadaJ = chegadaPrevista(partida.tripId, j, partida);
          for (const e of cacheEgresso.get(sj.id)!) {
            const chegada = chegadaJ + e.t * 1000;
            const trocas = (a.tipo === 'caminhada' ? 0 : 1) + (e.tipo === 'caminhada' ? 0 : 1);
            candidatos.push({
              assinatura: `${a.tipo}>${p.routeId}>${e.tipo}`,
              chegadaMs: chegada,
              score: (chegada - agora) / 1000 + 90 * trocas,
              acesso: a, egresso: e, onibus: { pattern: p, i, j, partida },
            });
          }
        }
      }
    }
  }

  // ---------- Seleção de até 3 opções diversas ----------
  const melhorPor = new Map<string, Candidato>();
  for (const c of candidatos) {
    const atual = melhorPor.get(c.assinatura);
    if (!atual || c.score < atual.score) melhorPor.set(c.assinatura, c);
  }
  const unicos = [...melhorPor.values()].sort((a, b) => a.score - b.score);
  const escolhidos: Candidato[] = [];
  const add = (c?: Candidato) => { if (c && !escolhidos.includes(c) && escolhidos.length < 3) escolhidos.push(c); };
  add(unicos.find((c) => c.onibus && (ehMicro(c.acesso) || ehMicro(c.egresso)))); // multimodal com micromobilidade
  add(unicos.find((c) => c.onibus && !ehMicro(c.acesso) && !ehMicro(c.egresso))); // só ônibus + caminhada
  add(unicos.find((c) => c.direto && c.direto.tipo !== 'caminhada')); // só bike/patinete
  add(unicos.find((c) => c.direto?.tipo === 'caminhada' && dOD <= 1200));
  for (const c of unicos) add(c);

  const opcoes = escolhidos
    .map((c, k) => materializar(c, de, para, agora, k))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.chegadaMs - b.chegadaMs);

  const avisos: string[] = [];
  if (!opcoes.length) avisos.push('Não encontramos opções para este trajeto. Tente um ponto mais próximo de uma linha de ônibus ou estação Ecobike.');
  return { geradoEm: agora, opcoes, avisos };
}

// ---------- Materialização (rotas no grafo e horários definitivos) ----------
interface Trecho {
  modo: Modo; de: Ponto; para: Ponto; distanciaM: number; inicioMs: number; fimMs: number;
  geometria: LatLon[]; segmentos?: Segmento[]; percentualCiclovia?: number;
  onibus?: Record<string, unknown>;
  estacaoRetirada?: { id: string; nome: string; bikes: number };
  estacaoDevolucao?: { id: string; nome: string; vagas: number };
  patinete?: { id: string; bateria: number };
}

const pt = (p: LatLon, nome: string): Ponto => ({ nome, lat: p[0], lon: p[1] });

function caminhar(a: Ponto, b: Ponto, t0: number): Trecho | null {
  const d0 = dist([a.lat, a.lon], [b.lat, b.lon]);
  if (d0 < 25) return null;
  // trechos curtos: a malha sintética (~180 m) distorceria; usa linha reta com fator de desvio
  const r = d0 < 400
    ? { pontos: [[a.lat, a.lon], [b.lat, b.lon]] as LatLon[], distanciaM: d0 * 1.2 }
    : rotear([a.lat, a.lon], [b.lat, b.lon], 'caminhada');
  const dur = (r.distanciaM / ms(V.caminhada)) * 1000;
  return { modo: 'caminhada', de: a, para: b, distanciaM: r.distanciaM, inicioMs: t0, fimMs: t0 + dur, geometria: r.pontos };
}

/** Duração de um trecho de micromobilidade; patinete respeita 6 km/h dentro da área dos terminais. */
function duracaoMicro(segs: Segmento[], modo: 'bike' | 'patinete') {
  let s = 0;
  for (const seg of segs)
    for (let i = 1; i < seg.pontos.length; i++) {
      const d = dist(seg.pontos[i - 1], seg.pontos[i]);
      const meio: LatLon = [(seg.pontos[i - 1][0] + seg.pontos[i][0]) / 2, (seg.pontos[i - 1][1] + seg.pontos[i][1]) / 2];
      const lenta = modo === 'patinete' && terminais.some((t) => dist(meio, [t.lat, t.lon]) <= t.raioAreaM);
      s += d / ms(lenta ? V.patineteAreaTerminal : modo === 'bike' ? V.bike : V.patinete);
    }
  return s * 1000;
}

function micro(m: Micro, a: Ponto, b: Ponto, t0: number): Trecho[] {
  if (m.tipo === 'caminhada') {
    const w = caminhar(a, b, t0);
    return w ? [w] : [];
  }
  const out: Trecho[] = [];
  let t = t0;
  let origem: Ponto = a;
  let destinoMicro: Ponto = b;
  if (m.tipo === 'bike') {
    origem = { nome: m.retirada.nome, lat: m.retirada.lat, lon: m.retirada.lon };
    destinoMicro = { nome: m.devolucao.nome, lat: m.devolucao.lat, lon: m.devolucao.lon };
  } else {
    origem = { nome: `Patinete ${m.patinete.id}`, lat: m.patinete.lat, lon: m.patinete.lon };
  }
  const w1 = caminhar(a, origem, t);
  if (w1) { out.push(w1); t = w1.fimMs; }
  t += DESBLOQUEIO_S * 1000;
  const r = rotear([origem.lat, origem.lon], [destinoMicro.lat, destinoMicro.lon], 'micro');
  const dur = duracaoMicro(r.segmentos, m.tipo);
  const trecho: Trecho = {
    modo: m.tipo, de: origem, para: destinoMicro, distanciaM: r.distanciaM, inicioMs: t, fimMs: t + dur,
    geometria: r.pontos, segmentos: r.segmentos, percentualCiclovia: r.percentualCiclovia,
  };
  if (m.tipo === 'bike') {
    trecho.estacaoRetirada = { id: m.retirada.id, nome: m.retirada.nome, bikes: m.retirada.bikes };
    trecho.estacaoDevolucao = { id: m.devolucao.id, nome: m.devolucao.nome, vagas: m.devolucao.vagas };
  } else trecho.patinete = { id: m.patinete.id, bateria: m.patinete.bateria };
  out.push(trecho);
  t = trecho.fimMs;
  if (m.tipo === 'bike') {
    const w2 = caminhar(destinoMicro, b, t);
    if (w2) out.push(w2);
  }
  return out;
}

const nomeEstacao = (n: string) => n.replace(/^Ecobike\s+/, '');
const rotulo: Record<Modo, string> = { caminhada: 'Caminhada', bike: 'Bike', patinete: 'Patinete', onibus: 'Ônibus' };

function materializar(c: Candidato, de: Ponto, para: Ponto, agora: number, k: number) {
  const trechos: Trecho[] = [];
  if (c.direto) {
    trechos.push(...micro(c.direto, de, para, agora));
  } else {
    const { pattern: p, i, j } = c.onibus!;
    const si = stops.get(p.stops[i])!;
    const sj = stops.get(p.stops[j])!;
    const pi: Ponto = { nome: si.nome, lat: si.lat, lon: si.lon };
    const pj: Ponto = { nome: sj.nome, lat: sj.lat, lon: sj.lon };
    trechos.push(...micro(c.acesso!, de, pi, agora));
    const naParada = trechos.length ? trechos[trechos.length - 1].fimMs : agora;
    // recalcula o ônibus com o tempo real de acesso (pode ser outro, se o anterior já tiver passado)
    const partida = proximasPartidas(si.id, naParada + P.folgaEmbarqueS * 1000, 1, p.key)[0];
    if (!partida) return null;
    const chegada = chegadaPrevista(partida.tripId, j, partida);
    const trip = trips.get(partida.tripId)!;
    const sh = shapes.get(trip.shapeId)!;
    const geo = slice(sh.pts, sh.cum, trip.stopTimes[i].dist, trip.stopTimes[j].dist);
    const r = routes.get(p.routeId)!;
    trechos.push({
      modo: 'onibus', de: pi, para: pj, distanciaM: trip.stopTimes[j].dist - trip.stopTimes[i].dist,
      inicioMs: partida.previstaMs, fimMs: chegada, geometria: geo,
      onibus: {
        routeId: r.id, linha: r.curto, cor: r.cor, corTexto: r.corTexto, destino: trip.headsign, tripId: trip.id,
        paradaEmbarque: si.nome, paradaDesembarque: sj.nome, paradas: j - i,
        partidaProgramadaMs: partida.programadaMs, partidaPrevistaMs: partida.previstaMs, atrasoS: partida.atrasoS,
        esperaS: Math.max(0, Math.round((partida.previstaMs - naParada) / 1000)),
      },
    });
    trechos.push(...micro(c.egresso!, pj, para, chegada));
  }
  if (!trechos.length) return null;

  // CO₂: compara com o mesmo trajeto de carro
  const f = emissoes.fatoresKgPorKm;
  const distanciaKm = trechos.reduce((s, t) => s + t.distanciaM, 0) / 1000;
  const carroKg = (dist([de.lat, de.lon], [para.lat, para.lon]) / 1000) * emissoes.fatorDesvioCarro * f.carro;
  const viagemKg = trechos.reduce((s, t) => s + (t.distanciaM / 1000) * f[t.modo], 0);

  const microT = trechos.filter((t) => t.segmentos);
  const microDist = microT.reduce((s, t) => s + t.distanciaM, 0);
  const cicloDist = microT.flatMap((t) => t.segmentos!).filter((s) => s.infra === 'ciclovia' || s.infra === 'ciclofaixa')
    .reduce((s, x) => s + x.distanciaM, 0);

  const disponibilidade: string[] = [];
  for (const t of trechos) {
    if (t.estacaoRetirada) disponibilidade.push(`${t.estacaoRetirada.bikes} ${t.estacaoRetirada.bikes === 1 ? 'bike' : 'bikes'} na estação ${nomeEstacao(t.estacaoRetirada.nome)}`);
    if (t.estacaoDevolucao) disponibilidade.push(`${t.estacaoDevolucao.vagas} vagas para devolver em ${nomeEstacao(t.estacaoDevolucao.nome)}`);
    if (t.patinete) disponibilidade.push(`Patinete com ${t.patinete.bateria}% de bateria ${t.de === trechos[0].de || trechos.indexOf(t) <= 1 ? 'perto de você' : 'no ponto de troca'}`);
  }

  const modos = trechos.map((t) => t.modo);
  const principais = trechos.filter((t) => t.modo !== 'caminhada' || trechos.every((x) => x.modo === 'caminhada'));
  const tituloBase = principais.map((t) => (t.modo === 'onibus' ? `Ônibus ${(t.onibus as any).linha}` : rotulo[t.modo]))
    .filter((x, i, arr) => x !== arr[i - 1]).join(' + ');
  const titulo = principais.length === 1 && principais[0].modo === 'onibus' ? `${tituloBase} + caminhada` : tituloBase;
  const partidaMs = trechos[0].inicioMs;
  const chegadaMs = trechos[trechos.length - 1].fimMs;
  return {
    id: `${c.assinatura}-${k}-${(c.onibus?.partida.tripId ?? 'direto')}`,
    titulo: c.direto ? `Só ${rotulo[c.direto.tipo].toLowerCase()}` : titulo,
    modos,
    partidaMs,
    chegadaMs,
    duracaoMin: Math.round((chegadaMs - agora) / 60000),
    trechos,
    disponibilidade,
    percentualCiclovia: microDist > 0 ? Math.round((cicloDist / microDist) * 100) : null,
    co2: {
      distanciaKm: +distanciaKm.toFixed(2),
      carroKg: +carroKg.toFixed(3),
      viagemKg: +viagemKg.toFixed(3),
      evitadoKg: +Math.max(0, carroKg - viagemKg).toFixed(3),
    },
  };
}
