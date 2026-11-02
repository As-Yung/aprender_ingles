import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

// Evita que la app se muestre dentro de un iframe ajeno (clickjacking).
// GitHub Pages no permite la cabecera frame-ancestors, así que se refuerza en el cliente.
if (window.top !== window.self) {
  document.body.innerHTML = '';
  throw new Error('Framing no permitido');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
