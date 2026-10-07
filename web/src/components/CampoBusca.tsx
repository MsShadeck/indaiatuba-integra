import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api';
import { IcFechar } from '../icones';
import type { Lugar } from '../tipos';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  rotulo: string;
  placeholder: string;
  valor: Lugar | null;
  locais: Lugar[];
  onSelecionar: (l: Lugar | null) => void;
}

/** Campo com autocomplete: Nominatim (via servidor, debounce de 500 ms) + lista local como fallback offline. */
export default function CampoBusca({ rotulo, placeholder, valor, locais, onSelecionar }: Props) {
  const id = useId();
  const [texto, setTexto] = useState(valor?.nome ?? '');
  const [sugestoes, setSugestoes] = useState<Lugar[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [offline, setOffline] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const editando = useRef(false);

  useEffect(() => {
    if (!editando.current) setTexto(valor?.nome ?? '');
  }, [valor]);

  const filtrarLocais = (q: string) => {
    const termos = norm(q).split(/\s+/).filter(Boolean);
    return locais.filter((l) => termos.every((t) => norm(l.nome).includes(t))).slice(0, 6)
      .map((l) => ({ ...l, detalhe: 'Indaiatuba (lista local)', fonte: 'local' }));
  };

  useEffect(() => {
    if (!editando.current) return;
    const q = texto.trim();
    if (q.length < 2) {
      setSugestoes(q.length === 0 ? locais.slice(0, 6) : []);
      return;
    }
    setSugestoes(filtrarLocais(q)); // resposta imediata com a lista local
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await api.geocode(q, ctrl.signal);
        setSugestoes(r.resultados);
        setOffline(r.offline);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setSugestoes(filtrarLocais(q));
          setOffline(true);
        }
      } finally {
        setCarregando(false);
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

  const escolher = (l: Lugar) => {
    editando.current = false;
    setTexto(l.nome);
    setAberto(false);
    onSelecionar(l);
  };

  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        onFocus={(e) => {
          e.target.select();
          editando.current = true;
          if (!texto) setSugestoes(locais.slice(0, 6));
          setAberto(true);
        }}
        onBlur={() => setTimeout(() => setAberto(false), 180)}
        onChange={(e) => {
          editando.current = true;
          setTexto(e.target.value);
          setAtivo(-1);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(sugestoes.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && sugestoes[Math.max(0, ativo)]) { e.preventDefault(); escolher(sugestoes[Math.max(0, ativo)]); }
          if (e.key === 'Escape') setAberto(false);
        }}
      />
      {texto && (
        <button className="limpar" aria-label={`Limpar ${rotulo}`} onClick={() => { setTexto(''); onSelecionar(null); }}>
          <IcFechar size={18} />
        </button>
      )}
      {aberto && (sugestoes.length > 0 || carregando) && (
        <ul className="sugestoes" id={`${id}-lista`} role="listbox">
          {sugestoes.map((s, i) => (
            <li key={`${s.id ?? s.nome}-${i}`}>
              <button type="button" role="option" aria-selected={i === ativo} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(s)}>
                <span>{s.nome}<small>{s.detalhe ?? (s.fonte === 'osm' ? 'OpenStreetMap' : '')}</small></span>
              </button>
            </li>
          ))}
          {carregando && <li className="aviso">Buscando no OpenStreetMap…</li>}
          {offline && !carregando && <li className="aviso">Sem conexão com o OpenStreetMap: mostrando lugares da lista local.</li>}
        </ul>
      )}
    </div>
  );
}
