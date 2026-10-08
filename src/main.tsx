import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Gracefully catch harmless development server WebSocket rejections in AI Studio preview iframe
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reasonText = (event?.reason?.message || String(event?.reason || '')).toLowerCase();
    if (
      reasonText.includes('websocket closed without opened') ||
      reasonText.includes('failed to connect to websocket') ||
      reasonText.includes('websocket')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const errorMsg = (event?.message || '').toLowerCase();
    if (
      errorMsg.includes('websocket') ||
      errorMsg.includes('failed to connect to websocket') ||
      errorMsg.includes('websocket closed')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
