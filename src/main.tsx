/// <reference types="vite-plugin-pwa/client" />
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { logSystemError } from './firebase/api';

// Handle known IndexedDB persistence errors in Firebase
const handleIndexedDBError = (message: string) => {
  if (message.includes('Connection to Indexed Database server lost') || 
      message.includes('A mutation operation was attempted on a database that did not allow mutations')) {
    console.warn('🔄 IndexedDB connection lost. Reloading page securely...');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
    return true;
  }
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && handleIndexedDBError(event.reason.message)) {
    event.preventDefault();
  } else {
    logSystemError('window.unhandledrejection', event.reason);
  }
});

window.addEventListener('error', (event) => {
  if (event.message && handleIndexedDBError(event.message)) {
    event.preventDefault();
  } else {
    logSystemError('window.error', event.error || event.message);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })();
  }).catch(() => {});
}

