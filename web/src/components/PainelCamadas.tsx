import { IcBike, IcFechar, IcOnibus, IcPatinete } from '../icones';
import type { Camadas } from './Mapa';
import { CORES_INFRA } from './Mapa';

const itens: { chave: keyof Camadas; rotulo: string; amostra: JSX.Element }[] = [
  { chave: 'onibus', rotulo: 'Ônibus ao vivo', amostra: <IcOnibus size={20} /> },
  { chave: 'linhas', rotulo: 'Traçado das linhas', amostra: <i style={{ width: 22, height: 4, background: '#1d4ed8', display: 'block', borderRadius: 2 }} /> },
  { chave: 'ecobike', rotulo: 'Estações Ecobike', amostra: <IcBike size={20} /> },
  { chave: 'patinetes', rotulo: 'Patinetes elétricos', amostra: <IcPatinete size={20} /> },
  { chave: 'ciclovias', rotulo: 'Ciclovias e ciclofaixas', amostra: <i style={{ width: 22, height: 5, background: CORES_INFRA.ciclovia, display: 'block', borderRadius: 2 }} /> },
];

export default function PainelCamadas({ camadas, onChange, onFechar }: {
  camadas: Camadas; onChange: (c: Camadas) => void; onFechar: () => void;
}) {
  return (
    <div className="flutuante" role="dialog" aria-label="Camadas do mapa">
      <h3>Camadas do mapa <button onClick={onFechar} aria-label="Fechar"><IcFechar /></button></h3>
      {itens.map((i) => (
        <label key={i.chave} className="toggle">
          <input type="checkbox" checked={camadas[i.chave]} onChange={(e) => onChange({ ...camadas, [i.chave]: e.target.checked })} />
          <span className="amostra">{i.amostra}</span>
          {i.rotulo}
        </label>
      ))}
    </div>
  );
}
