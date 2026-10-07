import type { Modo } from './tipos';

type P = { size?: number; className?: string; title?: string };

const svg = (path: JSX.Element, { size = 22, className, title }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" className={className} role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true} aria-label={title}>
    {path}
  </svg>
);

export const IcCaminhada = (p: P) => svg(<><circle cx="13" cy="4" r="2" /><path d="M9 21l2-6 3 3v3M7 12l3-4 4 1 2 4M11 15l-1-4" /></>, p);
export const IcBike = (p: P) => svg(<><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="M5.5 17 9 9h6l3.5 8M8 9h3M12 17l3-8" /></>, p);
export const IcOnibus = (p: P) => svg(<><rect x="4" y="3" width="16" height="15" rx="3" /><path d="M4 11h16M8 18v3M16 18v3" /><circle cx="8" cy="14.5" r="1" /><circle cx="16" cy="14.5" r="1" /></>, p);
export const IcPatinete = (p: P) => svg(<><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 18h7M15 18 13 5h3M13 5h-2" /></>, p);
export const IcFolha = (p: P) => svg(<><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" /><path d="M5 19 14 10" /></>, p);
export const IcAlvo = (p: P) => svg(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>, p);
export const IcCamadas = (p: P) => svg(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>, p);
export const IcTrocar = (p: P) => svg(<path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />, p);
export const IcFechar = (p: P) => svg(<path d="M6 6l12 12M18 6 6 18" />, p);
export const IcPlay = (p: P) => svg(<path d="M7 5v14l11-7Z" />, p);
export const IcAlerta = (p: P) => svg(<><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>, p);
export const IcRelogio = (p: P) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, p);
export const IcVaritaDemo = (p: P) => svg(<><path d="m4 20 10-10M14 4v3M18 8h3M17 5l2-2M14 10l2 2" /></>, p);

export function IconeModo({ modo, size }: { modo: Modo; size?: number }) {
  const t = rotuloModo[modo];
  if (modo === 'bike') return <IcBike size={size} title={t} />;
  if (modo === 'onibus') return <IcOnibus size={size} title={t} />;
  if (modo === 'patinete') return <IcPatinete size={size} title={t} />;
  return <IcCaminhada size={size} title={t} />;
}

export const rotuloModo: Record<Modo, string> = {
  caminhada: 'Caminhada', bike: 'Ecobike', patinete: 'Patinete', onibus: 'Ônibus',
};
