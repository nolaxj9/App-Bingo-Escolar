import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './context/ToastContext';
import { registerSW } from './registerSW';
import '@fontsource-variable/figtree';
import '@fontsource-variable/bricolage-grotesque';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const esAdmin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

if (esAdmin) {
  // El panel de administración va en un chunk aparte: el bundle de la app no crece.
  void import('./admin/AdminApp').then(({ AdminApp }) =>
    root.render(
      <StrictMode>
        <ToastProvider>
          <AdminApp />
        </ToastProvider>
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StrictMode>,
  );
}

registerSW();
