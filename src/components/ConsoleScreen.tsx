import React, { useState, useEffect, useRef } from 'react';
import {
  MatchMode,
  MatchScore,
  GamePhase,
  MatchStats,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  DEFAULT_NORMALIZED_CORNERS,
  DEFAULT_NORMALIZED_8POINTS,
  DEFAULT_GOAL_SIZE,
  FourCorners,
  EightPoints,
  toEightPoints,
  GameActionMessage,
} from '../types/hockey';
import {
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
  Sun,
  Moon,
  Settings,
  X,
  Camera,
  Monitor,
  FlipHorizontal,
  Target,
  Sparkles,
} from 'lucide-react';

export const ConsoleScreen: React.FC = () => {
  const [score, setScore] = useState<MatchScore>({ blue: 0, red: 0 });
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [gamePhase, setGamePhase] = useState<GamePhase>('READY');
  const [matchMode, setMatchMode] = useState<MatchMode>('1MIN');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
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
  const [lowLightMode, setLowLightMode] = useState<boolean>(false);

  // Settings & Calibration Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'SCREEN' | 'CAMERA' | 'TABLE' | 'LOWLIGHT'>('SCREEN');

  // Calibration Corners (8-Point Mesh Warping)
  const [screenCorners, setScreenCorners] = useState<EightPoints>(() => {
    try {
      const saved = localStorage.getItem('airhockey_screen_corners');
      if (saved) return toEightPoints(JSON.parse(saved));
    } catch {}
    return DEFAULT_NORMALIZED_8POINTS;
  });
  const [cameraCorners, setCameraCorners] = useState<EightPoints>(() => {
    try {
      const saved = localStorage.getItem('airhockey_camera_corners');
      if (saved) return toEightPoints(JSON.parse(saved));
    } catch {}
    return DEFAULT_NORMALIZED_8POINTS;
  });
  const [goalSize, setGoalSize] = useState<number>(DEFAULT_GOAL_SIZE);
  const [isCameraMirrored, setIsCameraMirrored] = useState(false);

  // Custom Match Input States
  const [customMinutes, setCustomMinutes] = useState<number>(2);
  const [customSeconds, setCustomSeconds] = useState<number>(0);
  const [targetPointsInput, setTargetPointsInput] = useState<number>(5);

  // Video Streaming in Console for Camera Calibration
  const consoleVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraStreaming, setIsCameraStreaming] = useState(false);
  const [draggingCamIdx, setDraggingCamIdx] = useState<number | null>(null);
  const camContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync with Main App via Electron IPC, BroadcastChannel & LocalStorage
  useEffect(() => {
    const applyState = (data: any) => {
      if (!data) return;
      if (data.score) setScore(data.score);
      if (typeof data.timeLeft === 'number') setTimeLeft(data.timeLeft);
      if (data.gamePhase) setGamePhase(data.gamePhase);
      if (data.matchMode) setMatchMode(data.matchMode);
      if (data.theme) setTheme(data.theme);
      if (data.stats) setStats(data.stats);
      if (data.puck) setPuck(data.puck);
      if (data.blueRobot) setBlueRobot(data.blueRobot);
      if (data.redRobot) setRedRobot(data.redRobot);
      if (data.screenCorners) setScreenCorners(toEightPoints(data.screenCorners));
      if (data.cameraCorners) setCameraCorners(toEightPoints(data.cameraCorners));
      if (typeof data.lowLightMode === 'boolean') setLowLightMode(data.lowLightMode);
      if (typeof data.goalSize === 'number') setGoalSize(data.goalSize);
      if (typeof data.isCameraMirrored === 'boolean') setIsCameraMirrored(data.isCameraMirrored);
      if (typeof data.targetPoints === 'number') setTargetPointsInput(data.targetPoints);
      if (typeof data.customDuration === 'number') {
        setCustomMinutes(Math.floor(data.customDuration / 60));
        setCustomSeconds(data.customDuration % 60);
      }
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
        } else if (data.type === 'GAME_ACTION') {
          if (data.action === 'UPDATE_SCREEN_CORNERS' && data.screenCorners) {
            setScreenCorners(toEightPoints(data.screenCorners));
          } else if (data.action === 'UPDATE_CAMERA_CORNERS' && data.cameraCorners) {
            setCameraCorners(toEightPoints(data.cameraCorners));
          } else if (data.action === 'SET_LOW_LIGHT_MODE') {
            setLowLightMode(!!data.lowLightMode);
          }
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
    const actionId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = { ...action, actionId };
    if (window.electronAPI?.sendAction) {
      window.electronAPI.sendAction(payload);
    } else {
      try {
        const channel = new BroadcastChannel('airhockey_channel');
        channel.postMessage(payload);
        channel.close();
        localStorage.setItem('airhockey_action', JSON.stringify(payload));
      } catch {}
    }
  };

  // Start webcam stream when Camera Calibration tab opens
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isSettingsOpen && settingsTab === 'CAMERA') {
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        .then((s) => {
          stream = s;
          if (consoleVideoRef.current) {
            consoleVideoRef.current.srcObject = s;
            consoleVideoRef.current.play();
            setIsCameraStreaming(true);
          }
        })
        .catch(() => {
          setIsCameraStreaming(false);
        });
    } else {
      if (consoleVideoRef.current && consoleVideoRef.current.srcObject) {
        (consoleVideoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        consoleVideoRef.current.srcObject = null;
      }
      setIsCameraStreaming(false);
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isSettingsOpen, settingsTab]);

  const handleStartGame = () => {
    sendAction({ type: 'GAME_ACTION', action: 'START' });
  };

  const handlePauseGame = () => {
    sendAction({ type: 'GAME_ACTION', action: 'PAUSE' });
  };

  const handleAcknowledgeGameOver = () => {
    sendAction({ type: 'GAME_ACTION', action: 'PREPARE' });
  };

  // [REQ] 콘설에서 시간을 30초 단위로 추가 (로컬 상태 즉각 반영 & 단일 고유 액션 전송)
  const handleAddTime = (seconds: number) => {
    setTimeLeft((prev) => Math.max(1, prev + seconds));
    sendAction({ type: 'GAME_ACTION', action: 'ADD_TIME', seconds });
  };

  const handleAdjustScore = (team: 'blue' | 'red', delta: number) => {
    const nextScore = {
      ...score,
      [team]: Math.max(0, score[team] + delta),
    };
    setScore(nextScore);
    sendAction({ type: 'GAME_ACTION', action: 'SET_SCORE', score: nextScore });
  };

  // [REQ] 3개 모드: 1분 매치, 입력한 시간으로 매치, n점 선승제 (원클릭 즉시 변경)
  const handleSelectMode1Min = () => {
    setMatchMode('1MIN');
    setTimeLeft(60);
    sendAction({ type: 'GAME_ACTION', action: 'CHANGE_MODE', mode: '1MIN' });
  };

  const handleApplyCustomTimeMode = (mins?: number, secs?: number) => {
    const m = typeof mins === 'number' ? mins : customMinutes;
    const s = typeof secs === 'number' ? secs : customSeconds;
    const totalSecs = Math.max(10, m * 60 + s);
    setMatchMode('CUSTOM_TIME');
    setTimeLeft(totalSecs);
    sendAction({
      type: 'GAME_ACTION',
      action: 'CHANGE_MODE',
      mode: 'CUSTOM_TIME',
      customDuration: totalSecs,
    });
  };

  const handleApplyTargetPointsMode = (points?: number) => {
    const p = typeof points === 'number' ? points : targetPointsInput;
    const target = Math.max(1, p);
    setMatchMode('TARGET_N');
    setTimeLeft(600);
    sendAction({
      type: 'GAME_ACTION',
      action: 'CHANGE_MODE',
      mode: 'TARGET_N',
      targetPoints: target,
    });
  };

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    sendAction({ type: 'GAME_ACTION', action: 'SET_THEME', theme: nextTheme });
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

  // ----------------------------------------------------
  // Camera Calibration Pointer Handlers
  // ----------------------------------------------------
  const handleCamPointerDown = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingCamIdx(idx);
  };

  const handleCamContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingCamIdx === null || !camContainerRef.current) return;
    const rect = camContainerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const normX = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top) / rect.height));

    const next = [...cameraCorners] as EightPoints;
    next[draggingCamIdx] = { x: normX, y: normY };
    setCameraCorners(next);

    sendAction({
      type: 'GAME_ACTION',
      action: 'UPDATE_CAMERA_CORNERS',
      cameraCorners: next,
    });
    try {
      localStorage.setItem('airhockey_camera_corners', JSON.stringify(next));
    } catch {}
  };

  const handleToggleLowLightMode = () => {
    const next = !lowLightMode;
    setLowLightMode(next);
    sendAction({
      type: 'GAME_ACTION',
      action: 'SET_LOW_LIGHT_MODE',
      lowLightMode: next,
    });
  };

  const handleCamContainerPointerUp = () => {
    setDraggingCamIdx(null);
  };

  const handleStartScreenCalibrate = () => {
    sendAction({ type: 'GAME_ACTION', action: 'START_CALIBRATE_SCREEN' });
  };

  const handleConfirmScreenCalibrate = () => {
    sendAction({ type: 'GAME_ACTION', action: 'CONFIRM_CALIBRATION' });
  };

  const handleToggleCameraMirror = () => {
    const next = !isCameraMirrored;
    setIsCameraMirrored(next);
    sendAction({ type: 'GAME_ACTION', action: 'TOGGLE_MIRROR', isCameraMirrored: next });
  };

  const handleUpdateGoalSize = (size: number) => {
    setGoalSize(size);
    sendAction({ type: 'GAME_ACTION', action: 'UPDATE_GOAL_SIZE', goalSize: size });
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const isPlaying = gamePhase === 'PLAYING';
  const isTimeUp = gamePhase === 'TIME_UP';
  const isReady = gamePhase === 'READY' || gamePhase === 'CALIBRATION_SCREEN' || gamePhase === 'CALIBRATION_CAMERA';

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col p-4 select-none font-sans overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wide uppercase text-white flex items-center gap-2">
              AR Robot air hotkey
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                메인 관리 콘솔
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">경기장 라이브 미러링 & 실시간 경기 컨트롤 타워</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* [REQ] 글고 불 꺼도 인식 잘 되게 해줘 (설정에 이거 인식용 하나 넣어주면 ㄱㅅ) */}
          <button
            onClick={handleToggleLowLightMode}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              lowLightMode
                ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="불을 끈 어두운 방이나 프로젝터 전용 환경에서 마젠타 색상 인식을 증폭합니다"
          >
            <Sparkles className={`w-3.5 h-3.5 ${lowLightMode ? 'text-yellow-300 animate-spin' : 'text-slate-400'}`} />
            <span>암실 최적화: {lowLightMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* [REQ] 8. 관리 콘솔에 설정 버튼 넣어야지 ㅋㅋ */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            title="화면 및 카메라 캘리브레이션, 경기장 상세 설정"
          >
            <Settings className="w-4 h-4" />
            <span>설정 / 캘리브레이션</span>
          </button>

          {/* 프로젝터 테마 원클릭 변경 (다크 검정 / 라이트 흰색) */}
          <button
            onClick={handleToggleTheme}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors shadow-sm"
            title="메인 경기장 배경을 검은색(프로젝터 다크) 또는 흰색(라이트)으로 즉시 변경합니다"
          >
            {theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
            <span>경기장: {theme === 'dark' ? '다크(검정)' : '라이트(흰색)'}</span>
          </button>

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

      {/* Main Split Layout: Left (Live Field Mirror) & Right (Game Controls) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 pt-3 overflow-hidden">
        {/* Left: Live Game Mirror & Vision Status (Col 6) */}
        <div className="lg:col-span-6 flex flex-col gap-2 bg-slate-900/70 border border-slate-800 rounded-2xl p-3 overflow-hidden">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              실시간 경기장 미러링
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              퍽 속도: {Math.round(stats.maxPuckSpeed)} px/s
            </span>
          </div>

          {/* Mini Field SVG Representation */}
          <div className="relative flex-1 w-full bg-black rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center">
            <svg
              viewBox={`0 0 ${TABLE_WIDTH} ${TABLE_HEIGHT}`}
              className="w-full h-full p-2"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Outer Rail */}
              <rect
                x="6"
                y="6"
                width={TABLE_WIDTH - 12}
                height={TABLE_HEIGHT - 12}
                fill={theme === 'light' ? '#ffffff' : '#05070a'}
                stroke={theme === 'light' ? '#0f172a' : '#ffffff'}
                strokeWidth="5"
                rx="20"
              />

              {/* Center Line & Circle */}
              <line
                x1={TABLE_WIDTH / 2}
                y1="6"
                x2={TABLE_WIDTH / 2}
                y2={TABLE_HEIGHT - 6}
                stroke={theme === 'light' ? '#0f172a' : '#ffffff'}
                strokeWidth="3"
                strokeDasharray="10 8"
                opacity="0.75"
              />
              <circle
                cx={TABLE_WIDTH / 2}
                cy={TABLE_HEIGHT / 2}
                r="110"
                fill="none"
                stroke={theme === 'light' ? '#0f172a' : '#ffffff'}
                strokeWidth="3"
                opacity="0.65"
              />

              {/* Goal Openings (Only when playing) */}
              {!isReady && (
                <>
                  <rect x="0" y={TABLE_HEIGHT / 2 - 130} width="12" height="260" fill="#94a3b8" />
                  <rect x={TABLE_WIDTH - 12} y={TABLE_HEIGHT / 2 - 130} width="12" height="260" fill="#94a3b8" />
                </>
              )}

              {/* [REQ] 패들 1, 패들 2 단정하고 중립적인 화이트 링 디자인 */}
              <circle
                cx={blueRobot.tableX}
                cy={blueRobot.tableY}
                r="34"
                fill="none"
                stroke="#ffffff"
                strokeWidth="4"
              />
              <circle cx={blueRobot.tableX} cy={blueRobot.tableY} r="12" fill="#ffffff" />

              <circle
                cx={redRobot.tableX}
                cy={redRobot.tableY}
                r="34"
                fill="none"
                stroke="#ffffff"
                strokeWidth="4"
              />
              <circle cx={redRobot.tableX} cy={redRobot.tableY} r="12" fill="#ffffff" />

              {/* Puck */}
              <circle cx={puck.x} cy={puck.y} r="20" fill={theme === 'light' ? '#e11d48' : '#ffffff'} stroke="#64748b" strokeWidth="3" />
            </svg>
          </div>

          {/* 패들 1 (Cyan), 패들 2 (Yellow) 상태창 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950/80 border border-cyan-500/30 rounded-lg p-2.5 flex items-center justify-between">
              <span className="font-bold text-cyan-300 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${blueRobot.detected ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-slate-600'}`} />
                Cyan 팀 (1P)
              </span>
              <span className="font-mono text-slate-400">
                {blueRobot.detected ? `${Math.round(blueRobot.tableX)}, ${Math.round(blueRobot.tableY)}` : '미감지'}
              </span>
            </div>

            <div className="bg-slate-950/80 border border-yellow-500/30 rounded-lg p-2.5 flex items-center justify-between">
              <span className="font-bold text-yellow-300 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${redRobot.detected ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'bg-slate-600'}`} />
                Yellow 팀 (2P)
              </span>
              <span className="font-mono text-slate-400">
                {redRobot.detected ? `${Math.round(redRobot.tableX)}, ${Math.round(redRobot.tableY)}` : '미감지'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Controller Section (Col 6) */}
        <div className="lg:col-span-6 flex flex-col gap-2.5 overflow-y-auto">
          {/* Sports Scoreboard */}
          <div className="grid grid-cols-3 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            {/* Player 1 Score (Cyan) */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950/60 border border-cyan-500/30">
              <span className="text-xs font-bold text-cyan-400 mb-1">Cyan 팀 (1P)</span>
              <div className="text-4xl sm:text-5xl font-black font-mono text-cyan-300">{score.blue}</div>
              <div className="flex items-center gap-1 mt-2">
                <button
                  onClick={() => handleAdjustScore('blue', -1)}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleAdjustScore('blue', 1)}
                  className="w-7 h-7 rounded bg-cyan-700 hover:bg-cyan-600 text-white flex items-center justify-center text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Center Clock */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>경기 잔여 시간</span>
              </div>
              <div
                className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                  timeLeft <= 10 && isPlaying ? 'text-rose-400 animate-pulse' : 'text-white'
                }`}
              >
                {timeFormatted}
              </div>
              <span className="text-[11px] mt-2 px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-300">
                {matchMode === '1MIN'
                  ? '1분 매치'
                  : matchMode === 'CUSTOM_TIME'
                  ? `지정 시간 (${Math.floor(customMinutes)}분)`
                  : `${targetPointsInput}점 선승제`}
              </span>
            </div>

            {/* Player 2 Score (Yellow) */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950/60 border border-yellow-500/30">
              <span className="text-xs font-bold text-yellow-400 mb-1">Yellow 팀 (2P)</span>
              <div className="text-4xl sm:text-5xl font-black font-mono text-yellow-300">{score.red}</div>
              <div className="flex items-center gap-1 mt-2">
                <button
                  onClick={() => handleAdjustScore('red', -1)}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleAdjustScore('red', 1)}
                  className="w-7 h-7 rounded bg-yellow-600 hover:bg-yellow-500 text-slate-950 flex items-center justify-center text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Game Phase Transition Buttons */}
          {isTimeUp ? (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-2 border-slate-700 shadow-xl flex flex-col items-center text-center gap-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>게임이 종료되었습니다!</span>
              </div>
              <div className="text-xs text-slate-300">
                아래 버튼을 누르면 서브 전광판에 <strong>"게임 플레이 가능"</strong>이 뜨고, 메인은 <strong>골대 없는 대기 경기장</strong>으로 리셋됩니다.
              </div>
              <button
                onClick={handleAcknowledgeGameOver}
                className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-black text-sm uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-2"
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

          {/* [REQ] 10. 경기 시간 추가: 콘설에서 시간을 30초 단위로 추가 (+30초, -30초) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              경기 시간 30초 단위 추가 / 차감
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleAddTime(30)}
                className="py-3 px-4 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 border border-indigo-500/60 text-white text-sm font-black transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>+30초 추가</span>
              </button>
              <button
                onClick={() => handleAddTime(-30)}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-black transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98"
              >
                <Minus className="w-4 h-4" />
                <span>-30초 차감</span>
              </button>
            </div>
          </div>

          {/* [REQ] 10. 매치 모드 3종: ① 1분 매치, ② 입력한 시간으로 매치, ③ n점 선승제 (원클릭 즉시 전환) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2.5">
            <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              경기 매치 모드 (3종) - 클릭 시 즉시 변경
            </span>

            {/* 1. 1분 매치 */}
            <div
              onClick={() => !isPlaying && handleSelectMode1Min()}
              className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                matchMode === '1MIN'
                  ? 'bg-indigo-950/80 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                  : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
              } ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center border ${
                  matchMode === '1MIN' ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  1
                </span>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    1분 매치 (정규 60초)
                    {matchMode === '1MIN' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        현재 선택됨
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">기본 스피드 1분 숏 매치</div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  !isPlaying && handleSelectMode1Min();
                }}
                disabled={isPlaying}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  matchMode === '1MIN'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                } ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {matchMode === '1MIN' ? '적용 중' : '선택'}
              </button>
            </div>

            {/* 2. 입력한 시간으로 매치 */}
            <div
              onClick={() => !isPlaying && handleApplyCustomTimeMode()}
              className={`p-3 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer ${
                matchMode === 'CUSTOM_TIME'
                  ? 'bg-indigo-950/80 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                  : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
              } ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center border ${
                    matchMode === 'CUSTOM_TIME' ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    2
                  </span>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      입력한 시간으로 매치
                      {matchMode === 'CUSTOM_TIME' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                          현재 선택됨
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">분/초를 직접 입력하여 플레이</div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    !isPlaying && handleApplyCustomTimeMode();
                  }}
                  disabled={isPlaying}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    matchMode === 'CUSTOM_TIME'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  } ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {matchMode === 'CUSTOM_TIME' ? '적용 중' : '시간 설정 적용'}
                </button>
              </div>

              <div className="flex items-center gap-2 pl-9" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customMinutes}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      setCustomMinutes(val);
                      handleApplyCustomTimeMode(val, customSeconds);
                    }}
                    disabled={isPlaying}
                    className="w-16 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-center font-mono text-sm text-white focus:outline-none focus:border-indigo-500 font-bold"
                  />
                  <span className="text-xs text-slate-300 font-semibold">분</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    value={customSeconds}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                      setCustomSeconds(val);
                      handleApplyCustomTimeMode(customMinutes, val);
                    }}
                    disabled={isPlaying}
                    className="w-16 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-center font-mono text-sm text-white focus:outline-none focus:border-indigo-500 font-bold"
                  />
                  <span className="text-xs text-slate-300 font-semibold">초</span>
                </div>
              </div>
            </div>

            {/* 3. n점 선승제 */}
            <div
              onClick={() => !isPlaying && handleApplyTargetPointsMode()}
              className={`p-3 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer ${
                matchMode === 'TARGET_N'
                  ? 'bg-indigo-950/80 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                  : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
              } ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center border ${
                    matchMode === 'TARGET_N' ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    3
                  </span>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      n점 선승제 (목표 점수제)
                      {matchMode === 'TARGET_N' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                          현재 선택됨
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">먼저 목표 점수에 도달한 팀 승리</div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    !isPlaying && handleApplyTargetPointsMode();
                  }}
                  disabled={isPlaying}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    matchMode === 'TARGET_N'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  } ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {matchMode === 'TARGET_N' ? '적용 중' : '점수 설정 적용'}
                </button>
              </div>

              <div className="flex items-center gap-2 pl-9" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={targetPointsInput}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value) || 1);
                      setTargetPointsInput(val);
                      handleApplyTargetPointsMode(val);
                    }}
                    disabled={isPlaying}
                    className="w-18 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-center font-mono text-sm text-white focus:outline-none focus:border-indigo-500 font-bold"
                  />
                  <span className="text-xs text-slate-300 font-semibold">점 먼저 내면 즉시 승리</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* [REQ] 8. 설정 및 2단계 캘리브레이션 모달 */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-black text-white">경기장 설정 및 캘리브레이션</h2>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 p-2 gap-2">
              <button
                onClick={() => setSettingsTab('SCREEN')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  settingsTab === 'SCREEN'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>1. 창 캘리브레이션 (프로젝터)</span>
              </button>
              <button
                onClick={() => setSettingsTab('CAMERA')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  settingsTab === 'CAMERA'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>2. 카메라 캘리브레이션 (웹캠)</span>
              </button>
              <button
                onClick={() => setSettingsTab('TABLE')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  settingsTab === 'TABLE'
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Target className="w-4 h-4" />
                <span>3. 골대 크기 설정</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-5 flex-1 overflow-y-auto">
              {/* Tab 1: Screen (Projector) Calibration */}
              {settingsTab === 'SCREEN' && (
                <div className="flex flex-col gap-4">
                  <div className="p-4 rounded-2xl bg-sky-950/40 border border-sky-800/60 flex flex-col gap-2">
                    <span className="text-sm font-bold text-sky-300 flex items-center gap-1.5">
                      <Monitor className="w-4 h-4" />
                      프로젝터 투사 화면 책상 맞춤 (창 캘리브레이션)
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      아래 <strong>[메인 경기장 캘리브레이션 시작]</strong> 버튼을 누르면, 빔프로젝터가 투사 중인 <strong>메인 경기창에 4개 모서리 조절 핀</strong>이 나타납니다.
                      메인 경기창에서 마우스로 네 모서리를 실제 책상 모서리에 맞춘 뒤 완료를 누르세요.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={handleStartScreenCalibrate}
                      className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg"
                    >
                      <Monitor className="w-5 h-5" />
                      메인 경기장 캘리브레이션 시작 (메인 창에 핀 띄움)
                    </button>
                    <button
                      onClick={handleConfirmScreenCalibrate}
                      className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      창 캘리브레이션 저장 및 완료
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Camera Calibration (Live Webcam in Console) */}
              {settingsTab === 'CAMERA' && (
                <div className="flex flex-col gap-3">
                  <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-800/60 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                        <Camera className="w-4 h-4" />
                        8점 왜곡 보정 웹캠 캘리브레이션 (관리 콘솔 내부 조절)
                      </span>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        책상 네 모서리와 각 변의 중앙 8개 핀(1~8번)을 책상 테두리에 맞춰 왜곡을 완벽히 잡으세요.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleCameraMirror}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        isCameraMirrored
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" />
                      <span>{isCameraMirrored ? '반전 ON' : '반전 OFF'}</span>
                    </button>
                  </div>

                  {/* Live Webcam Video Container with 8 Corner Pins Overlay */}
                  <div
                    ref={camContainerRef}
                    onPointerMove={handleCamContainerPointerMove}
                    onPointerUp={handleCamContainerPointerUp}
                    className="relative w-full aspect-video bg-black rounded-2xl border-2 border-slate-700 overflow-hidden cursor-crosshair select-none touch-none flex items-center justify-center"
                  >
                    <video
                      ref={consoleVideoRef}
                      playsInline
                      muted
                      className={`w-full h-full object-cover pointer-events-none ${
                        isCameraMirrored ? 'scale-x-[-1]' : ''
                      }`}
                    />

                    {!isCameraStreaming && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-slate-400 text-xs gap-2">
                        <Camera className="w-8 h-8 animate-pulse text-slate-500" />
                        <span>웹캠 영상을 불러오는 중이거나 카메라 권한이 필요합니다...</span>
                      </div>
                    )}

                    {/* SVG Connecting Polygon */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      <polygon
                        points={cameraCorners
                          .map((p) => {
                            if (!camContainerRef.current) return '0,0';
                            const w = camContainerRef.current.clientWidth || 640;
                            const h = camContainerRef.current.clientHeight || 360;
                            return `${p.x * w},${p.y * h}`;
                          })
                          .join(' ')}
                        fill="rgba(99, 102, 241, 0.2)"
                        stroke="#6366f1"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                      />
                    </svg>

                    {/* 8 Draggable Camera Calibration Pins */}
                    {cameraCorners.map((corner, idx) => {
                      const colors = [
                        '#0284c7', // 1. 좌상
                        '#06b6d4', // 2. 상단중앙
                        '#2563eb', // 3. 우상
                        '#3b82f6', // 4. 우측중앙
                        '#d97706', // 5. 우하
                        '#eab308', // 6. 하단중앙
                        '#7c3aed', // 7. 좌하
                        '#9333ea', // 8. 좌측중앙
                      ];
                      const labels = [
                        '1.좌상',
                        '2.상단중앙',
                        '3.우상',
                        '4.우측중앙',
                        '5.우하',
                        '6.하단중앙',
                        '7.좌하',
                        '8.좌측중앙',
                      ];
                      return (
                        <div
                          key={idx}
                          onPointerDown={(e) => handleCamPointerDown(idx, e)}
                          style={{
                            left: `${corner.x * 100}%`,
                            top: `${corner.y * 100}%`,
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move z-30 select-none group touch-none"
                        >
                          <div
                            className="w-7 h-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-xs font-black text-white group-hover:scale-125 transition-transform"
                            style={{ backgroundColor: colors[idx % colors.length] }}
                          >
                            {idx + 1}
                          </div>
                          <span className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 px-1.5 py-0.5 rounded text-[9px] text-white pointer-events-none font-bold">
                            {labels[idx % labels.length]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 3: Table & Goal Size */}
              {settingsTab === 'TABLE' && (
                <div className="flex flex-col gap-4">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-amber-400" />
                        골대 크기 조절
                      </span>
                      <span className="text-xs font-mono font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800">
                        {goalSize} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="160"
                      max="380"
                      step="10"
                      value={goalSize}
                      onChange={(e) => handleUpdateGoalSize(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>좁은 골대 (160px - 고난도)</span>
                      <span>기본 (260px)</span>
                      <span>넓은 골대 (380px - 쉬움)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors shadow"
              >
                설정 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
