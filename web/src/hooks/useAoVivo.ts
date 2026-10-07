import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { AoVivo } from '../tipos';

/** Estado em tempo real (ônibus, estações Ecobike, patinetes) recebido via Socket.IO a cada 3 s. */
export function useAoVivo() {
  const [dados, setDados] = useState<AoVivo | null>(null);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConectado(true));
    socket.on('disconnect', () => setConectado(false));
    socket.on('tick', (d: AoVivo) => setDados(d));
    return () => {
      socket.disconnect();
    };
  }, []);

  return { dados, conectado };
}

/** Relógio que atualiza a cada `ms` (para contagens regressivas). */
export function useAgora(ms = 1000) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return agora;
}
