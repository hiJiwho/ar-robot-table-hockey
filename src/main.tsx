import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ScoreboardScreen } from './components/ScoreboardScreen';
import './index.css';

const params = new URLSearchParams(window.location.search);
const isScoreboardScreen =
  params.get('screen') === 'scoreboard' || window.location.pathname === '/scoreboard';

createRoot(document.getElementById('root')!).render(
  isScoreboardScreen ? <ScoreboardScreen /> : <App />
);
