import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FourCorners,
  GamePhase,
  MatchScore,
  MatchStats,
  Particle,
  PuckState,
  RobotState,
  ColorSettings,
  MatchMode,
  MATCH_MODES,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  DEFAULT_GOAL_SIZE,
  PUCK_RADIUS,
  ROBOT_RADIUS,
  DEFAULT_NORMALIZED_CORNERS,
  LiveGameState,
} from './types/hockey';
import { PerspectiveTransformer } from './utils/perspective';
import {
  DEFAULT_COLOR_SETTINGS,
  detectTwoMagentaBlobs,
  sampleColorAtPoint,
  createFilterFromSample,
  DetectedBlob,
} from './utils/vision';
import { stepPuckPhysics } from './utils/physics';
import { soundManager } from './utils/audio';
import { SettingsModal } from './components/SettingsModal';
import { GameCanvas } from './components/GameCanvas';
import { CalibrationOverlay } from './components/CalibrationOverlay';
import { ColorTunerModal } from './components/ColorTunerModal';
import { GameOverModal } from './components/GameOverModal';
import {
  SwitchCamera,
  AlertCircle,
  Eye,
  EyeOff,
  FlipHorizontal,
  Monitor,
  Columns2,
  Maximize,
  Minimize,
  Sliders,
  Tv,
} from 'lucide-react';

