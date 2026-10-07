import { useEffect } from 'react';
import type { Toast } from '../hooks/useAlertas';
import { IcAlerta, IcBike, IcFechar, IcFolha, IcOnibus } from '../icones';

function Item({ t, onFechar }: { t: Toast; onFechar: () => void }) {
  useEffect(() => {
    const id = setTimeout(onFechar, t.acao ? 15000 : 9000);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const icone = t.tipo === 'ok' ? <IcFolha /> : t.titulo.includes('ônibus') ? <IcOnibus /> : t.titulo.includes('Ecobike') ? <IcBike /> : <IcAlerta />;
  return (
    <div className={`toast ${t.tipo}`} role="alert">
      <span aria-hidden>{icone}</span>
      <div>
        <strong>{t.titulo}</strong>
        {t.texto && <p>{t.texto}</p>}
        {t.acao && <button className="acao" onClick={() => { t.acao!.fn(); onFechar(); }}>{t.acao.rotulo}</button>}
      </div>
      <button className="fechar" aria-label="Fechar alerta" onClick={onFechar}><IcFechar size={18} /></button>
    </div>
  );
}

export default function Toasts({ itens, onFechar }: { itens: Toast[]; onFechar: (id: string) => void }) {
  return (
    <div className="toasts" aria-live="assertive">
      {itens.slice(-3).map((t) => <Item key={t.id} t={t} onFechar={() => onFechar(t.id)} />)}
    </div>
  );
}
