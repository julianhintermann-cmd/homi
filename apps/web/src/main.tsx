import '@fontsource-variable/inter';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initConnectivityListeners } from './lib/connectivity';
import { bindApiClientToQueryClient, queryClient } from './lib/queryClient';
import { initTheme } from './lib/theme';

// public/theme-boot.js already applied the stored appearance before first paint;
// this keeps it in sync (other tabs, settings changes).
initTheme();
initConnectivityListeners();
bindApiClientToQueryClient(queryClient);

const container = document.getElementById('root');
if (!container) throw new Error('Homi: #root element missing in index.html');

createRoot(container).render(
  <StrictMode>
    <App queryClient={queryClient} />
  </StrictMode>,
);