export default function App() {
  // Game & Match States (Blue vs Red, Match Modes: 1m, 2m, 3m, 5pts)
  const [matchMode, setMatchMode] = useState<MatchMode>('1MIN');
  const [gamePhase, setGamePhase] = useState<GamePhase>('READY');
  const [timeLeft, setTimeLeft] = useState<number>(MATCH_MODES['1MIN'].duration);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [score, setScore] = useState<MatchScore>({ blue: 0, red: 0 });
  const [stats, setStats] = useState<MatchStats>({
    blueHits: 0,
    redHits: 0,
    maxPuckSpeed: 0,
    lastScoredTeam: null,
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isVirtualMode, setIsVirtualMode] = useState(false);
  const [showCameraPip, setShowCameraPip] = useState(false);
  const [goalAnnouncement, setGoalAnnouncement] = useState<{
    team: 'blue' | 'red';
    countdown: number;
  } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Viewport Container Size
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 1200, height: 680 });

  // Vision & Camera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [colorSettings, setColorSettings] = useState<ColorSettings>(DEFAULT_COLOR_SETTINGS);
  const [isColorTunerOpen, setIsColorTunerOpen] = useState(false);
  const [isPickingColor, setIsPickingColor] = useState(false);

  // 2-Step Calibration State:
  // 1. screenCorners: 4 corners of the game court on the screen/projector display
  // 2. cameraCorners: 4 matching points picked in the live camera video
  const [screenCorners, setScreenCorners] = useState<FourCorners>(DEFAULT_NORMALIZED_CORNERS);
  const [cameraCorners, setCameraCorners] = useState<FourCorners>(DEFAULT_NORMALIZED_CORNERS);
  const [goalSize, setGoalSize] = useState<number>(DEFAULT_GOAL_SIZE);
  const [isCameraMirrored, setIsCameraMirrored] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);

  // Helper to convert normalized [0, 1] corners to pixel coordinates
  const getPixelCorners = useCallback((corners: FourCorners, w: number, h: number): FourCorners => [
    { x: corners[0].x * w, y: corners[0].y * h },
    { x: corners[1].x * w, y: corners[1].y * h },
    { x: corners[2].x * w, y: corners[2].y * h },
    { x: corners[3].x * w, y: corners[3].y * h },
  ], []);

  // 1. Screen Transformer: maps virtual table coordinates (1000 x 600) to screen display pixels
  const screenTransformerRef = useRef<PerspectiveTransformer>(
    new PerspectiveTransformer(getPixelCorners(DEFAULT_NORMALIZED_CORNERS, 1200, 680))
  );

  // 2. Camera Transformer: maps camera processing frame coordinates (640 x 360) to table coordinates (1000 x 600)
  const cameraTransformerRef = useRef<PerspectiveTransformer>(
    new PerspectiveTransformer(getPixelCorners(DEFAULT_NORMALIZED_CORNERS, 640, 360))
  );

  // Update screen transformer when screenCorners or containerSize change
  useEffect(() => {
    const pixelCorners = getPixelCorners(screenCorners, containerSize.width, containerSize.height);
    screenTransformerRef.current.updateCorners(pixelCorners);
  }, [screenCorners, containerSize, getPixelCorners]);

  // Update camera transformer when cameraCorners change
  useEffect(() => {
    const pixelCorners = getPixelCorners(cameraCorners, 640, 360);
    cameraTransformerRef.current.updateCorners(pixelCorners);
  }, [cameraCorners, getPixelCorners]);

  // Track container dimensions on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setContainerSize({ width: clientWidth, height: clientHeight });
        }
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Track Fullscreen state (both Electron native fullscreen and browser fullscreen)
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

  // Canvas Refs & Processing
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastVisionTimeRef = useRef<number>(0);
  const lastStateSyncTimeRef = useRef<number>(0);

  // Robot States (Both detected via physical Magenta blocks)
  // Blue Robot: Player 1 (Left / Blue Goal side)
  const initialBlueRobot: RobotState = {
    team: 'blue',
    tableX: 200,
    tableY: TABLE_HEIGHT / 2,
    screenX: 240,
    screenY: 340,
    vx: 0,
    vy: 0,
    detected: false,
    radius: ROBOT_RADIUS,
    lastSeenTime: 0,
    confidence: 0,
  };

  const initialRedRobot: RobotState = {
    team: 'red',
    tableX: 800,
    tableY: TABLE_HEIGHT / 2,
    screenX: 960,
    screenY: 340,
    vx: 0,
    vy: 0,
    detected: false,
    radius: ROBOT_RADIUS,
    lastSeenTime: 0,
    confidence: 0,
  };

  const initialPuck: PuckState = {
    x: TABLE_WIDTH / 2,
    y: TABLE_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: PUCK_RADIUS,
    trail: [],
    lastHitTeam: null,
  };

  const [blueRobot, setBlueRobot] = useState<RobotState>(initialBlueRobot);
  const [redRobot, setRedRobot] = useState<RobotState>(initialRedRobot);
  const [puck, setPuck] = useState<PuckState>(initialPuck);
  const [particles, setParticles] = useState<Particle[]>([]);

  // High-performance mutable live game state ref for continuous 60fps simulation without React GC pauses
  const liveStateRef = useRef<LiveGameState>({
    blueRobot: initialBlueRobot,
    redRobot: initialRedRobot,
    puck: initialPuck,
    particles: [],
  });

  // Keep references to frequently read configuration values to prevent useEffect rebuilds
  const gamePhaseRef = useRef(gamePhase);
  gamePhaseRef.current = gamePhase;
  const matchModeRef = useRef(matchMode);
  matchModeRef.current = matchMode;
  const isVirtualModeRef = useRef(isVirtualMode);
  isVirtualModeRef.current = isVirtualMode;
  const colorSettingsRef = useRef(colorSettings);
  colorSettingsRef.current = colorSettings;
  const cameraCornersRef = useRef(cameraCorners);
  cameraCornersRef.current = cameraCorners;
  const screenCornersRef = useRef(screenCorners);
  screenCornersRef.current = screenCorners;
  const goalSizeRef = useRef(goalSize);
  goalSizeRef.current = goalSize;
  const isCameraMirroredRef = useRef(isCameraMirrored);
  isCameraMirroredRef.current = isCameraMirrored;
  const isColorTunerOpenRef = useRef(isColorTunerOpen);
  isColorTunerOpenRef.current = isColorTunerOpen;

  // Broadcast state to secondary scoreboard & admin console screens
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    try {
      broadcastRef.current = new BroadcastChannel('airhockey_channel');
    } catch {}
    return () => {
      broadcastRef.current?.close();
    };
  }, []);

  const sendFullSyncState = useCallback(() => {
    const live = liveStateRef.current;
    const payload = {
      type: 'SYNC_STATE' as const,
      score,
      timeLeft,
      gamePhase,
      matchMode,
      theme,
      stats,
      goalAnnouncement,
      puck: { x: live.puck.x, y: live.puck.y, vx: live.puck.vx, vy: live.puck.vy },
      blueRobot: { tableX: live.blueRobot.tableX, tableY: live.blueRobot.tableY, detected: live.blueRobot.detected, confidence: live.blueRobot.confidence },
      redRobot: { tableX: live.redRobot.tableX, tableY: live.redRobot.tableY, detected: live.redRobot.detected, confidence: live.redRobot.confidence },
    };
    try {
      window.electronAPI?.sendSyncState(payload);
      broadcastRef.current?.postMessage(payload);
      localStorage.setItem('airhockey_sync', JSON.stringify(payload));
    } catch {}
  }, [score, timeLeft, gamePhase, matchMode, theme, stats, goalAnnouncement]);

  useEffect(() => {
    sendFullSyncState();
  }, [sendFullSyncState]);

  // Handle Mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundManager.setMuted(nextMuted);
  };

  // ----------------------------------------------------
  // Camera Setup & Streaming
  // ----------------------------------------------------
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    try {
      setCameraError(null);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('이 브라우저는 웹캠 접근을 지원하지 않습니다.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: unknown) {
      console.warn('Camera notice:', err);
      if (facing === 'environment') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            setCameraActive(true);
            setCameraFacing('user');
            return;
          }
        } catch {
          // Both failed
        }
      }
      setCameraActive(false);
      setCameraError('카메라를 찾을 수 없거나 권한이 필요합니다. [가상봇 ON] 버튼으로 바로 플레이할 수 있습니다.');
    }
  }, []);

  useEffect(() => {
    startCamera(cameraFacing);
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraFacing, startCamera]);

  const handleToggleCameraFacing = () => {
    const next = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(next);
  };

  // ----------------------------------------------------
  // Match Timer (60s countdown)
  // ----------------------------------------------------
  useEffect(() => {
    if (gamePhase !== 'PLAYING') return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          soundManager.playGameOver();
          setGamePhase('TIME_UP');
          return 0;
        }
        if (prev <= 4) {
          soundManager.playCountdown(prev === 1);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gamePhase]);

  // ----------------------------------------------------
  // Spawn Spark & Confetti Particles ([REQ] 공 주변 효과 지우기 -> 파티클 완전 비활성화)
  // ----------------------------------------------------
  const spawnParticles = (_screenX: number, _screenY: number, _color: string, _count = 16) => {
    // Zero extra particles for clean, non-distracting projector view
    liveStateRef.current.particles = [];
  };

  // ----------------------------------------------------
  // Serve Puck to Center
  // ----------------------------------------------------
  const resetPuckServe = useCallback((targetTeam?: 'blue' | 'red') => {
    const angleRange = Math.PI / 4;
    let baseAngle = targetTeam === 'red' ? 0 : Math.PI;
    if (!targetTeam) {
      baseAngle = Math.random() > 0.5 ? 0 : Math.PI;
    }
    const angle = baseAngle + (Math.random() - 0.5) * angleRange;
    const speed = 400;

    const nextPuck: PuckState = {
      x: TABLE_WIDTH / 2,
      y: TABLE_HEIGHT / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: PUCK_RADIUS,
      trail: [],
      lastHitTeam: null,
    };
    liveStateRef.current.puck = nextPuck;
    setPuck(nextPuck);
  }, []);

  // ----------------------------------------------------
  // Start / Pause / Reset Match Handlers
  // ----------------------------------------------------
  const handleStartGame = () => {
    soundManager.playWhistle();
    if (gamePhase === 'TIME_UP' || timeLeft === 0) {
      setTimeLeft(MATCH_MODES[matchMode].duration);
      setScore({ blue: 0, red: 0 });
      setStats({
        blueHits: 0,
        redHits: 0,
        maxPuckSpeed: 0,
        lastScoredTeam: null,
      });
    }
    setIsCalibrating(false);
    setGamePhase('PLAYING');
    resetPuckServe();
  };

  const handlePauseGame = () => {
    setGamePhase('READY');
  };

  const handleResetGame = () => {
    setTimeLeft(MATCH_MODES[matchMode].duration);
    setScore({ blue: 0, red: 0 });
    setStats({
      blueHits: 0,
      redHits: 0,
      maxPuckSpeed: 0,
      lastScoredTeam: null,
    });
    setGamePhase('READY');
    setGoalAnnouncement(null);
    resetPuckServe();
  };

  // Listen for actions from Admin Console / Scoreboard
  useEffect(() => {
    const handleAction = (msg: any) => {
      if (!msg || msg.type !== 'GAME_ACTION') return;
      if (msg.action === 'START') {
        handleStartGame();
      } else if (msg.action === 'PAUSE') {
        handlePauseGame();
      } else if (msg.action === 'RESET' || msg.action === 'PREPARE') {
        // [REQ] 콘솔에서 게임 종료 누르면: 콘솔은 게임 시작 버튼, 서브는 게임 플레이 가능, 메인은 골대 없는 경기장으로
        const currentMode = matchModeRef.current || '1MIN';
        setTimeLeft(MATCH_MODES[currentMode].duration);
        setScore({ blue: 0, red: 0 });
        setStats({
          blueHits: 0,
          redHits: 0,
          maxPuckSpeed: 0,
          lastScoredTeam: null,
        });
        setGamePhase('READY');
        setGoalAnnouncement(null);
        resetPuckServe();
      } else if (msg.action === 'ADD_TIME') {
        setTimeLeft((prev) => Math.max(1, prev + (msg.seconds || 30)));
      } else if (msg.action === 'SET_SCORE') {
        if (msg.score) setScore(msg.score);
      } else if (msg.action === 'CHANGE_MODE') {
        const modeKey = msg.mode as MatchMode;
        if (modeKey && MATCH_MODES[modeKey]) {
          setMatchMode(modeKey);
          setTimeLeft(MATCH_MODES[modeKey].duration);
          setScore({ blue: 0, red: 0 });
          setGamePhase('READY');
          resetPuckServe();
        }
      } else if (msg.action === 'SET_THEME') {
        if (msg.theme === 'dark' || msg.theme === 'light') {
          setTheme(msg.theme);
        }
      }
    };

    let unsubElectron: (() => void) | undefined;
    if (window.electronAPI?.onAction) {
      unsubElectron = window.electronAPI.onAction(handleAction);
    }

    const channel = new BroadcastChannel('airhockey_channel');
    channel.onmessage = (event) => {
      handleAction(event.data);
    };

    const handleStorageAction = (e: StorageEvent) => {
      if (e.key === 'airhockey_action' && e.newValue) {
        try {
          handleAction(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageAction);

    return () => {
      if (unsubElectron) unsubElectron();
      channel.close();
      window.removeEventListener('storage', handleStorageAction);
    };
  }, [resetPuckServe]);

  // Keyboard Shortcut: Space key to start / pause / restart match
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        if (gamePhase === 'PLAYING') {
          handlePauseGame();
        } else if (gamePhase === 'READY' || gamePhase === 'TIME_UP') {
          handleStartGame();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gamePhase, matchMode]);

  // ----------------------------------------------------
  // Goal Handling (청팀 vs 적팀)
  // ----------------------------------------------------
  const handleGoalScored = useCallback((scoringTeam: 'blue' | 'red') => {
    soundManager.playGoal();
    let isTargetReached = false;
    setScore((prev) => {
      const nextScore = {
        ...prev,
        [scoringTeam]: prev[scoringTeam] + 1,
      };
      if (matchMode === 'TARGET_5' && nextScore[scoringTeam] >= 5) {
        isTargetReached = true;
      }
      return nextScore;
    });
    setStats((prev) => ({
      ...prev,
      lastScoredTeam: scoringTeam,
    }));

    // Particle explosion at the scored goal net:
    // If blue scored, puck entered right goal (red goal at x = TABLE_WIDTH)
    // If red scored, puck entered left goal (blue goal at x = 0)
    const goalX = scoringTeam === 'blue' ? TABLE_WIDTH : 0;
    const goalCenter = screenTransformerRef.current.tableToScreen(goalX, TABLE_HEIGHT / 2);
    spawnParticles(goalCenter.x, goalCenter.y, scoringTeam === 'blue' ? '#2563eb' : '#dc2626', 32);

    // Goal banner countdown
    setGamePhase('GOAL');
    setGoalAnnouncement({ team: scoringTeam, countdown: 1.5 });

    // Freeze puck temporarily
    liveStateRef.current.puck = { ...liveStateRef.current.puck, vx: 0, vy: 0 };
    setPuck((p) => ({ ...p, vx: 0, vy: 0 }));

    if (isTargetReached) {
      setTimeout(() => {
        soundManager.playGameOver();
        setGoalAnnouncement(null);
        setGamePhase('TIME_UP');
      }, 1500);
      return;
    }

    // Resume after 1.5s
    setTimeout(() => {
      setGoalAnnouncement(null);
      setGamePhase((curr) => (curr === 'GOAL' ? 'PLAYING' : curr));
      const concedingTeam = scoringTeam === 'blue' ? 'red' : 'blue';
      resetPuckServe(concedingTeam);
    }, 1500);
  }, [matchMode, resetPuckServe]);

  // ----------------------------------------------------
  // Virtual Robot Movement (for mouse/keyboard testing)
  // ----------------------------------------------------
  const handleUpdateVirtualRobot = (team: 'blue' | 'red', x: number, y: number) => {
    const clampedX =
      team === 'blue'
        ? Math.max(ROBOT_RADIUS, Math.min(TABLE_WIDTH / 2 - ROBOT_RADIUS, x))
        : Math.max(TABLE_WIDTH / 2 + ROBOT_RADIUS, Math.min(TABLE_WIDTH - ROBOT_RADIUS, x));
    const clampedY = Math.max(ROBOT_RADIUS, Math.min(TABLE_HEIGHT - ROBOT_RADIUS, y));

    if (team === 'blue') {
      const prev = liveStateRef.current.blueRobot;
      const vx = (clampedX - prev.tableX) * 15;
      const vy = (clampedY - prev.tableY) * 15;
      const screenPt = screenTransformerRef.current.tableToScreen(clampedX, clampedY);
      const updated: RobotState = {
        ...prev,
        tableX: clampedX,
        tableY: clampedY,
        screenX: screenPt.x,
        screenY: screenPt.y,
        vx,
        vy,
        detected: true,
        confidence: 1.0,
        lastSeenTime: Date.now(),
      };
      liveStateRef.current.blueRobot = updated;
      setBlueRobot(updated);
    } else {
      const prev = liveStateRef.current.redRobot;
      const vx = (clampedX - prev.tableX) * 15;
      const vy = (clampedY - prev.tableY) * 15;
      const screenPt = screenTransformerRef.current.tableToScreen(clampedX, clampedY);
      const updated: RobotState = {
        ...prev,
        tableX: clampedX,
        tableY: clampedY,
        screenX: screenPt.x,
        screenY: screenPt.y,
        vx,
        vy,
        detected: true,
        confidence: 1.0,
        lastSeenTime: Date.now(),
      };
      liveStateRef.current.redRobot = updated;
      setRedRobot(updated);
    }
  };

  // ----------------------------------------------------
  // Eyedropper Color Picker Click for Magenta
  // ----------------------------------------------------
  // ----------------------------------------------------
  // Eyedropper Color Picker Click for Magenta (Table Canvas or Camera PIP)
  // ----------------------------------------------------
  const handleSampleAtPixel = (px: number, py: number) => {
    if (!processingCanvasRef.current) return;
    const pCanvas = processingCanvasRef.current;
    const pCtx = pCanvas.getContext('2d');
    if (!pCtx) return;

    const imgData = pCtx.getImageData(0, 0, pCanvas.width, pCanvas.height);
    const sampled = sampleColorAtPoint(imgData, px, py);
    if (sampled) {
      const newFilter = createFilterFromSample(sampled);
      setColorSettings((prev) => ({
        ...prev,
        magenta: newFilter,
        customSample: { r: sampled.r, g: sampled.g, b: sampled.b, hex: sampled.hex },
      }));
    }
    setIsPickingColor(false);
  };

  const handleCanvasClickForColorPick = (normX: number, normY: number) => {
    if (!isPickingColor || !processingCanvasRef.current) return;
    const pCanvas = processingCanvasRef.current;
    // Map screen/table point into camera coordinate if needed
    const tablePt = screenTransformerRef.current.screenToTable(
      normX * containerSize.width,
      normY * containerSize.height
    );
    const camPt = cameraTransformerRef.current.tableToScreen(tablePt.x, tablePt.y);
    handleSampleAtPixel(camPt.x, camPt.y);
  };

  const handlePipClickForColorPick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPickingColor || !processingCanvasRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const pCanvas = processingCanvasRef.current;
    const px = normX * pCanvas.width;
    const py = normY * pCanvas.height;
    handleSampleAtPixel(px, py);
  };

  // ----------------------------------------------------
  // Computer Vision (Magenta 2-Block Tracking) & Physics Loop
  // ----------------------------------------------------
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    if (!processingCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      processingCanvasRef.current = canvas;
    }

    const loop = (currentTime: number) => {
      const dt = Math.min(0.04, Math.max(0.001, (currentTime - lastTime) / 1000));
      lastTime = currentTime;

      const pCanvas = processingCanvasRef.current;
      const video = videoRef.current;
      const screenTf = screenTransformerRef.current;
      const cameraTf = cameraTransformerRef.current;

      const curGamePhase = gamePhaseRef.current;
      const curVirtualMode = isVirtualModeRef.current;
      const curCameraCorners = cameraCornersRef.current;
      const curColorSettings = colorSettingsRef.current;
      const curGoalSize = goalSizeRef.current;

      // 1. Computer Vision Frame Processing (Two Magenta Blocks Tracking)
      // Processed at native webcam frame rate (~30fps), while physics simulation remains at full display rate (60fps+)
      const isVisionTick = currentTime - lastVisionTimeRef.current >= 28;
      if (isVisionTick && video && cameraActive && video.readyState >= 2 && pCanvas) {
        lastVisionTimeRef.current = currentTime;
        const pCtx = pCanvas.getContext('2d', { willReadFrequently: true });
        if (pCtx) {
          pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
          if (isCameraMirroredRef.current) {
            pCtx.save();
            pCtx.translate(pCanvas.width, 0);
            pCtx.scale(-1, 1);
            pCtx.drawImage(video, 0, 0, pCanvas.width, pCanvas.height);
            pCtx.restore();
          } else {
            pCtx.drawImage(video, 0, 0, pCanvas.width, pCanvas.height);
          }
          const imageData = pCtx.getImageData(0, 0, pCanvas.width, pCanvas.height);

          // Prepare debug mask if Color Tuner is open
          let debugMaskData: ImageData | null = null;
          const debugCanvas = debugCanvasRef.current;
          let debugCtx: CanvasRenderingContext2D | null = null;
          if (isColorTunerOpenRef.current && debugCanvas) {
            debugCtx = debugCanvas.getContext('2d');
            if (debugCtx) {
              debugMaskData = debugCtx.createImageData(debugCanvas.width, debugCanvas.height);
            }
          }

          // Camera quad in processing canvas coordinates:
          const cameraQuadPixels: FourCorners = [
            { x: curCameraCorners[0].x * pCanvas.width, y: curCameraCorners[0].y * pCanvas.height },
            { x: curCameraCorners[1].x * pCanvas.width, y: curCameraCorners[1].y * pCanvas.height },
            { x: curCameraCorners[2].x * pCanvas.width, y: curCameraCorners[2].y * pCanvas.height },
            { x: curCameraCorners[3].x * pCanvas.width, y: curCameraCorners[3].y * pCanvas.height },
          ];

          // Project last known robot positions to camera coordinates for continuous tracking
          const curBlue = liveStateRef.current.blueRobot;
          const curRed = liveStateRef.current.redRobot;

          const lastBlueCam = curBlue.detected
            ? cameraTf.tableToScreen(curBlue.tableX, curBlue.tableY)
            : null;
          const lastRedCam = curRed.detected
            ? cameraTf.tableToScreen(curRed.tableX, curRed.tableY)
            : null;

          // Detect TWO Magenta Blocks using selected Vision Engine
          const { blueBlob, redBlob } = detectTwoMagentaBlobs(
            imageData,
            curColorSettings,
            curColorSettings.minBlobSize,
            curColorSettings.maxBlobSize,
            cameraQuadPixels,
            debugMaskData,
            lastBlueCam,
            lastRedCam
          );

          if (debugCtx && debugMaskData) {
            debugCtx.putImageData(debugMaskData, 0, 0);
          }

          // Helper function for ultra-responsive, zero-lag yet jitter-free robot tracking
          const updateTrackedRobot = (
            prev: RobotState,
            rawBlob: DetectedBlob | null
          ): RobotState => {
            if (rawBlob) {
              const tablePos = cameraTf.screenToTable(rawBlob.x, rawBlob.y);
              // Constrain strictly within logical table boundaries
              const clampedX = Math.max(ROBOT_RADIUS, Math.min(TABLE_WIDTH - ROBOT_RADIUS, tablePos.x));
              const clampedY = Math.max(ROBOT_RADIUS, Math.min(TABLE_HEIGHT - ROBOT_RADIUS, tablePos.y));

              // Jump Gating: clamp maximum single-frame displacement (~4500 px/s physical wrist flick)
              const jumpDist = Math.hypot(clampedX - prev.tableX, clampedY - prev.tableY);
              const maxStep = 180; // Table coordinate units per frame
              let targetX = clampedX;
              let targetY = clampedY;
              if (jumpDist > maxStep) {
                const ratio = maxStep / jumpDist;
                targetX = prev.tableX + (clampedX - prev.tableX) * ratio;
                targetY = prev.tableY + (clampedY - prev.tableY) * ratio;
              }

              // Dynamic Adaptive Alpha (1-Euro filter concept):
              // When holding still: alpha = 0.42 filters out camera sensor noise
              // When moving fast: alpha = 0.92 sticks directly to user's hand with ZERO LAG
              const moveRatio = Math.min(1.0, Math.max(0, (jumpDist - 3) / 16));
              const alpha = 0.42 + moveRatio * 0.50;

              const smoothX = prev.tableX * (1 - alpha) + targetX * alpha;
              const smoothY = prev.tableY * (1 - alpha) + targetY * alpha;

              const timeStep = Math.max(0.015, dt);
              const rawVx = (smoothX - prev.tableX) / timeStep;
              const rawVy = (smoothY - prev.tableY) / timeStep;
              const speed = Math.hypot(rawVx, rawVy);
              const maxSpeed = 1400;
              const vx = speed > maxSpeed ? (rawVx / speed) * maxSpeed : rawVx;
              const vy = speed > maxSpeed ? (rawVy / speed) * maxSpeed : rawVy;

              const curScreen = screenTf.tableToScreen(smoothX, smoothY);

              return {
                ...prev,
                tableX: smoothX,
                tableY: smoothY,
                screenX: curScreen.x,
                screenY: curScreen.y,
                vx,
                vy,
                detected: true,
                confidence: rawBlob.confidence,
                lastSeenTime: currentTime,
              };
            } else {
              // Smooth hold when tracking temporarily drops
              const timeSinceLast = currentTime - prev.lastSeenTime;
              const isRecent = timeSinceLast < 600;
              return {
                ...prev,
                detected: isRecent,
                confidence: isRecent ? prev.confidence * 0.95 : 0,
                vx: prev.vx * 0.4,
                vy: prev.vy * 0.4,
              };
            }
          };

          // Update Blue Robot tracking (Player 1)
          if (!curVirtualMode) {
            liveStateRef.current.blueRobot = updateTrackedRobot(liveStateRef.current.blueRobot, blueBlob);
          }

          // Update Red Robot tracking (Player 2)
          if (!curVirtualMode) {
            liveStateRef.current.redRobot = updateTrackedRobot(liveStateRef.current.redRobot, redBlob);
          }

          // Throttled sync to React state (~15fps) for UI indicators (Settings / PIP monitor / Console mirror)
          if (currentTime - lastStateSyncTimeRef.current >= 66) {
            lastStateSyncTimeRef.current = currentTime;
            setBlueRobot({ ...liveStateRef.current.blueRobot });
            setRedRobot({ ...liveStateRef.current.redRobot });

            try {
              const live = liveStateRef.current;
              const livePosPayload = {
                type: 'UPDATE',
                puck: { x: live.puck.x, y: live.puck.y, vx: live.puck.vx, vy: live.puck.vy },
                blueRobot: { tableX: live.blueRobot.tableX, tableY: live.blueRobot.tableY, detected: live.blueRobot.detected, confidence: live.blueRobot.confidence },
                redRobot: { tableX: live.redRobot.tableX, tableY: live.redRobot.tableY, detected: live.redRobot.detected, confidence: live.redRobot.confidence },
              };
              broadcastRef.current?.postMessage(livePosPayload);
              window.electronAPI?.sendSyncState(livePosPayload as any);
            } catch {}
          }
        }
      }

      // If Virtual Mode is ON, simple AI opponent for Red Robot
      if (curVirtualMode && curGamePhase === 'PLAYING') {
        const curRed = liveStateRef.current.redRobot;
        const targetY = liveStateRef.current.puck.y;
        const targetX = Math.max(TABLE_WIDTH * 0.65, Math.min(TABLE_WIDTH - 90, liveStateRef.current.puck.x + 110));
        const speed = 330;
        const dy = targetY - curRed.tableY;
        const dx = targetX - curRed.tableX;
        const stepY = Math.sign(dy) * Math.min(Math.abs(dy), speed * dt);
        const stepX = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt * 0.5);

        const nextX = curRed.tableX + stepX;
        const nextY = Math.max(ROBOT_RADIUS, Math.min(TABLE_HEIGHT - ROBOT_RADIUS, curRed.tableY + stepY));
        const screenPt = screenTf.tableToScreen(nextX, nextY);

        liveStateRef.current.redRobot = {
          ...curRed,
          tableX: nextX,
          tableY: nextY,
          screenX: screenPt.x,
          screenY: screenPt.y,
          vx: stepX / dt,
          vy: stepY / dt,
          detected: true,
          confidence: 1.0,
        };
      }

      // 2. Continuous 60fps Physics Simulation
      if (curGamePhase === 'PLAYING') {
        const { puck: nextPuck, events } = stepPuckPhysics(
          liveStateRef.current.puck,
          liveStateRef.current.blueRobot,
          liveStateRef.current.redRobot,
          curGoalSize,
          dt
        );
        liveStateRef.current.puck = nextPuck;

        // Process all collision feedback events
        for (const ev of events) {
          if (ev.type === 'GOAL' && ev.team) {
            handleGoalScored(ev.team);
          } else if (ev.type === 'ROBOT') {
            if (ev.speed > 550) {
              soundManager.playHighSpeedSmash();
            } else {
              soundManager.playRobotHit(Math.min(1.0, ev.speed / 500));
            }
            const screenHit = screenTf.tableToScreen(ev.x, ev.y);
            spawnParticles(
              screenHit.x,
              screenHit.y,
              ev.team === 'blue' ? '#2563eb' : '#dc2626',
              ev.speed > 550 ? 20 : 12
            );
            if (ev.team) {
              setStats((s) => ({
                ...s,
                [ev.team === 'blue' ? 'blueHits' : 'redHits']:
                  s[ev.team === 'blue' ? 'blueHits' : 'redHits'] + 1,
                maxPuckSpeed: Math.max(s.maxPuckSpeed, ev.speed),
              }));
            }
          } else if (ev.type === 'POST') {
            soundManager.playGoalPost();
            const screenHit = screenTf.tableToScreen(ev.x, ev.y);
            spawnParticles(screenHit.x, screenHit.y, '#f59e0b', 12);
          } else if (ev.type === 'WALL') {
            soundManager.playWallBounce(Math.min(1.0, ev.speed / 400));
            const screenHit = screenTf.tableToScreen(ev.x, ev.y);
            spawnParticles(screenHit.x, screenHit.y, '#334155', 6);
          }
        }
      }

      // 3. Update Particle Physics
      liveStateRef.current.particles = liveStateRef.current.particles
        .map((p) => ({
          ...p,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          alpha: Math.max(0, 1 - p.life / p.maxLife),
          life: p.life + dt,
        }))
        .filter((p) => p.life < p.maxLife);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [cameraActive, handleGoalScored]);

  return (
    <div className={`relative w-screen h-screen overflow-hidden select-none font-sans ${theme === 'light' ? 'bg-white' : 'bg-black'}`}>
      {/* Hidden Live Video Element for Computer Vision */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />

      {/* [REQ] 매인 경기창에는 모든 UI 넣지 말고 경기장 라인, 골대, 말만 띄워 */}
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden flex items-center justify-center"
      >
        <GameCanvas
          normalizedCorners={screenCorners}
          gamePhase={gamePhase}
          blueRobot={blueRobot}
          redRobot={redRobot}
          puck={puck}
          liveStateRef={liveStateRef}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          goalSize={goalSize}
          theme={theme}
        />
      </div>
    </div>
  );
}
