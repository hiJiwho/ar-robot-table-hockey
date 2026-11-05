import React, { useState, useEffect } from 'react';
import {
  MatchMode,
  MatchScore,
  GamePhase,
  MatchStats,
  MATCH_MODES,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  GameActionMessage,
} from '../types/hockey';
import {
  Trophy,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Minus,
  Maximize,
  Minimize,
  Columns2,
  Tv,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export const ConsoleScreen: React.FC = () => {
  const [score, setScore] = useState<MatchScore>({ blue: 0, red: 0 });
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [gamePhase, setGamePhase] = useState<GamePhase>('READY');
  const [matchMode, setMatchMode] = useState<MatchMode>('1MIN');
  const [stats, setStats] = useState<MatchStats>({
    blueHits: 0,
    redHits: 0,
    maxPuckSpeed: 0,
    lastScoredTeam: null,
  });
  const [puck, setPuck] = useState<{ x: number; y: number; vx: number; vy: number }>({
    x: TABLE_WIDTH / 2,
    y: TABLE_HEIGHT / 2,
    vx: 0,
    vy: 0,
  });
  const [blueRobot, setBlueRobot] = useState<{ tableX: number; tableY: number; detected: boolean; confidence: number }>({
    tableX: 180,
    tableY: TABLE_HEIGHT / 2,
    detected: false,
    confidence: 0,
  });
  const [redRobot, setRedRobot] = useState<{ tableX: number; tableY: number; detected: boolean; confidence: number }>({
    tableX: 820,
    tableY: TABLE_HEIGHT / 2,
    detected: false,
    confidence: 0,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync with Main App via Electron IPC, BroadcastChannel & LocalStorage
  useEffect(() => {
    const applyState = (data: any) => {
      if (!data) return;
      if (data.score) setScore(data.score);
      if (typeof data.timeLeft === 'number') setTimeLeft(data.timeLeft);
      if (data.gamePhase) setGamePhase(data.gamePhase);
      if (data.matchMode) setMatchMode(data.matchMode);
      if (data.stats) setStats(data.stats);
      if (data.puck) setPuck(data.puck);
      if (data.blueRobot) setBlueRobot(data.blueRobot);
      if (data.redRobot) setRedRobot(data.redRobot);
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

  const sendAction = (action: GameActionMessage) => {
    if (window.electronAPI?.sendAction) {
      window.electronAPI.sendAction(action);
    }
    try {
      const channel = new BroadcastChannel('airhockey_channel');
      channel.postMessage(action);
      channel.close();
      localStorage.setItem('airhockey_action', JSON.stringify({ ...action, timestamp: Date.now() }));
    } catch {}
  };

  const handleStartGame = () => {
    sendAction({ type: 'GAME_ACTION', action: 'START' });
  };

  const handlePauseGame = () => {
    sendAction({ type: 'GAME_ACTION', action: 'PAUSE' });
  };

  // [REQ] 게임 종료시 콘솔에 게임 종료 나오고 누르면 콘솔은 게임 시작 버튼, 서브는 게임 플레이 가능, 메인은 골대 없는 경기장으로
  const handleAcknowledgeGameOver = () => {
    sendAction({ type: 'GAME_ACTION', action: 'PREPARE' });
  };

  const handleAddTime = (seconds: number) => {
    sendAction({ type: 'GAME_ACTION', action: 'ADD_TIME', seconds });
  };

  const handleAdjustScore = (team: 'blue' | 'red', delta: number) => {
    const nextScore = {
      ...score,
      [team]: Math.max(0, score[team] + delta),
    };
    sendAction({ type: 'GAME_ACTION', action: 'SET_SCORE', score: nextScore });
  };

  const handleChangeMode = (mode: MatchMode) => {
    sendAction({ type: 'GAME_ACTION', action: 'CHANGE_MODE', mode });
  };

  const handleToggleFullscreen = async () => {
    if (window.electronAPI?.toggleFullscreen) {
      const next = await window.electronAPI.toggleFullscreen();
      setIsFullscreen(Boolean(next));
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const isPlaying = gamePhase === 'PLAYING';
  const isTimeUp = gamePhase === 'TIME_UP';
  const isReady = gamePhase === 'READY' || gamePhase === 'CALIBRATION';

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col p-4 select-none font-sans overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Tv className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wide uppercase text-white flex items-center gap-2">
              AR Robot air hotkey
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                관리 콘솔
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">메인 뷰 실시간 모니터링 & 경기 컨트롤러</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {window.electronAPI && (
            <button
              onClick={() => window.electronAPI?.arrangeSideBySide()}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-1.5 transition-colors"
              title="창 3개 자동 정렬"
            >
              <Columns2 className="w-3.5 h-3.5 text-sky-400" />
              <span>3개 창 정렬</span>
            </button>
          )}

          <button
            onClick={handleToggleFullscreen}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? '창모드' : '전체화면'}</span>
          </button>
        </div>
      </header>

      {/* Main Content: Split into Left (Live Field Mirror) and Right (Game Controls) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 pt-3 overflow-hidden">
        {/* Left: Live Game Mirror & Vision Status (Col 6) */}
        <div className="lg:col-span-6 flex flex-col gap-2 bg-slate-900/70 border border-slate-800 rounded-2xl p-3 overflow-hidden">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              실시간 경기장 미러 (메인 창 카피)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              퍽 속도: {Math.round(stats.maxPuckSpeed)} px/s
            </span>
          </div>

          {/* Mini Field Canvas Representation */}
          <div className="relative flex-1 w-full bg-black rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center">
            <svg
              viewBox={`0 0 ${TABLE_WIDTH} ${TABLE_HEIGHT}`}
              className="w-full h-full p-2"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Outer Rail */}
              <rect
                x="4"
                y="4"
                width={TABLE_WIDTH - 8}
                height={TABLE_HEIGHT - 8}
                fill="#05070a"
                stroke="#ffffff"
                strokeWidth="4"
                rx="16"
              />

              {/* Center Line & Circle */}
              <line
                x1={TABLE_WIDTH / 2}
                y1="4"
                x2={TABLE_WIDTH / 2}
                y2={TABLE_HEIGHT - 4}
                stroke="#ffffff"
                strokeWidth="3"
                strokeDasharray="10 8"
                opacity="0.75"
              />
              <circle
                cx={TABLE_WIDTH / 2}
                cy={TABLE_HEIGHT / 2}
                r="110"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                opacity="0.65"
              />

              {/* Center Big Clock & Scores in Field Mirror */}
              <text
                x={TABLE_WIDTH / 2}
                y={TABLE_HEIGHT / 2 - 20}
                fill="#9ca3af"
                fontSize="48"
                fontWeight="900"
                fontFamily="monospace"
                textAnchor="middle"
                opacity="0.6"
              >
                {timeFormatted}
              </text>
              <text
                x={TABLE_WIDTH / 2 - 130}
                y={TABLE_HEIGHT / 2 + 25}
                fill="#9ca3af"
                fontSize="90"
                fontWeight="900"
                fontFamily="monospace"
                textAnchor="middle"
                opacity="0.5"
              >
                {score.blue}
              </text>
              <text
                x={TABLE_WIDTH / 2 + 130}
                y={TABLE_HEIGHT / 2 + 25}
                fill="#9ca3af"
                fontSize="90"
                fontWeight="900"
                fontFamily="monospace"
                textAnchor="middle"
                opacity="0.5"
              >
                {score.red}
              </text>

              {/* Goal Mouths (Only when playing) */}
              {!isReady && (
                <>
                  <rect x="0" y={TABLE_HEIGHT / 2 - 120} width="12" height="240" fill="#38bdf8" />
                  <rect x={TABLE_WIDTH - 12} y={TABLE_HEIGHT / 2 - 120} width="12" height="240" fill="#f87171" />
                </>
              )}

              {/* Blue Paddle Marker */}
              <circle
                cx={blueRobot.tableX}
                cy={blueRobot.tableY}
                r="32"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="5"
              />
              <circle cx={blueRobot.tableX} cy={blueRobot.tableY} r="8" fill="#38bdf8" />

              {/* Red Paddle Marker */}
              <circle
                cx={redRobot.tableX}
                cy={redRobot.tableY}
                r="32"
                fill="none"
                stroke="#f87171"
                strokeWidth="5"
              />
              <circle cx={redRobot.tableX} cy={redRobot.tableY} r="8" fill="#f87171" />

              {/* Puck */}
              <circle cx={puck.x} cy={puck.y} r="20" fill="#f8fafc" stroke="#94a3b8" strokeWidth="3" />
            </svg>
          </div>

          {/* Paddle Tracking Vision Indicators */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex items-center justify-between">
              <span className="text-blue-400 font-bold flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${blueRobot.detected ? 'bg-blue-400' : 'bg-slate-600'}`} />
                청팀 패들
              </span>
              <span className="font-mono text-slate-300">
                {blueRobot.detected ? `${Math.round(blueRobot.tableX)}, ${Math.round(blueRobot.tableY)}` : '미감지'}
              </span>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex items-center justify-between">
              <span className="text-rose-400 font-bold flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${redRobot.detected ? 'bg-rose-400' : 'bg-slate-600'}`} />
                적팀 패들
              </span>
              <span className="font-mono text-slate-300">
                {redRobot.detected ? `${Math.round(redRobot.tableX)}, ${Math.round(redRobot.tableY)}` : '미감지'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Controller Section (Col 6) */}
        <div className="lg:col-span-6 flex flex-col gap-2.5 overflow-y-auto">
          {/* Big Scoreboard Bar */}
          <div className="grid grid-cols-3 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            {/* Blue Score */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-blue-950/40 border border-blue-900/50">
              <span className="text-xs font-bold text-blue-400 mb-1">청팀 점수</span>
              <div className="text-4xl sm:text-5xl font-black font-mono text-white">{score.blue}</div>
              <div className="flex items-center gap-1 mt-2">
                <button
                  onClick={() => handleAdjustScore('blue', -1)}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleAdjustScore('blue', 1)}
                  className="w-7 h-7 rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Center Clock */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>잔여 시간</span>
              </div>
              <div
                className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                  timeLeft <= 10 && isPlaying ? 'text-rose-400 animate-pulse' : 'text-white'
                }`}
              >
                {timeFormatted}
              </div>
              <span className="text-[11px] mt-2 px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-300">
                {MATCH_MODES[matchMode]?.label}
              </span>
            </div>

            {/* Red Score */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-rose-950/40 border border-rose-900/50">
              <span className="text-xs font-bold text-rose-400 mb-1">적팀 점수</span>
              <div className="text-4xl sm:text-5xl font-black font-mono text-white">{score.red}</div>
              <div className="flex items-center gap-1 mt-2">
                <button
                  onClick={() => handleAdjustScore('red', -1)}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleAdjustScore('red', 1)}
                  className="w-7 h-7 rounded bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* [REQ] 게임 종료시 콘솔에 게임 종료 나오고 누르면 콘솔은 게임 시작 버튼, 서브는 게임 플레이 가능, 메인은 골대 없게 */}
          {isTimeUp ? (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/90 via-slate-900 to-rose-950/90 border-2 border-rose-500/80 shadow-xl flex flex-col items-center text-center gap-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>게임이 종료되었습니다!</span>
              </div>
              <div className="text-xs text-slate-300">
                아래 <strong className="text-rose-300">[게임 종료 확인 / 다음 게임 준비]</strong>를 누르면 서브 전광판에{' '}
                <strong>"게임 플레이 가능"</strong>이 뜨고, 메인은 <strong>골대 없는 대기 경기장</strong>으로 전환됩니다.
              </div>
              <button
                onClick={handleAcknowledgeGameOver}
                className="w-full py-3.5 px-6 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-white font-black text-sm uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                게임 종료 확인 (다음 게임 대기 전환)
              </button>
            </div>
          ) : isReady ? (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-600/50 flex flex-col items-center text-center gap-3">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>게임 준비 완료 (서브: 게임 플레이 가능 / 메인: 골대 없음)</span>
              </div>
              <button
                onClick={handleStartGame}
                className="w-full py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-base uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-current" />
                게임 시작 (Space)
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePauseGame}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow"
              >
                <Pause className="w-4 h-4" />
                일시정지
              </button>
              <button
                onClick={handleAcknowledgeGameOver}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                경기 리셋
              </button>
            </div>
          )}

          {/* [REQ] 시간 추가 컨트롤 (+30초, +1분, +2분, -30초) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              경기 시간 추가 / 조절
            </span>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => handleAddTime(30)}
                className="py-2.5 px-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/50 text-indigo-300 hover:text-white text-xs font-bold transition-colors text-center"
              >
                +30초
              </button>
              <button
                onClick={() => handleAddTime(60)}
                className="py-2.5 px-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-400/60 text-indigo-200 hover:text-white text-xs font-bold transition-colors text-center"
              >
                +1분
              </button>
              <button
                onClick={() => handleAddTime(120)}
                className="py-2.5 px-2 rounded-xl bg-indigo-600/40 hover:bg-indigo-600/50 border border-indigo-400 text-white text-xs font-bold transition-colors text-center"
              >
                +2분
              </button>
              <button
                onClick={() => handleAddTime(-30)}
                className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors text-center"
              >
                -30초
              </button>
            </div>
          </div>

          {/* Match Mode Selection */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              경기 모드 변경
            </span>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(MATCH_MODES) as MatchMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleChangeMode(mode)}
                  disabled={isPlaying}
                  className={`py-2 px-1 rounded-xl border text-center transition-all ${
                    matchMode === mode
                      ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  } ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-xs">{MATCH_MODES[mode].label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
