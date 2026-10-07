// Histórico MOCKADO de viagens do mês para o painel "Meu impacto".
import { emissoes } from './dados';
import { rng } from './geo';

export function impactoMockado() {
  const r = rng(7);
  const hoje = new Date();
  const f = emissoes.fatoresKgPorKm;
  const viagens = [];
  // ida e volta em dias úteis do mês corrente, até ontem
  for (let dia = 1; dia < hoje.getDate(); dia++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    for (const sentido of ['ida', 'volta'] as const) {
      const kmBike = +(1.5 + r() * 1.2).toFixed(1);
      const kmOnibus = +(3.5 + r() * 1.5).toFixed(1);
      const kmPatinete = +(0.8 + r() * 0.6).toFixed(1);
      const total = kmBike + kmOnibus + kmPatinete;
      const carroKg = total * f.carro;
      const viagemKg = kmOnibus * f.onibus + kmPatinete * f.patinete;
      d.setHours(sentido === 'ida' ? 7 : 17, Math.floor(r() * 50));
      viagens.push({
        data: d.toISOString(), descricao: sentido === 'ida' ? 'Casa → Fábrica' : 'Fábrica → Casa',
        modos: sentido === 'ida' ? ['bike', 'onibus', 'patinete'] : ['patinete', 'onibus', 'bike'],
        distanciaKm: +total.toFixed(1), carroKg: +carroKg.toFixed(3), viagemKg: +viagemKg.toFixed(3),
        evitadoKg: +(carroKg - viagemKg).toFixed(3), mock: true,
      });
    }
  }
  return { viagens, fatores: emissoes };
}
