
import { createRoot } from 'react-dom/client';
import './styles/index.css';

function showStartupError(error: unknown) {
  const root = document.getElementById('root');
  const isDevelopment = Boolean(
    (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV,
  );
  const message = isDevelopment && error instanceof Error
    ? error.message
    : 'A client-side error prevented the website from starting.';

  console.error('Frontend startup failed:', error);

  if (!root) {
    return;
  }

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f2efe7;padding:24px;font-family:Inter,system-ui,sans-serif;color:#373a40;">
      <section style="max-width:560px;border:1px solid #d8cbbd;border-radius:24px;background:#fffaf4;padding:28px;box-shadow:0 24px 70px rgba(55,58,64,0.12);">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#995842;font-weight:700;">Bangla Speech AI</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">The website could not load.</h1>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#665b52;">Refresh the page. If it still happens, contact support with this error:</p>
        <pre style="white-space:pre-wrap;border:1px solid #ead8cc;border-radius:16px;background:#fbefea;padding:14px;color:#8d4f37;font-size:13px;line-height:1.5;">${message.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] ?? char)}</pre>
      </section>
    </div>
  `;
}

window.addEventListener('error', (event) => {
  showStartupError(event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  showStartupError(event.reason);
});

async function startApp() {
  try {
    const [{ default: App }, React] = await Promise.all([
      import('./app/App.tsx'),
      import('react'),
    ]);
    const root = document.getElementById('root');

    if (!root) {
      throw new Error('Root element was not found.');
    }

    createRoot(root).render(React.createElement(App));
  } catch (error) {
    showStartupError(error);
  }
}

void startApp();
