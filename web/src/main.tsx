import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './estilos.css';
import App from './App';
import Totem from './components/Totem';

// Roteamento mínimo: /totem/central e /totem/rodoviario abrem o modo totem; o resto é o app.
const m = window.location.pathname.match(/^\/totem\/(central|rodoviario)\/?$/);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{m ? <Totem hub={m[1] as 'central' | 'rodoviario'} /> : <App />}</React.StrictMode>,
);
