import React, { useState, useEffect } from 'react';
import {
  MatchMode,
  MatchScore,
  GamePhase,
  MatchStats,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  BotTargetTeam,
  BotDifficulty,
} from '../types/hockey';
import { Trophy, Clock, Zap, Activity, Maximize, Minimize, CheckCircle2, Flame, Bot, Sparkles } from 'lucide-react';

export const ScoreboardScreen: React.FC = () => {
  const [score, setScore] = useState<MatchScore>({ blue: 0, red: 0 });
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [gamePhase, setGamePhase] = useState<GamePhase>('READY');
  const [matchMode, setMatchMode] = useState<MatchMode>('1MIN');
  const [customDuration, setCustomDuration] = useState<number>(180);
  const [targetPoints, setTargetPoints] = useState<number>(5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [botTeam, setBotTeam] = useState<BotTargetTeam>('NONE');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('NORMAL');
  const [puckInfo, setPuckInfo] = useState<{
    superCharged?: boolean;
    rallyCount?: number;
    vx?: number;
    vy?: number;
  }>({});
  const [stats, setStats] = useState<MatchStats>({
    blueHits: 0,
    redHits: 0,
    maxPuckSpeed: 0,
    lastScoredTeam: null,
    maxRally: 0,
    currentRally: 0,
    goalHistory: [],
  });
  const [goalAnnouncement, setGoalAnnouncement] = useState<{
    team: 'blue' | 'red';
    countdown: number;
    points?: number;
  } | null>(null);

  // Synchronize via Electron IPC, BroadcastChannel & LocalStorage
  useEffect(() => {
    const applyState = (data: any) => {
      if (!data) return;
      if (data.score) setScore(data.score);
      if (typeof data.timeLeft === 'number') setTimeLeft(data.timeLeft);
      if (data.gamePhase) setGamePhase(data.gamePhase);
      if (data.matchMode) setMatchMode(data.matchMode);
      if (typeof data.customDuration === 'number') setCustomDuration(data.customDuration);
      if (typeof data.targetPoints === 'number') setTargetPoints(data.targetPoints);
      if (data.stats) setStats(data.stats);
      if (data.botTeam) setBotTeam(data.botTeam);
      if (data.botDifficulty) setBotDifficulty(data.botDifficulty);
      if (data.puck) setPuckInfo(data.puck);
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
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'airhockey_sync' && e.newValue) {
        try {
          applyState(JSON.parse(e.newValue));
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorage);

    try {
      const stored = localStorage.getItem('airhockey_sync');
      if (stored) applyState(JSON.parse(stored));
    } catch {}

    return () => {
      if (unsubscribeElectron) unsubscribeElectron();
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Track Fullscreen state
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
  const totalDuration = matchMode === '1MIN' ? 60 : matchMode === 'CUSTOM_TIME' ? customDuration : 600;
  const progressRatio = Math.max(0, Math.min(1, timeLeft / totalDuration));

  const isReady = gamePhase === 'READY' || gamePhase === 'CALIBRATION_SCREEN' || gamePhase === 'CALIBRATION_CAMERA';
  const isTimeUp = gamePhase === 'TIME_UP';

  const modeLabel =
    matchMode === '1MIN'
      ? '1분 매치'
      : matchMode === 'CUSTOM_TIME'
      ? `지정 시간 (${Math.floor(customDuration / 60)}분 ${customDuration % 60 ? `${customDuration % 60}초` : ''})`
      : `${targetPoints}점 선승제`;

  const totalHits = stats.blueHits + stats.redHits;
  const blueHitShare = totalHits > 0 ? Math.round((stats.blueHits / totalHits) * 100) : 50;
  const latestGoal = stats.goalHistory && stats.goalHistory.length > 0 ? stats.goalHistory[0] : null;
  const currentRally = puckInfo.rallyCount ?? stats.currentRally ?? 0;

  return (
    <div className="w-screen h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-6 sm:p-10 select-none font-sans overflow-hidden">
      {/* Top Header */}
      <header className="w-full max-w-6xl flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-wide uppercase bg-gradient-to-r from-blue-400 via-indigo-300 to-rose-400 bg-clip-text text-transparent">
              AR Robot air hotkey
            </h1>
            <p className="text-xs text-slate-400 font-mono">프로 아레나 전광판 (Live Broadcast Scoreboard)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {botTeam !== 'NONE' && (
            <span className="px-3 py-1 rounded-lg bg-purple-950/80 border border-purple-500/50 text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span>AI 봇 대전 ({botDifficulty})</span>
            </span>
          )}
          <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-300">
            {modeLabel}
          </span>
          <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-xs font-semibold">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                gamePhase === 'PLAYING'
                  ? 'bg-emerald-400 animate-pulse'
                  : isTimeUp
                  ? 'bg-rose-500'
                  : 'bg-emerald-400 animate-ping'
              }`}
            />
            <span className="text-slate-200">
              {gamePhase === 'PLAYING'
                ? '경기 진행 중'
                : isTimeUp
                ? '경기 종료'
                : gamePhase === 'GOAL'
                ? '득점!!'
                : '게임 플레이 가능'}
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

      {/* [REQ] 게임 대기/준비 시: "게임 플레이 가능" 배너 표시 */}
      {isReady && (
        <div className="w-full max-w-6xl my-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-emerald-900/60 to-emerald-950/80 border-2 border-emerald-500/70 shadow-[0_0_40px_rgba(16,185,129,0.3)] flex items-center justify-center gap-3 animate-pulse">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          <span className="text-xl sm:text-2xl font-black uppercase tracking-wider text-emerald-200">
            게임 플레이 가능 (READY TO PLAY)
          </span>
        </div>
      )}

      {/* [REQ] 게임 종료시 서브는 점수판 크게 뜨고 */}
      {isTimeUp && (
        <div className="w-full max-w-6xl my-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-2 border-indigo-500 shadow-[0_0_50px_rgba(99,102,241,0.4)] flex flex-col items-center justify-center text-center">
          <span className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-white">
            🏆 경기 종료 (FINAL RESULT)
          </span>
          <span className="text-base sm:text-lg font-bold text-slate-200 mt-1">
            {score.blue > score.red
              ? 'GREEN 초록 팀 승리!!'
              : score.red > score.blue
              ? 'YELLOW 노랑 팀 승리!!'
              : '무승부 (DRAW MATCH)!'}
          </span>
        </div>
      )}

      {/* Goal Celebration Overlay with Instant SVG Goal Trajectory Replay */}
      {goalAnnouncement && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-150">
          <div
            className={`px-12 py-8 rounded-3xl border-4 shadow-2xl text-center transform scale-105 flex flex-col items-center gap-4 ${
              goalAnnouncement.team === 'blue'
                ? 'bg-emerald-950/95 border-emerald-400 shadow-[0_0_90px_rgba(34,197,94,0.85)]'
                : 'bg-yellow-950/95 border-yellow-400 shadow-[0_0_90px_rgba(234,179,8,0.85)]'
            }`}
          >
            {(goalAnnouncement.points || 1) > 1 && (
              <div className="px-4 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-sm uppercase tracking-widest flex items-center gap-1.5 animate-bounce">
                <Sparkles className="w-4 h-4" />
                <span>SUPER GOAL BONUS +2 PTS!</span>
              </div>
            )}
            <div className="text-5xl sm:text-7xl font-black tracking-wider uppercase text-white drop-shadow-lg">
              {(goalAnnouncement.points || 1) > 1 ? 'SUPER GOAL!!' : 'GOAL!!'}
            </div>
            <div
              className={`text-lg sm:text-2xl font-bold ${
                goalAnnouncement.team === 'blue' ? 'text-emerald-300' : 'text-yellow-300'
              }`}
            >
              {goalAnnouncement.team === 'blue' ? 'GREEN 초록 팀 득점!' : 'YELLOW 노랑 팀 득점!'}{' '}
              {latestGoal ? `(${latestGoal.speed} px/s)` : ''}
            </div>

            {/* Instant Goal Replay Trajectory Box */}
            {latestGoal && latestGoal.replayPath && latestGoal.replayPath.length > 2 && (
              <div className="mt-1 p-3 rounded-2xl bg-black/80 border border-slate-700 flex flex-col items-center gap-1.5">
                <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                  📹 INSTANT GOAL REPLAY (득점 궤적 리플레이)
                </span>
                <svg
                  viewBox={`0 0 ${TABLE_WIDTH} ${TABLE_HEIGHT}`}
                  className="w-64 h-36 rounded-lg border border-slate-800 bg-slate-950"
                >
                  <line
                    x1={TABLE_WIDTH / 2}
                    y1={0}
                    x2={TABLE_WIDTH / 2}
                    y2={TABLE_HEIGHT}
                    stroke="#334155"
                    strokeWidth="4"
                    strokeDasharray="10 8"
                  />
                  <circle
                    cx={TABLE_WIDTH / 2}
                    cy={TABLE_HEIGHT / 2}
                    r="90"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="4"
                  />
                  <polyline
                    fill="none"
                    stroke={goalAnnouncement.team === 'blue' ? '#22c55e' : '#facc15'}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={latestGoal.replayPath.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                  />
                  {latestGoal.replayPath.length > 0 && (
                    <circle
                      cx={latestGoal.replayPath[latestGoal.replayPath.length - 1].x}
                      cy={latestGoal.replayPath[latestGoal.replayPath.length - 1].y}
                      r="22"
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth="6"
                    />
                  )}
                </svg>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Giant Scoreboard Arena */}
      <main className="w-full max-w-6xl flex-1 flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-10 my-4">
        {/* Green Team Scoreboard Card (1P) */}
        <div className="flex-1 w-full flex flex-col items-center justify-center p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-emerald-950/50 via-slate-900/80 to-slate-900 border-2 border-emerald-500/50 shadow-[0_0_60px_rgba(34,197,94,0.3)] relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600" />
          <span className="text-sm sm:text-base font-extrabold text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <span>GREEN 초록 팀 (1P)</span>
            {(botTeam === 'BLUE' || botTeam === 'BOTH') && (
              <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/20 border border-emerald-400 text-emerald-200">
                AI BOT
              </span>
            )}
          </span>
          <div className="text-[110px] sm:text-[150px] lg:text-[190px] font-black font-mono tracking-tight text-white leading-none my-2 drop-shadow-[0_4px_28px_rgba(34,197,94,0.6)]">
            {score.blue}
          </div>
          <div className="flex items-center gap-3 text-xs text-emerald-300/80 font-mono mt-1">
            <span className="flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              타격: {stats.blueHits}회
            </span>
            <span className="text-slate-500">|</span>
            <span>점유율: {blueHitShare}%</span>
          </div>
        </div>

        {/* Center Clock & VS Tower */}
        <div className="flex flex-col items-center justify-center px-6 py-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl min-w-[250px] sm:min-w-[290px]">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>{matchMode === 'TARGET_N' ? `선승 목표: ${targetPoints}점` : '경기 잔여 시간'}</span>
          </div>

          <div
            className={`font-mono font-black text-6xl sm:text-7xl tracking-tight my-1 ${
              timeLeft <= 10 && gamePhase === 'PLAYING'
                ? 'text-rose-400 animate-pulse'
                : 'text-white'
            }`}
          >
            {timeFormatted}
          </div>

          {/* Clock Progress Track */}
          <div className="w-full bg-slate-800 rounded-full h-2.5 mt-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                timeLeft <= 10 ? 'bg-rose-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>

          {/* Super Puck x2 / Rally Combo Live Badges */}
          {puckInfo.superCharged && (
            <div className="mt-3 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-black flex items-center gap-1.5 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>★ 슈퍼 퍽 충전됨 (골 x2점!)</span>
            </div>
          )}

          {currentRally >= 3 && (
            <div className="mt-2 px-3 py-1 rounded-full bg-pink-500/20 border border-pink-400/60 text-pink-300 text-xs font-black flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-pink-400" />
              <span>{currentRally} RALLY COMBO!</span>
            </div>
          )}

          {/* Dominance Bar */}
          <div className="w-full mt-4 flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span className="text-emerald-400">{blueHitShare}%</span>
              <span>공격 주도권</span>
              <span className="text-yellow-400">{100 - blueHitShare}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-yellow-500/70 overflow-hidden flex">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${blueHitShare}%` }}
              />
            </div>
          </div>
        </div>

        {/* Yellow Team Scoreboard Card */}
        <div className="flex-1 w-full flex flex-col items-center justify-center p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-yellow-950/50 via-slate-900/80 to-slate-900 border-2 border-yellow-500/50 shadow-[0_0_60px_rgba(234,179,8,0.3)] relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-yellow-600 via-amber-400 to-yellow-600" />
          <span className="text-sm sm:text-base font-extrabold text-yellow-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <span>YELLOW 노랑 팀 (2P)</span>
            {(botTeam === 'RED' || botTeam === 'BOTH') && (
              <span className="px-2 py-0.5 text-[10px] rounded bg-yellow-500/20 border border-yellow-400 text-yellow-200">
                AI BOT
              </span>
            )}
          </span>
          <div className="text-[110px] sm:text-[150px] lg:text-[190px] font-black font-mono tracking-tight text-white leading-none my-2 drop-shadow-[0_4px_28px_rgba(234,179,8,0.6)]">
            {score.red}
          </div>
          <div className="flex items-center gap-3 text-xs text-yellow-300/80 font-mono mt-1">
            <span className="flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-yellow-400" />
              타격: {stats.redHits}회
            </span>
            <span className="text-slate-500">|</span>
            <span>점유율: {100 - blueHitShare}%</span>
          </div>
        </div>
      </main>

      {/* Footer Arena Status, Max Rally & Recent Goal History Ticker */}
      <footer className="w-full max-w-6xl flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>
              최고 퍽 속도: <strong className="text-white font-mono">{Math.round(stats.maxPuckSpeed)} px/s</strong> (
              {Math.round(stats.maxPuckSpeed * 0.085)} km/h)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-pink-400" />
            <span>
              최대 연속 랠리: <strong className="text-white font-mono">{stats.maxRally || 0}회</strong>
            </span>
          </div>
        </div>

        {/* Recent Goal Log Pills */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-xl">
          {stats.goalHistory && stats.goalHistory.length > 0 ? (
            stats.goalHistory.slice(0, 4).map((g) => (
              <span
                key={g.id}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                  g.team === 'blue'
                    ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                    : 'bg-yellow-950/70 border-yellow-500/40 text-yellow-300'
                }`}
              >
                {g.team === 'blue' ? 'GREEN' : 'YELLOW'} +{g.points} ({g.speed}px/s)
              </span>
            ))
          ) : (
            <span className="text-slate-500 font-mono">
              마지막 득점: {stats.lastScoredTeam ? (stats.lastScoredTeam === 'blue' ? 'GREEN 초록 팀' : 'YELLOW 노랑 팀') : '대기 중'}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
};
