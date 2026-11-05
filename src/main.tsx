import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ScoreboardScreen } from './components/ScoreboardScreen';
import { ConsoleScreen } from './components/ConsoleScreen';
import './index.css';

const params = new URLSearchParams(window.location.search);
const isScoreboardScreen =
  params.get('screen') === 'scoreboard' || window.location.pathname === '/scoreboard';
const isConsoleScreen =
  params.get('screen') === 'console' || window.location.pathname === '/console';

createRoot(document.getElementById('root')!).render(
  isConsoleScreen ? (
    <ConsoleScreen />
  ) : isScoreboardScreen ? (
    <ScoreboardScreen />
  ) : (
    <App />
  )
);
