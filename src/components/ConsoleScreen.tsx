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
  ColorSettings,
  VisionEngineType,
  RobotState,
  CENTER_SPEAKER_RADIUS,
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
  Cpu,
  Pipette,
  Zap,
  SlidersHorizontal,
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
  const [allRobots, setAllRobots] = useState<RobotState[]>([]);

  // Vision Diagnostics & Settings
  const [colorSettings, setColorSettings] = useState<ColorSettings>({
    magenta: {
      hMin: 255,
      hMax: 25,
      sMin: 0.10,
      sMax: 1.0,
      vMin: 0.08,
      vMax: 1.0,
    },
    minBlobSize: 8,
    maxBlobSize: 15000,
    visionEngine: 'OPENCV',
    sensitivity: 3,
    customSample: null,
    lowLightMode: false,
  });
  const [visionDiagnostics, setVisionDiagnostics] = useState<{
    engine: VisionEngineType;
    isOpenCVActive: boolean;
    detectedBlobsCount: number;
    blueConfidence: number;
    redConfidence: number;
  }>({
    engine: 'OPENCV',
    isOpenCVActive: true,
    detectedBlobsCount: 0,
    blueConfidence: 0,
    redConfidence: 0,
  });

  // Settings & Calibration Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'SCREEN' | 'CAMERA' | 'VISION' | 'TABLE'>('VISION');

  // Calibration Corners:
  // - screenCorners: 4-Point Projector Display Quad (경기장은 4점으로 깨끗하고 반듯하게)
  // - cameraCorners: 8-Point Wide-Angle Mesh Warping (카메라는 8점으로 렌즈 왜곡 보정)
  const [screenCorners, setScreenCorners] = useState<FourCorners>(() => {
    try {
      const saved = localStorage.getItem('airhockey_screen_corners');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.length === 4) return parsed;
        if (parsed.length === 8) return [parsed[0], parsed[2], parsed[4], parsed[6]];
      }
    } catch {}
    return DEFAULT_NORMALIZED_CORNERS;
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
      if (data.screenCorners) {
        const sc = data.screenCorners;
        setScreenCorners(sc.length === 4 ? sc : [sc[0], sc[2], sc[4], sc[6]]);
      }
      if (data.cameraCorners) setCameraCorners(toEightPoints(data.cameraCorners));
      if (typeof data.lowLightMode === 'boolean') setLowLightMode(data.lowLightMode);
      if (data.colorSettings) setColorSettings(data.colorSettings);
      if (data.visionDiagnostics) setVisionDiagnostics(data.visionDiagnostics);
      if (data.allRobots) setAllRobots(data.allRobots);
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
            const sc = data.screenCorners;
            setScreenCorners(sc.length === 4 ? sc : [sc[0], sc[2], sc[4], sc[6]]);
          } else if (data.action === 'UPDATE_CAMERA_CORNERS' && data.cameraCorners) {
            setCameraCorners(toEightPoints(data.cameraCorners));
          } else if (data.action === 'SET_LOW_LIGHT_MODE') {
            setLowLightMode(!!data.lowLightMode);
          } else if (data.action === 'UPDATE_COLOR_SETTINGS' && data.colorSettings) {
            setColorSettings((prev) => ({ ...prev, ...data.colorSettings }));
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

  // Start webcam stream when Camera Calibration or Vision Studio tab opens
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isSettingsOpen && (settingsTab === 'CAMERA' || settingsTab === 'VISION')) {
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

  // Eyedropper Color Sampler on Webcam Feed
  const handleEyedropperSample = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!consoleVideoRef.current || !camContainerRef.current) return;
    const video = consoleVideoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const rect = camContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = Math.max(0, Math.min(1, clickX / rect.width));
    const normY = Math.max(0, Math.min(1, clickY / rect.height));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const px = Math.floor(normX * canvas.width);
    const py = Math.floor(normY * canvas.height);
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    const sample = { r, g, b, hex };
    setColorSettings((prev) => ({ ...prev, customSample: sample }));
    sendAction({
      type: 'GAME_ACTION',
      action: 'SAMPLE_COLOR',
      customSample: sample,
    });
  };

  const handleClearSample = () => {
    setColorSettings((prev) => ({ ...prev, customSample: null }));
    sendAction({
      type: 'GAME_ACTION',
      action: 'SAMPLE_COLOR',
      customSample: null,
    });
  };

  const handleUpdateEngine = (engine: VisionEngineType) => {
    setColorSettings((prev) => ({ ...prev, visionEngine: engine }));
    sendAction({
      type: 'GAME_ACTION',
      action: 'UPDATE_COLOR_SETTINGS',
      colorSettings: { visionEngine: engine },
    });
  };

  const handleUpdateSensitivity = (sens: number) => {
    setColorSettings((prev) => ({ ...prev, sensitivity: sens }));
    sendAction({
      type: 'GAME_ACTION',
      action: 'UPDATE_COLOR_SETTINGS',
      colorSettings: { sensitivity: sens },
    });
  };

  const handleApplyPreset = (preset: 'STANDARD' | 'PROJECTOR' | 'DARKLIGHT' | 'MAX_SENS') => {
    let next: Partial<ColorSettings> = {};
    if (preset === 'STANDARD') {
      next = { visionEngine: 'OPENCV', sensitivity: 3, lowLightMode: false, customSample: null };
      setLowLightMode(false);
    } else if (preset === 'PROJECTOR') {
      next = { visionEngine: 'CHROMATIC', sensitivity: 3, lowLightMode: false };
      setLowLightMode(false);
    } else if (preset === 'DARKLIGHT') {
      next = { visionEngine: 'OPENCV', sensitivity: 4, lowLightMode: true };
      setLowLightMode(true);
      sendAction({ type: 'GAME_ACTION', action: 'SET_LOW_LIGHT_MODE', lowLightMode: true });
    } else if (preset === 'MAX_SENS') {
      next = { visionEngine: 'OPENCV', sensitivity: 5, lowLightMode: false };
      setLowLightMode(false);
    }
    setColorSettings((prev) => ({ ...prev, ...next } as ColorSettings));
    sendAction({
      type: 'GAME_ACTION',
      action: 'UPDATE_COLOR_SETTINGS',
      colorSettings: next,
    });
  };

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
          {/* [REQ] 전문 인식 관리 시스템 바로가기 버튼 */}
          <button
            onClick={() => {
              setIsSettingsOpen(true);
              setSettingsTab('VISION');
            }}
            className="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-black flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            title="실시간 비전 엔진 진단, 원클릭 스포이트 및 마젠타 블록 인식 스튜디오"
          >
            <Cpu className="w-4 h-4 text-yellow-300" />
            <span>비전 인식 관리 스튜디오</span>
          </button>

          {/* [REQ] 중간중간 튕기는 장애물 모드 (매번 랜덤배치) */}
          {/* [REQ] 정가운데 물리 스피커 존 및 2~10개 마젠타 로봇 상태 인디케이터 */}
          <div
            className="px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-950/40 text-sky-300 text-xs font-bold flex items-center gap-1.5 shadow-sm"
            title="테이블 정가운데 물리 스피커(반경 44px) 충돌 반사 활성화됨"
          >
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span>중앙 스피커 존: ON</span>
          </div>

          <div
            className="px-3 py-1.5 rounded-lg border border-pink-500/40 bg-pink-950/40 text-pink-300 text-xs font-bold flex items-center gap-1.5 shadow-sm"
            title="마젠타 센서 블록 2~10개 유동 실시간 추적 중 (1P, 2P 및 장애물 로봇)"
          >
            <Sparkles className="w-3.5 h-3.5 text-pink-300" />
            <span>마젠타 센서: {allRobots.length > 0 ? allRobots.length : (blueRobot.detected ? 1 : 0) + (redRobot.detected ? 1 : 0)}개</span>
          </div>

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

              {/* Center Speaker Physical Zone */}
              <g>
                <circle
                  cx="500"
                  cy="300"
                  r={CENTER_SPEAKER_RADIUS}
                  fill="rgba(56, 189, 248, 0.15)"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="5 3"
                />
                <circle cx="500" cy="300" r="16" fill="rgba(56, 189, 248, 0.3)" stroke="#38bdf8" strokeWidth="1.5" />
                <circle cx="500" cy="300" r="4" fill="#38bdf8" />
              </g>

              {/* Dynamic 2..10 Magenta Obstacle Robots */}
              {allRobots.filter((r) => r.team === 'obstacle').map((obs, idx) => (
                <g key={obs.id || `obs-${idx}`}>
                  <circle
                    cx={obs.tableX}
                    cy={obs.tableY}
                    r="40"
                    fill="rgba(236, 72, 153, 0.25)"
                    stroke="#ec4899"
                    strokeWidth="3"
                  />
                  <circle cx={obs.tableX} cy={obs.tableY} r="14" fill="#ec4899" />
                </g>
              ))}
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
                <span>1. 창 캘리브레이션</span>
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
                <span>2. 카메라 캘리브레이션</span>
              </button>
              <button
                onClick={() => setSettingsTab('VISION')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  settingsTab === 'VISION'
                    ? 'bg-pink-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu className="w-4 h-4 text-yellow-300" />
                <span>3. 비전 인식 스튜디오</span>
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
                <span>4. 골대 크기</span>
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

              {/* Tab: VISION - 전문 비전 인식 스튜디오 */}
              {settingsTab === 'VISION' && (
                <div className="flex flex-col gap-4">
                  {/* 1. 실시간 진단 HUD */}
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-pink-400 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-pink-400 animate-pulse" />
                        실시간 비전 인식 상태 진단 (Live Vision HUD)
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-pink-950 border border-pink-700 text-pink-300">
                        {visionDiagnostics?.engine || colorSettings.visionEngine} {visionDiagnostics?.isOpenCVActive ? '(WASM 활성)' : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* 1P 검출 상태 (Cyan) */}
                      <div className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-all ${
                        visionDiagnostics?.blueConfidence > 0.3
                          ? 'bg-cyan-950/40 border-cyan-500/50 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-cyan-400 flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${visionDiagnostics?.blueConfidence > 0.3 ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'}`} />
                            1P (Cyan) 패들 블록
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            visionDiagnostics?.blueConfidence > 0.3
                              ? 'bg-cyan-500 text-black'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {visionDiagnostics?.blueConfidence > 0.3 ? '감지 성공' : '미검출'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-300">
                          {visionDiagnostics?.blueConfidence > 0.3 ? '패들 추적 중 (동기화 완료)' : '패들 수색 중...'}
                        </div>
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>신뢰도: {Math.round((visionDiagnostics?.blueConfidence || 0) * 100)}%</span>
                          <span>총 블롭 수: {visionDiagnostics?.detectedBlobsCount || 0}</span>
                        </div>
                      </div>

                      {/* 2P 검출 상태 (Yellow) */}
                      <div className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-all ${
                        visionDiagnostics?.redConfidence > 0.3
                          ? 'bg-yellow-950/40 border-yellow-500/50 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-yellow-400 flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${visionDiagnostics?.redConfidence > 0.3 ? 'bg-yellow-400 animate-ping' : 'bg-slate-600'}`} />
                            2P (Yellow) 패들 블록
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            visionDiagnostics?.redConfidence > 0.3
                              ? 'bg-yellow-500 text-black'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {visionDiagnostics?.redConfidence > 0.3 ? '감지 성공' : '미검출'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-300">
                          {visionDiagnostics?.redConfidence > 0.3 ? '패들 추적 중 (동기화 완료)' : '패들 수색 중...'}
                        </div>
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>신뢰도: {Math.round((visionDiagnostics?.redConfidence || 0) * 100)}%</span>
                          <span>총 블롭 수: {visionDiagnostics?.detectedBlobsCount || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. 원클릭 환경 프리셋 */}
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-2.5">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      원클릭 조명 환경 프리셋 (환경에 맞춰 즉시 최적화)
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => handleApplyPreset('STANDARD')}
                        className="py-2.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex flex-col items-center gap-1 transition-all active:scale-95"
                      >
                        <Sun className="w-4 h-4 text-amber-300" />
                        <span>기본 실내 형광등</span>
                      </button>
                      <button
                        onClick={() => handleApplyPreset('PROJECTOR')}
                        className="py-2.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-sky-300 flex flex-col items-center gap-1 transition-all active:scale-95"
                      >
                        <Monitor className="w-4 h-4 text-sky-400" />
                        <span>프로젝터 투사광</span>
                      </button>
                      <button
                        onClick={() => handleApplyPreset('DARKLIGHT')}
                        className="py-2.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-purple-700/60 text-xs font-bold text-purple-300 flex flex-col items-center gap-1 transition-all active:scale-95"
                      >
                        <Moon className="w-4 h-4 text-purple-400" />
                        <span>🌙 불 끈 암실</span>
                      </button>
                      <button
                        onClick={() => handleApplyPreset('MAX_SENS')}
                        className="py-2.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-pink-700/60 text-xs font-bold text-pink-300 flex flex-col items-center gap-1 transition-all active:scale-95"
                      >
                        <Sparkles className="w-4 h-4 text-pink-400" />
                        <span>초고감도 마젠타</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. 웹캠 화면 인터랙티브 스포이트 (Eyedropper) */}
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Pipette className="w-4 h-4 text-pink-400" />
                        실시간 웹캠 화면 & 원클릭 스포이트 색상 학습
                      </span>
                      {colorSettings.customSample && (
                        <button
                          onClick={handleClearSample}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                        >
                          학습 초기화
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400">
                      💡 아래 웹캠 화면에서 실제 레고 블록/패들을 마우스로 <strong>클릭</strong>하면 그 지점의 색상을 즉시 학습하여 인식률을 극대화합니다.
                    </p>

                    {/* 인터랙티브 웹캠 화면 */}
                    <div
                      ref={camContainerRef}
                      className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-700 cursor-crosshair select-none"
                      onClick={handleEyedropperSample}
                    >
                      <video
                        ref={consoleVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-contain ${isCameraMirrored ? '-scale-x-100' : ''}`}
                      />
                      {/* 스포이트 타겟 오버레이 안내 */}
                      <div className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-sm border border-slate-600 text-[11px] text-white font-bold flex items-center gap-1.5 pointer-events-none">
                        <Pipette className="w-3.5 h-3.5 text-pink-400 animate-bounce" />
                        <span>클릭한 위치의 색상을 즉시 학습</span>
                      </div>
                    </div>

                    {/* 현재 타겟 색상 미리보기 */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">학습된 커스텀 컬러:</span>
                        {colorSettings.customSample ? (
                          <>
                            <div
                              className="w-5 h-5 rounded-md border border-white/40 shadow"
                              style={{ backgroundColor: colorSettings.customSample.hex }}
                            />
                            <span className="font-mono text-pink-400 font-bold">{colorSettings.customSample.hex}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              (R:{colorSettings.customSample.r} G:{colorSettings.customSample.g} B:{colorSettings.customSample.b})
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-500 text-[11px]">기본 고감도 마젠타/형광핑크 모델 적용 중</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 4. 엔진 상세 제어 및 감도 조절 */}
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-3">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
                      인식 엔진 모드 & 감도 세부 설정
                    </span>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleUpdateEngine('OPENCV')}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                          colorSettings.visionEngine === 'OPENCV'
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        OpenCV (WASM 고성능)
                      </button>
                      <button
                        onClick={() => handleUpdateEngine('CHROMATIC')}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                          colorSettings.visionEngine === 'CHROMATIC'
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        스마트 크로마틱 (RGB 비율)
                      </button>
                      <button
                        onClick={() => handleUpdateEngine('ADAPTIVE_HSV')}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                          colorSettings.visionEngine === 'ADAPTIVE_HSV'
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        적응형 HSV
                      </button>
                    </div>

                    {/* 감도 슬라이더 */}
                    <div className="flex flex-col gap-1.5 pt-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">인식 감도 (1: 정밀 ~ 5: 초민감)</span>
                        <span className="font-mono font-bold text-pink-400 bg-pink-950 px-2 py-0.5 rounded border border-pink-800">
                          Lv.{colorSettings.sensitivity}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={colorSettings.sensitivity}
                        onChange={(e) => handleUpdateSensitivity(Number(e.target.value))}
                        className="w-full accent-pink-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Table & Goal Size */}
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
