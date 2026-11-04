import React, { useState, useEffect } from 'react';
import { MatchMode, MatchScore, GamePhase, MatchStats, MATCH_MODES } from '../types/hockey';
import { Trophy, Clock, Zap, Activity, Maximize, Minimize } from 'lucide-react';

export const ScoreboardScreen: React.FC = () => {
  const [score, setScore] = useState<MatchScore>({ blue: 0, red: 0 });
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [gamePhase, setGamePhase] = useState<GamePhase>('READY');
  const [matchMode, setMatchMode] = useState<MatchMode>('1MIN');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stats, setStats] = useState<MatchStats>({
    blueHits: 0,
    redHits: 0,
    maxPuckSpeed: 0,
    lastScoredTeam: null,
  });
  const [goalAnnouncement, setGoalAnnouncement] = useState<{
    team: 'blue' | 'red';
    countdown: number;
  } | null>(null);

  // Synchronize via Electron IPC, BroadcastChannel & LocalStorage for multi-window Electron support
  useEffect(() => {
    const applyState = (data: any) => {
      if (!data) return;
      if (data.score) setScore(data.score);
      if (typeof data.timeLeft === 'number') setTimeLeft(data.timeLeft);
      if (data.gamePhase) setGamePhase(data.gamePhase);
      if (data.matchMode) setMatchMode(data.matchMode);
      if (data.stats) setStats(data.stats);
      if ('goalAnnouncement' in data) setGoalAnnouncement(data.goalAnnouncement);
    };

    let unsubscribeElectron: (() => void) | undefined;
    if (window.electronAPI?.onSyncState) {
      unsubscribeElectron = window.electronAPI.onSyncState((data) => {
        applyState(data);
      });
    }

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('airhockey_channel');
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;
        if (data.type === 'SYNC_STATE' || data.type === 'UPDATE') {
          applyState(data);
        }
      };
    } catch {
      // Fallback to storage events
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'airhockey_sync' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          applyState(data);
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorage);

    // Initial check from localStorage
    try {
      const stored = localStorage.getItem('airhockey_sync');
      if (stored) {
        const data = JSON.parse(stored);
        applyState(data);
      }
    } catch {}

    return () => {
      if (unsubscribeElectron) unsubscribeElectron();
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Track Fullscreen state for Sub Scoreboard window
  useEffect(() => {
    let unsubElectron: (() => void) | undefined;
    if (window.electronAPI?.onFullscreenChange) {
      window.electronAPI.getFullscreenState?.().then((fs) => setIsFullscreen(Boolean(fs)));
      unsubElectron = window.electronAPI.onFullscreenChange((fs) => {
        setIsFullscreen(Boolean(fs));
      });
    }

    const handleFsChange = () => {
      if (!window.electronAPI) {
        setIsFullscreen(Boolean(document.fullscreenElement));
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      if (unsubElectron) unsubElectron();
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    if (window.electronAPI?.toggleFullscreen) {
      const nextFs = await window.electronAPI.toggleFullscreen();
      setIsFullscreen(Boolean(nextFs));
      return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const totalDuration = MATCH_MODES[matchMode]?.duration || 60;
  const progressRatio = Math.max(0, Math.min(1, timeLeft / totalDuration));

  return (
    <div className="w-screen h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-6 sm:p-10 select-none font-sans overflow-hidden">
      {/* Top Header: Arena Title & Match Status */}
      <header className="w-full max-w-6xl flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-wide uppercase bg-gradient-to-r from-blue-400 via-indigo-300 to-rose-400 bg-clip-text text-transparent">
              AIR HOCKEY MATCH ARENA
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              전광판 디스플레이 (보조 화면 / Electron 2nd Window)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-300">
            {MATCH_MODES[matchMode]?.label || '매치 모드'}
          </span>
          <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-xs font-semibold">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                gamePhase === 'PLAYING'
                  ? 'bg-emerald-400 animate-pulse'
                  : gamePhase === 'TIME_UP'
                  ? 'bg-rose-500'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-200">
              {gamePhase === 'PLAYING'
                ? '경기 진행 중'
                : gamePhase === 'TIME_UP'
                ? '경기 종료'
                : gamePhase === 'GOAL'
                ? '득점!!'
                : '대기 중'}
            </span>
          </div>

          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? '창모드로 전환 (F11 / Esc)' : '서브 전광판 전체화면 (F11)'}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
              isFullscreen
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400'
            }`}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? '창모드 복귀' : '전체화면'}</span>
          </button>
        </div>
      </header>

      {/* Goal Celebration Overlay */}
      {goalAnnouncement && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className={`px-12 py-8 rounded-3xl border-4 shadow-2xl text-center transform scale-105 ${
              goalAnnouncement.team === 'blue'
                ? 'bg-blue-950/90 border-blue-400 shadow-[0_0_80px_rgba(37,99,235,0.8)]'
                : 'bg-rose-950/90 border-rose-400 shadow-[0_0_80px_rgba(225,29,72,0.8)]'
            }`}
          >
            <div className="text-5xl sm:text-7xl font-black tracking-wider uppercase text-white drop-shadow-lg">
              GOAL!!
            </div>
            <div
              className={`mt-2 text-lg sm:text-2xl font-bold ${
                goalAnnouncement.team === 'blue' ? 'text-blue-300' : 'text-rose-300'
              }`}
            >
              {goalAnnouncement.team === 'blue' ? 'BLUE TEAM (청팀) 득점!' : 'RED TEAM (적팀) 득점!'}
            </div>
          </div>
        </div>
      )}

      {/* Main Scoreboard Arena */}
      <main className="w-full max-w-6xl flex-1 flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-10 my-4">
        {/* Blue Team Scoreboard Card */}
        <div className="flex-1 w-full flex flex-col items-center justify-center p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-blue-950/40 via-slate-900/70 to-slate-900 border-2 border-blue-600/40 shadow-[0_0_50px_rgba(37,99,235,0.25)] relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-600 via-sky-400 to-blue-600" />
          <span className="text-sm sm:text-base font-extrabold text-blue-400 uppercase tracking-widest mb-1">
            BLUE TEAM (청팀)
          </span>
          <div className="text-[100px] sm:text-[140px] lg:text-[170px] font-black font-mono tracking-tight text-white leading-none my-2 drop-shadow-[0_4px_24px_rgba(37,99,235,0.5)]">
            {score.blue}
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-300/80 font-mono mt-1">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span>타격 수: {stats.blueHits}회</span>
          </div>
        </div>

        {/* Center Clock & VS Tower */}
        <div className="flex flex-col items-center justify-center px-6 py-4 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl min-w-[240px] sm:min-w-[280px]">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>경기 잔여 시간</span>
          </div>

          <div
            className={`font-mono font-black text-5xl sm:text-6xl tracking-tight my-1 ${
              timeLeft <= 10 && gamePhase === 'PLAYING'
                ? 'text-rose-400 animate-pulse'
                : 'text-white'
            }`}
          >
            {timeFormatted}
          </div>

          {/* Clock Progress Track */}
          <div className="w-full bg-slate-800 rounded-full h-2 mt-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                timeLeft <= 10 ? 'bg-rose-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>

          <span className="text-[11px] text-slate-500 font-mono mt-3 uppercase tracking-wider">
            VS
          </span>
        </div>

        {/* Red Team Scoreboard Card */}
        <div className="flex-1 w-full flex flex-col items-center justify-center p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-rose-950/40 via-slate-900/70 to-slate-900 border-2 border-rose-600/40 shadow-[0_0_50px_rgba(225,29,72,0.25)] relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-600 via-rose-400 to-rose-600" />
          <span className="text-sm sm:text-base font-extrabold text-rose-400 uppercase tracking-widest mb-1">
            RED TEAM (적팀)
          </span>
          <div className="text-[100px] sm:text-[140px] lg:text-[170px] font-black font-mono tracking-tight text-white leading-none my-2 drop-shadow-[0_4px_24px_rgba(225,29,72,0.5)]">
            {score.red}
          </div>
          <div className="flex items-center gap-2 text-xs text-rose-300/80 font-mono mt-1">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            <span>타격 수: {stats.redHits}회</span>
          </div>
        </div>
      </main>

      {/* Footer Arena Status & Puck Speed */}
      <footer className="w-full max-w-6xl flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>최고 퍽 속도: {Math.round(stats.maxPuckSpeed)} px/s</span>
        </div>
        <div className="text-slate-500 font-mono">
          마지막 득점: {stats.lastScoredTeam ? (stats.lastScoredTeam === 'blue' ? '청팀' : '적팀') : '-'}
        </div>
      </footer>
    </div>
  );
};
