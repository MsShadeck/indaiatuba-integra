import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { AoVivo } from '../tipos';

/**
 * Estado em tempo real (ônibus, estações Ecobike, patinetes) recebido via Socket.IO a cada 3 s.
 * Se o WebSocket não conectar, cai para polling em /api/aovivo.
 */
export function useAoVivo() {
  const [dados, setDados] = useState<AoVivo | null>(null);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | undefined;
    const buscar = () =>
      fetch('/api/aovivo').then((r) => r.json()).then((d: AoVivo) => { setDados(d); setConectado(true); }).catch(() => setConectado(false));
    const iniciarPolling = () => {
      if (poll) return;
      buscar();
      poll = setInterval(buscar, 3000);
    };
    const pararPolling = () => {
      clearInterval(poll);
      poll = undefined;
    };
    // só WebSocket: o long-polling do Socket.IO não funciona em funções serverless
    const socket = io({ transports: ['websocket'] });
    socket.on('connect', () => { pararPolling(); setConectado(true); });
    socket.on('disconnect', () => setConectado(false));
    socket.on('connect_error', iniciarPolling);
    socket.on('tick', (d: AoVivo) => setDados(d));
    return () => {
      pararPolling();
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
