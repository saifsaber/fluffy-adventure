import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { LocaleProvider } from './i18n/context.js';
import { loadLeagueBundle } from './data/bundle.js';
import './styles/theme.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <App league={loadLeagueBundle('egy-d4')} />
    </LocaleProvider>
  </StrictMode>,
);
