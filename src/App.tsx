import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FourCorners,
  EightPoints,
  CalibrationCorners,
  toEightPoints,
  DEFAULT_NORMALIZED_8POINTS,
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
  Obstacle,
  ObstacleType,
  BotTargetTeam,
  BotDifficulty,
  GoalLogEntry,
} from './types/hockey';
import { PerspectiveTransformer } from './utils/perspective';
import {
  DEFAULT_COLOR_SETTINGS,
  detectTwoMagentaBlobs,
  sampleColorAtPoint,
  createFilterFromSample,
  DetectedBlob,
} from './utils/vision';
import { detectTwoMagentaBlobsOpenCV, loadOpenCV } from './utils/opencvVision';
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
  // Game & Match States (1MIN, CUSTOM_TIME, TARGET_N)
  const [matchMode, setMatchMode] = useState<MatchMode>('1MIN');
  const [customDuration, setCustomDuration] = useState<number>(180);
  const [targetPoints, setTargetPoints] = useState<number>(5);
  const [gamePhase, setGamePhase] = useState<GamePhase>('READY');
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [score, setScore] = useState<MatchScore>({ blue: 0, red: 0 });
  const [stats, setStats] = useState<MatchStats>({
    blueHits: 0,
    redHits: 0,
    maxPuckSpeed: 0,
    lastScoredTeam: null,
    maxRally: 0,
    currentRally: 0,
    goalHistory: [],
  });
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [isVirtualMode, setIsVirtualMode] = useState(false);
  const [botTeam, setBotTeam] = useState<BotTargetTeam>('NONE');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('NORMAL');
  const [cameraDeviceId, setCameraDeviceId] = useState<string>('');
  const [showCameraPip, setShowCameraPip] = useState(false);
  const [goalAnnouncement, setGoalAnnouncement] = useState<{
    team: 'blue' | 'red';
    countdown: number;
    points?: number;
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
  const [colorSettings, setColorSettings] = useState<ColorSettings>(() => {
    try {
      const saved = localStorage.getItem('airhockey_color_settings');
      if (saved) return { ...DEFAULT_COLOR_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_COLOR_SETTINGS;
  });
  const [isColorTunerOpen, setIsColorTunerOpen] = useState(false);
  const [isPickingColor, setIsPickingColor] = useState(false);

  // [REQ] 8점 보정은 카메라만. 경기장은 4점으로 해! (한 번 저장하면 다시 묻지 않고 자동 복원)
  // 1. screenCorners: 4 corners of the game court on the screen/projector display (Pure Planar Homography)
  // 2. cameraCorners: 8 calibration pins in the live camera video (Wide-angle Distortion Correction)
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
  const [goalSize, setGoalSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('airhockey_goal_size');
      if (saved) return Number(saved) || DEFAULT_GOAL_SIZE;
    } catch {}
    return DEFAULT_GOAL_SIZE;
  });
  const [isCameraMirrored, setIsCameraMirrored] = useState<boolean>(() => {
    try {
      return localStorage.getItem('airhockey_camera_mirrored') === 'true';
    } catch {}
    return false;
  });
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [draggingScreenCorner, setDraggingScreenCorner] = useState<number | null>(null);

  // Restore saved calibration & settings from Electron disk storage on startup so it never resets or asks again
  useEffect(() => {
    if (window.electronAPI?.loadSavedConfig) {
      window.electronAPI
        .loadSavedConfig()
        .then((cfg) => {
          if (!cfg) return;
          if (cfg.screenCorners && Array.isArray(cfg.screenCorners)) {
            const sc: FourCorners =
              cfg.screenCorners.length === 4
                ? cfg.screenCorners
                : [cfg.screenCorners[0], cfg.screenCorners[2], cfg.screenCorners[4], cfg.screenCorners[6]];
            setScreenCorners(sc);
            try {
              localStorage.setItem('airhockey_screen_corners', JSON.stringify(sc));
            } catch {}
          }
          if (cfg.cameraCorners && Array.isArray(cfg.cameraCorners)) {
            const cc = toEightPoints(cfg.cameraCorners);
            setCameraCorners(cc);
            try {
              localStorage.setItem('airhockey_camera_corners', JSON.stringify(cc));
            } catch {}
          }
          if (typeof cfg.goalSize === 'number') {
            setGoalSize(cfg.goalSize);
            try {
              localStorage.setItem('airhockey_goal_size', String(cfg.goalSize));
            } catch {}
          }
          if (typeof cfg.isCameraMirrored === 'boolean') {
            setIsCameraMirrored(cfg.isCameraMirrored);
            try {
              localStorage.setItem('airhockey_camera_mirrored', String(cfg.isCameraMirrored));
            } catch {}
          }
          if (cfg.colorSettings) {
            setColorSettings((prev) => {
              const merged = { ...prev, ...cfg.colorSettings };
              try {
                localStorage.setItem('airhockey_color_settings', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
          if (cfg.theme === 'dark' || cfg.theme === 'light') {
            setTheme(cfg.theme);
            try {
              localStorage.setItem('airhockey_theme', cfg.theme);
            } catch {}
          }
          if (typeof cfg.obstaclesEnabled === 'boolean') {
            setObstaclesEnabled(cfg.obstaclesEnabled);
            try {
              localStorage.setItem('airhockey_obstacles_enabled', String(cfg.obstaclesEnabled));
            } catch {}
          }
          if (typeof cfg.cameraDeviceId === 'string' && cfg.cameraDeviceId) {
            setCameraDeviceId(cfg.cameraDeviceId);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Automatically persist calibration & settings changes to localStorage & Electron userData file
  useEffect(() => {
    try {
      localStorage.setItem('airhockey_screen_corners', JSON.stringify(screenCorners));
      localStorage.setItem('airhockey_camera_corners', JSON.stringify(cameraCorners));
      localStorage.setItem('airhockey_goal_size', String(goalSize));
      localStorage.setItem('airhockey_camera_mirrored', String(isCameraMirrored));
      localStorage.setItem('airhockey_color_settings', JSON.stringify(colorSettings));
      localStorage.setItem('airhockey_theme', theme);
      localStorage.setItem('airhockey_obstacles_enabled', String(obstaclesEnabled));
      window.electronAPI?.saveConfig?.({
        screenCorners,
        cameraCorners,
        goalSize,
        isCameraMirrored,
        colorSettings,
        theme,
        obstaclesEnabled,
        cameraDeviceId,
      });
    } catch {}
  }, [screenCorners, cameraCorners, goalSize, isCameraMirrored, colorSettings, theme, obstaclesEnabled, cameraDeviceId]);

  // Helper to convert normalized [0, 1] points to pixel coordinates
  const getPixelCorners4 = useCallback((corners: FourCorners, w: number, h: number): FourCorners => [
    { x: corners[0].x * w, y: corners[0].y * h },
    { x: corners[1].x * w, y: corners[1].y * h },
    { x: corners[2].x * w, y: corners[2].y * h },
    { x: corners[3].x * w, y: corners[3].y * h },
  ], []);

  const getPixelPoints8 = useCallback((corners: EightPoints, w: number, h: number): EightPoints => {
    return corners.map((p) => ({ x: p.x * w, y: p.y * h })) as unknown as EightPoints;
  }, []);

  // 1. Screen Transformer: maps virtual table coordinates (1200 x 700) to screen display pixels using 4 pure corners
  const screenTransformerRef = useRef<PerspectiveTransformer>(
    new PerspectiveTransformer(getPixelCorners4(DEFAULT_NORMALIZED_CORNERS, 1200, 680))
  );

  // 2. Camera Transformer: maps camera processing frame coordinates (640 x 360) to table coordinates using 8 points
  const cameraTransformerRef = useRef<PerspectiveTransformer>(
    new PerspectiveTransformer(getPixelPoints8(DEFAULT_NORMALIZED_8POINTS, 640, 360))
  );

  // Update screen transformer when screenCorners or containerSize change (Zero seam tearing!)
  useEffect(() => {
    const pixelCorners = getPixelCorners4(screenCorners, containerSize.width, containerSize.height);
    screenTransformerRef.current.updateCorners(pixelCorners);
  }, [screenCorners, containerSize, getPixelCorners4]);

  // Update camera transformer when cameraCorners change (8-point mesh warping)
  useEffect(() => {
    const pixelPoints = getPixelPoints8(cameraCorners, 640, 360);
    cameraTransformerRef.current.updateCorners(pixelPoints);
  }, [cameraCorners, getPixelPoints8]);

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
    allRobots: [initialBlueRobot, initialRedRobot],
    puck: initialPuck,
    particles: [],
    centerSpeaker: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT / 2, radius: CENTER_SPEAKER_RADIUS },
  });

  // Ring buffer of recent puck positions (~65 frames) for instant Goal Replay visualization
  const puckHistoryRef = useRef<Array<{ x: number; y: number }>>([]);

  // Keep references to frequently read configuration values to prevent useEffect rebuilds
  const gamePhaseRef = useRef(gamePhase);
  gamePhaseRef.current = gamePhase;
  const matchModeRef = useRef(matchMode);
  matchModeRef.current = matchMode;
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;
  const isVirtualModeRef = useRef(isVirtualMode);
  isVirtualModeRef.current = isVirtualMode;
  const botTeamRef = useRef(botTeam);
  botTeamRef.current = botTeam;
  const botDifficultyRef = useRef(botDifficulty);
  botDifficultyRef.current = botDifficulty;
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

  const cvReadyRef = useRef<boolean>(false);

  // Preload OpenCV (opencv.js WASM) in the background
  useEffect(() => {
    loadOpenCV().then((cv) => {
      if (cv) cvReadyRef.current = true;
    });
  }, []);

  const sendFullSyncState = useCallback(() => {
    const live = liveStateRef.current;
    const payload = {
      type: 'SYNC_STATE' as const,
      score,
      timeLeft,
      gamePhase,
      matchMode,
      customDuration,
      targetPoints,
      goalSize,
      screenCorners,
      cameraCorners,
      isCameraMirrored,
      theme,
      stats,
      goalAnnouncement,
      lowLightMode: !!colorSettings.lowLightMode,
      colorSettings,
      allRobots: live.allRobots || [live.blueRobot, live.redRobot],
      centerSpeaker: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT / 2, radius: CENTER_SPEAKER_RADIUS },
      visionDiagnostics: {
        engine: colorSettings.visionEngine || 'OPENCV',
        isOpenCVActive: cvReadyRef.current,
        detectedBlobsCount: (live.allRobots && live.allRobots.length) || ((live.blueRobot.detected ? 1 : 0) + (live.redRobot.detected ? 1 : 0)),
        blueConfidence: live.blueRobot.confidence,
        redConfidence: live.redRobot.confidence,
      },
      puck: {
        x: live.puck.x,
        y: live.puck.y,
        vx: live.puck.vx,
        vy: live.puck.vy,
        spin: live.puck.spin,
        superCharged: live.puck.superCharged,
        rallyCount: live.puck.rallyCount,
      },
      blueRobot: {
        tableX: live.blueRobot.tableX,
        tableY: live.blueRobot.tableY,
        detected: live.blueRobot.detected,
        confidence: live.blueRobot.confidence,
      },
      redRobot: {
        tableX: live.redRobot.tableX,
        tableY: live.redRobot.tableY,
        detected: live.redRobot.detected,
        confidence: live.redRobot.confidence,
      },
    };
    try {
      window.electronAPI?.sendSyncState(payload);
      broadcastRef.current?.postMessage(payload);
      localStorage.setItem('airhockey_sync', JSON.stringify(payload));
    } catch {}
  }, [score, timeLeft, gamePhase, matchMode, customDuration, targetPoints, goalSize, screenCorners, cameraCorners, isCameraMirrored, theme, stats, goalAnnouncement, colorSettings]);

  // [REQ 1] 매인화면과 서브화면 점수/상태 실시간 완전 동기화: 상태 변경 시 즉시 전파
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
  // Camera Setup & Streaming (Supports Device ID Selection)
  // ----------------------------------------------------
  const startCamera = useCallback(async (facing: 'environment' | 'user', deviceId?: string) => {
    try {
      setCameraError(null);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('이 브라우저는 웹캠 접근을 지원하지 않습니다.');
      }

      const videoConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: facing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: unknown) {
      console.warn('Camera notice:', err);
      if (facing === 'environment' && !deviceId) {
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
      setCameraError('카메라를 찾을 수 없거나 권한이 필요합니다. 콘솔에서 [AI 봇 모드]를 켜서 바로 플레이할 수 있습니다.');
    }
  }, []);

  useEffect(() => {
    startCamera(cameraFacing, cameraDeviceId || undefined);
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraFacing, cameraDeviceId, startCamera]);

  const handleToggleCameraFacing = () => {
    const next = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(next);
  };

  // ----------------------------------------------------
  // Match Timer (Countdown)
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
  // Clean Projector-Safe Impact Shockwave Ring
  // ----------------------------------------------------
  const addImpactRipple = useCallback(
    (tableX: number, tableY: number, color: string, maxRadius = 46, duration = 320, label?: string) => {
      const ripples = liveStateRef.current.ripples || [];
      const now = Date.now();
      const filtered = ripples.filter((r) => now - r.createdAt < r.duration).slice(-10);
      filtered.push({
        id: `rip-${now}-${Math.random().toString(36).slice(2, 6)}`,
        x: tableX,
        y: tableY,
        color,
        maxRadius,
        createdAt: now,
        duration,
        label,
      });
      liveStateRef.current.ripples = filtered;
    },
    []
  );

  const spawnParticles = (_screenX: number, _screenY: number, _color: string, _count = 16) => {
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
    const speed = 420;

    const nextPuck: PuckState = {
      x: TABLE_WIDTH / 2,
      y: TABLE_HEIGHT / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: 0,
      angle: 0,
      superCharged: false,
      rallyCount: 0,
      radius: PUCK_RADIUS,
      trail: [],
      lastHitTeam: null,
    };
    liveStateRef.current.puck = nextPuck;
    puckHistoryRef.current = [{ x: TABLE_WIDTH / 2, y: TABLE_HEIGHT / 2 }];
    setPuck(nextPuck);
  }, []);

  // ----------------------------------------------------
  // Start / Pause / Reset Match Handlers
  // ----------------------------------------------------
  const handleStartGame = () => {
    soundManager.playWhistle();
    if (gamePhase === 'TIME_UP' || timeLeft === 0) {
      const duration = matchMode === '1MIN' ? 60 : matchMode === 'CUSTOM_TIME' ? customDuration : 600;
      setTimeLeft(duration);
      setScore({ blue: 0, red: 0 });
      setStats({
        blueHits: 0,
        redHits: 0,
        maxPuckSpeed: 0,
        lastScoredTeam: null,
        maxRally: 0,
        currentRally: 0,
        goalHistory: [],
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
    const duration = matchMode === '1MIN' ? 60 : matchMode === 'CUSTOM_TIME' ? customDuration : 600;
    setTimeLeft(duration);
    setScore({ blue: 0, red: 0 });
    setStats({
      blueHits: 0,
      redHits: 0,
      maxPuckSpeed: 0,
      lastScoredTeam: null,
      maxRally: 0,
      currentRally: 0,
      goalHistory: [],
    });
    setGamePhase('READY');
    setGoalAnnouncement(null);
    resetPuckServe();
  };

  // Action Deduplication cache to prevent 3x duplicated triggers from IPC + BroadcastChannel + LocalStorage
  const processedActionIdsRef = useRef<Map<string, number>>(new Map());

  // Listen for actions from Admin Console / Scoreboard
  useEffect(() => {
    const handleAction = (msg: any) => {
      if (!msg || msg.type !== 'GAME_ACTION') return;

      const now = Date.now();
      const actionKey =
        msg.actionId || `${msg.action}-${JSON.stringify(msg.seconds || msg.mode || msg.theme || msg.botTeam || msg.botDifficulty || '')}`;
      const lastTime = processedActionIdsRef.current.get(actionKey);
      if (lastTime && now - lastTime < 350) {
        return;
      }
      processedActionIdsRef.current.set(actionKey, now);

      if (processedActionIdsRef.current.size > 50) {
        for (const [k, t] of processedActionIdsRef.current.entries()) {
          if (now - t > 5000) processedActionIdsRef.current.delete(k);
        }
      }

      if (msg.action === 'START') {
        handleStartGame();
      } else if (msg.action === 'PAUSE') {
        handlePauseGame();
      } else if (msg.action === 'RESET' || msg.action === 'PREPARE') {
        const currentMode = matchModeRef.current || '1MIN';
        const initTime = currentMode === '1MIN' ? 60 : currentMode === 'CUSTOM_TIME' ? customDuration : 600;
        setTimeLeft(initTime);
        setScore({ blue: 0, red: 0 });
        setStats({
          blueHits: 0,
          redHits: 0,
          maxPuckSpeed: 0,
          lastScoredTeam: null,
          maxRally: 0,
          currentRally: 0,
          goalHistory: [],
        });
        setGamePhase('READY');
        setGoalAnnouncement(null);
        resetPuckServe();
      } else if (msg.action === 'ADD_TIME') {
        setTimeLeft((prev) => Math.max(1, prev + (msg.seconds || 30)));
      } else if (msg.action === 'SET_SCORE') {
        if (msg.score) {
          scoreRef.current = msg.score;
          setScore(msg.score);
          try {
            const syncPayload = {
              type: 'SYNC_STATE' as const,
              score: msg.score,
              timeLeft: timeLeftRef.current,
              gamePhase: gamePhaseRef.current,
              matchMode: matchModeRef.current,
            };
            window.electronAPI?.sendSyncState(syncPayload as any);
            broadcastRef.current?.postMessage(syncPayload);
          } catch {}
        }
      } else if (msg.action === 'CHANGE_MODE') {
        const modeKey = msg.mode as MatchMode;
        if (modeKey) {
          setMatchMode(modeKey);
          let duration = 60;
          if (modeKey === '1MIN') {
            duration = 60;
          } else if (modeKey === 'CUSTOM_TIME') {
            const customDur = msg.customDuration || customDuration || 180;
            setCustomDuration(customDur);
            duration = customDur;
          } else if (modeKey === 'TARGET_N') {
            const target = msg.targetPoints || targetPoints || 5;
            setTargetPoints(target);
            duration = 600;
          }
          setTimeLeft(duration);
          setScore({ blue: 0, red: 0 });
          setGamePhase('READY');
          resetPuckServe();
        }
      } else if (msg.action === 'SET_THEME') {
        if (msg.theme === 'dark' || msg.theme === 'light') {
          setTheme(msg.theme);
        }
      } else if (msg.action === 'START_CALIBRATE_SCREEN') {
        setGamePhase('CALIBRATION_SCREEN');
      } else if (msg.action === 'START_CALIBRATE_CAMERA') {
        setGamePhase('CALIBRATION_CAMERA');
      } else if (msg.action === 'CONFIRM_CALIBRATION') {
        setGamePhase('READY');
      } else if (msg.action === 'UPDATE_SCREEN_CORNERS') {
        if (msg.screenCorners) {
          const four: FourCorners =
            msg.screenCorners.length === 4
              ? msg.screenCorners
              : [msg.screenCorners[0], msg.screenCorners[2], msg.screenCorners[4], msg.screenCorners[6]];
          setScreenCorners(four);
          try {
            localStorage.setItem('airhockey_screen_corners', JSON.stringify(four));
          } catch {}
        }
      } else if (msg.action === 'UPDATE_CAMERA_CORNERS') {
        if (msg.cameraCorners) {
          const eight = toEightPoints(msg.cameraCorners);
          setCameraCorners(eight);
          try {
            localStorage.setItem('airhockey_camera_corners', JSON.stringify(eight));
          } catch {}
        }
      } else if (msg.action === 'SET_LOW_LIGHT_MODE') {
        setColorSettings((prev) => ({ ...prev, lowLightMode: !!msg.lowLightMode }));
      } else if (msg.action === 'UPDATE_COLOR_SETTINGS') {
        if (msg.colorSettings) {
          setColorSettings((prev) => ({ ...prev, ...msg.colorSettings }));
        }
      } else if (msg.action === 'SAMPLE_COLOR') {
        if (msg.customSample) {
          setColorSettings((prev) => ({ ...prev, customSample: msg.customSample }));
        }
      } else if (msg.action === 'UPDATE_GOAL_SIZE') {
        if (typeof msg.goalSize === 'number') {
          setGoalSize(msg.goalSize);
          try {
            localStorage.setItem('airhockey_goal_size', String(msg.goalSize));
          } catch {}
        }
      } else if (msg.action === 'TOGGLE_MIRROR') {
        setIsCameraMirrored((prev) => !prev);
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
  }, [resetPuckServe, addImpactRipple, customDuration, targetPoints]);

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
  // Goal Handling (Supports Super Goal x2 & Goal Replay Trajectory)
  // ----------------------------------------------------
  const handleGoalScored = useCallback(
    (scoringTeam: 'blue' | 'red', goalSpeed = 500) => {
      soundManager.playGoal();
      const isSuperGoal = Boolean(liveStateRef.current.puck.superCharged);
      const pointsAwarded = isSuperGoal ? 2 : 1;

      let isTargetReached = false;
      let nextScoreObj: MatchScore = { blue: 0, red: 0 };
      setScore((prev) => {
        const nextScore = {
          ...prev,
          [scoringTeam]: prev[scoringTeam] + pointsAwarded,
        };
        nextScoreObj = nextScore;
        scoreRef.current = nextScore;
        if (matchModeRef.current === 'TARGET_N' && nextScore[scoringTeam] >= (targetPoints || 5)) {
          isTargetReached = true;
        }
        return nextScore;
      });

      const replaySnapshot = [...puckHistoryRef.current];
      const goalEntry: GoalLogEntry = {
        id: `goal-${Date.now()}`,
        team: scoringTeam,
        points: pointsAwarded,
        speed: Math.round(goalSpeed),
        timeRemaining: timeLeftRef.current,
        timestamp: Date.now(),
        isSuperGoal,
        replayPath: replaySnapshot,
      };

      setStats((prev) => ({
        ...prev,
        lastScoredTeam: scoringTeam,
        currentRally: 0,
        goalHistory: [goalEntry, ...(prev.goalHistory || [])].slice(0, 12),
      }));

      try {
        const goalSyncPayload = {
          type: 'SYNC_STATE' as const,
          score: nextScoreObj,
          timeLeft: timeLeftRef.current,
          gamePhase: 'GOAL' as GamePhase,
          matchMode: matchModeRef.current,
          goalAnnouncement: { team: scoringTeam, countdown: 1.5, points: pointsAwarded },
        };
        window.electronAPI?.sendSyncState(goalSyncPayload as any);
        broadcastRef.current?.postMessage(goalSyncPayload);
      } catch {}

      const goalX = scoringTeam === 'blue' ? TABLE_WIDTH : 0;
      addImpactRipple(
        goalX,
        TABLE_HEIGHT / 2,
        isSuperGoal ? '#f59e0b' : scoringTeam === 'blue' ? '#22d3ee' : '#facc15',
        150,
        900,
        isSuperGoal ? 'SUPER GOAL +2!' : 'GOAL!'
      );

      setGamePhase('GOAL');
      setGoalAnnouncement({ team: scoringTeam, countdown: 1.5, points: pointsAwarded });

      liveStateRef.current.puck = { ...liveStateRef.current.puck, vx: 0, vy: 0, spin: 0 };
      setPuck((p) => ({ ...p, vx: 0, vy: 0, spin: 0 }));

      if (isTargetReached) {
        setTimeout(() => {
          soundManager.playGameOver();
          setGoalAnnouncement(null);
          setGamePhase('TIME_UP');
        }, 1500);
        return;
      }

      setTimeout(() => {
        setGoalAnnouncement(null);
        setGamePhase((curr) => (curr === 'GOAL' ? 'PLAYING' : curr));
        const concedingTeam = scoringTeam === 'blue' ? 'red' : 'blue';
        resetPuckServe(concedingTeam);
      }, 1500);
    },
    [resetPuckServe, addImpactRipple, targetPoints]
  );

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

    // Predictive AI Striker controller (말만 양 옆으로 이동하는 1축 수평 레일 방식 완벽 대응!)
    const stepAiRobot = (
      robot: RobotState,
      team: 'blue' | 'red',
      puckState: PuckState,
      difficulty: BotDifficulty,
      dt: number,
      screenTf: PerspectiveTransformer
    ): RobotState => {
      const speedMap: Record<BotDifficulty, number> = {
        EASY: 280,
        NORMAL: 450,
        HARD: 660,
        PRO: 920,
      };
      const maxSpeed = speedMap[difficulty] || 450;
      const isLeft = team === 'blue';
      // 말은 골대 앞 고정 라인에서 양 옆(Y축)으로만 이동!
      const fixedX = isLeft ? 135 : TABLE_WIDTH - 135;

      let targetY = TABLE_HEIGHT / 2;
      const puckComingTowardAi = isLeft ? puckState.vx < -10 : puckState.vx > 10;
      const puckInAiHalf = isLeft ? puckState.x < TABLE_WIDTH * 0.55 : puckState.x > TABLE_WIDTH * 0.45;

      if (puckComingTowardAi || puckInAiHalf) {
        const distToHomeX = Math.abs(fixedX - puckState.x);
        const timeToReach = Math.min(1.3, distToHomeX / Math.max(180, Math.abs(puckState.vx)));
        let predictedY = puckState.y + puckState.vy * timeToReach;

        // Reflect predicted Y off top/bottom rails for HARD / PRO difficulty
        if (difficulty === 'HARD' || difficulty === 'PRO') {
          let bounces = 0;
          while ((predictedY < PUCK_RADIUS || predictedY > TABLE_HEIGHT - PUCK_RADIUS) && bounces < 4) {
            bounces++;
            if (predictedY < PUCK_RADIUS) predictedY = 2 * PUCK_RADIUS - predictedY;
            if (predictedY > TABLE_HEIGHT - PUCK_RADIUS)
              predictedY = 2 * (TABLE_HEIGHT - PUCK_RADIUS) - predictedY;
          }
        }

        // 약간의 오프셋 조준으로 대각선 뱅크샷 유도
        const angleAimOffset =
          difficulty === 'PRO' || difficulty === 'HARD'
            ? (predictedY > TABLE_HEIGHT / 2 ? -14 : 14)
            : 0;
        targetY = predictedY + angleAimOffset;
      } else {
        // Patrol near center of goal mouth
        targetY = TABLE_HEIGHT / 2 + (puckState.y - TABLE_HEIGHT / 2) * 0.35;
      }

      targetY = Math.max(ROBOT_RADIUS + 10, Math.min(TABLE_HEIGHT - ROBOT_RADIUS - 10, targetY));

      const dy = targetY - robot.tableY;
      const maxStep = maxSpeed * dt;

      let nextY = robot.tableY;
      if (Math.abs(dy) > 1) {
        const stepY = Math.sign(dy) * Math.min(Math.abs(dy), maxStep);
        nextY += stepY;
      }

      const vy = (nextY - robot.tableY) / Math.max(0.008, dt);
      const screenPt = screenTf.tableToScreen(fixedX, nextY);

      return {
        ...robot,
        tableX: fixedX,
        tableY: nextY,
        screenX: screenPt.x,
        screenY: screenPt.y,
        vx: 0,
        vy,
        detected: true,
        confidence: 1.0,
        lastSeenTime: performance.now(),
      };
    };

    const loop = (currentTime: number) => {
      const dt = Math.min(0.04, Math.max(0.001, (currentTime - lastTime) / 1000));
      lastTime = currentTime;

      const pCanvas = processingCanvasRef.current;
      const video = videoRef.current;
      const screenTf = screenTransformerRef.current;
      const cameraTf = cameraTransformerRef.current;

      const curGamePhase = gamePhaseRef.current;
      const curVirtualMode = isVirtualModeRef.current;
      const curBotTeam = botTeamRef.current;
      const curBotDifficulty = botDifficultyRef.current;
      const curCameraCorners = cameraCornersRef.current;
      const curColorSettings = colorSettingsRef.current;
      const curGoalSize = goalSizeRef.current;

      const isBlueBot = curBotTeam === 'BLUE' || curBotTeam === 'BOTH';
      const isRedBot = curVirtualMode || curBotTeam === 'RED' || curBotTeam === 'BOTH';

      // 1. Computer Vision Frame Processing (Two Magenta Blocks Tracking)
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

          let debugMaskData: ImageData | null = null;
          const debugCanvas = debugCanvasRef.current;
          let debugCtx: CanvasRenderingContext2D | null = null;
          if (isColorTunerOpenRef.current && debugCanvas) {
            debugCtx = debugCanvas.getContext('2d');
            if (debugCtx) {
              debugMaskData = debugCtx.createImageData(debugCanvas.width, debugCanvas.height);
            }
          }

          const cameraCourtPixels = curCameraCorners.map((p) => ({
            x: p.x * pCanvas.width,
            y: p.y * pCanvas.height,
          }));

          const curBlue = liveStateRef.current.blueRobot;
          const curRed = liveStateRef.current.redRobot;

          const lastBlueCam = curBlue.detected ? cameraTf.tableToScreen(curBlue.tableX, curBlue.tableY) : null;
          const lastRedCam = curRed.detected ? cameraTf.tableToScreen(curRed.tableX, curRed.tableY) : null;

          const cvResult =
            (curColorSettings.visionEngine || 'OPENCV') === 'OPENCV'
              ? detectTwoMagentaBlobsOpenCV(
                  imageData,
                  curColorSettings,
                  cameraCourtPixels,
                  debugMaskData,
                  lastBlueCam,
                  lastRedCam
                )
              : null;
          const { blueBlob, redBlob } =
            cvResult ??
            detectTwoMagentaBlobs(
              imageData,
              (curColorSettings.visionEngine || 'OPENCV') === 'OPENCV'
                ? { ...curColorSettings, visionEngine: 'CHROMATIC' }
                : curColorSettings,
              curColorSettings.minBlobSize,
              curColorSettings.maxBlobSize,
              cameraCourtPixels,
              debugMaskData,
              lastBlueCam,
              lastRedCam
            );

          if (debugCtx && debugMaskData) {
            debugCtx.putImageData(debugMaskData, 0, 0);
          }

          const updateTrackedRobot = (prev: RobotState, rawBlob: DetectedBlob | null): RobotState => {
            if (rawBlob) {
              const tablePos = cameraTf.screenToTable(rawBlob.x, rawBlob.y);
              const clampedX = Math.max(ROBOT_RADIUS, Math.min(TABLE_WIDTH - ROBOT_RADIUS, tablePos.x));
              const clampedY = Math.max(ROBOT_RADIUS, Math.min(TABLE_HEIGHT - ROBOT_RADIUS, tablePos.y));

              const jumpDist = Math.hypot(clampedX - prev.tableX, clampedY - prev.tableY);
              const maxStep = 180;
              let targetX = clampedX;
              let targetY = clampedY;
              if (jumpDist > maxStep) {
                const ratio = maxStep / jumpDist;
                targetX = prev.tableX + (clampedX - prev.tableX) * ratio;
                targetY = prev.tableY + (clampedY - prev.tableY) * ratio;
              }

              const moveRatio = Math.min(1.0, Math.max(0, (jumpDist - 3) / 16));
              const alpha = 0.42 + moveRatio * 0.5;

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

          if (!curVirtualMode && !isBlueBot) {
            liveStateRef.current.blueRobot = updateTrackedRobot(liveStateRef.current.blueRobot, blueBlob);
          }

          if (!curVirtualMode && !isRedBot) {
            liveStateRef.current.redRobot = updateTrackedRobot(liveStateRef.current.redRobot, redBlob);
          }

          // Map remaining detected magenta blobs (2..10 dynamic tracking) as obstacle robots
          const otherBlobs = (allBlobs || []).filter(
            (b) => b !== blueBlob && b !== redBlob
          );
          const obstacleRobots: RobotState[] = otherBlobs.map((blob, idx) => {
            const tablePos = cameraTf.screenToTable(blob.x, blob.y);
            const clampedX = Math.max(ROBOT_RADIUS, Math.min(TABLE_WIDTH - ROBOT_RADIUS, tablePos.x));
            const clampedY = Math.max(ROBOT_RADIUS, Math.min(TABLE_HEIGHT - ROBOT_RADIUS, tablePos.y));
            const curScreen = screenTf.tableToScreen(clampedX, clampedY);
            return {
              id: `obs-robot-${idx}`,
              team: 'obstacle',
              tableX: clampedX,
              tableY: clampedY,
              screenX: curScreen.x,
              screenY: curScreen.y,
              vx: 0,
              vy: 0,
              detected: true,
              confidence: blob.confidence,
              lastSeenTime: currentTime,
            };
          });

          liveStateRef.current.allRobots = [
            liveStateRef.current.blueRobot,
            liveStateRef.current.redRobot,
            ...obstacleRobots,
          ];

          // Throttled sync to React state (~15fps) for UI indicators (Settings / PIP monitor / Console mirror)
          if (currentTime - lastStateSyncTimeRef.current >= 66) {
            lastStateSyncTimeRef.current = currentTime;
            setBlueRobot({ ...liveStateRef.current.blueRobot });
            setRedRobot({ ...liveStateRef.current.redRobot });

            try {
              const live = liveStateRef.current;
              const livePosPayload = {
                type: 'UPDATE',
                score: scoreRef.current,
                timeLeft: timeLeftRef.current,
                gamePhase: gamePhaseRef.current,
                allRobots: live.allRobots || [live.blueRobot, live.redRobot],
                centerSpeaker: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT / 2, radius: CENTER_SPEAKER_RADIUS },
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

      // Step AI Bots if enabled for Blue and/or Red
      if (curGamePhase === 'PLAYING') {
        if (isBlueBot) {
          liveStateRef.current.blueRobot = stepAiRobot(
            liveStateRef.current.blueRobot,
            'blue',
            liveStateRef.current.puck,
            curBotDifficulty,
            dt,
            screenTf
          );
        }
        if (isRedBot) {
          liveStateRef.current.redRobot = stepAiRobot(
            liveStateRef.current.redRobot,
            'red',
            liveStateRef.current.puck,
            curBotDifficulty,
            dt,
            screenTf
          );
        }
      }

      // Throttled sync to React state & Secondary Windows (~15fps) even when camera is off (for AI / Virtual mode!)
      if (currentTime - lastStateSyncTimeRef.current >= 66) {
        lastStateSyncTimeRef.current = currentTime;
        setBlueRobot({ ...liveStateRef.current.blueRobot });
        setRedRobot({ ...liveStateRef.current.redRobot });

        try {
          const live = liveStateRef.current;
          const livePosPayload = {
            type: 'UPDATE',
            score: scoreRef.current,
            timeLeft: timeLeftRef.current,
            gamePhase: gamePhaseRef.current,
            obstacles: obstaclesEnabledRef.current ? (live.obstacles || obstaclesRef.current) : [],
            obstaclesEnabled: obstaclesEnabledRef.current,
            botTeam: botTeamRef.current,
            botDifficulty: botDifficultyRef.current,
            puck: {
              x: live.puck.x,
              y: live.puck.y,
              vx: live.puck.vx,
              vy: live.puck.vy,
              spin: live.puck.spin,
              superCharged: live.puck.superCharged,
              rallyCount: live.puck.rallyCount,
            },
            blueRobot: {
              tableX: live.blueRobot.tableX,
              tableY: live.blueRobot.tableY,
              detected: live.blueRobot.detected,
              confidence: live.blueRobot.confidence,
            },
            redRobot: {
              tableX: live.redRobot.tableX,
              tableY: live.redRobot.tableY,
              detected: live.redRobot.detected,
              confidence: live.redRobot.confidence,
            },
          };
          broadcastRef.current?.postMessage(livePosPayload);
          window.electronAPI?.sendSyncState(livePosPayload as any);
        } catch {}
      }

      // 2. Continuous 60fps Physics Simulation
      if (curGamePhase === 'PLAYING') {
        const activeRobots = liveStateRef.current.allRobots && liveStateRef.current.allRobots.length > 0
          ? liveStateRef.current.allRobots
          : [liveStateRef.current.blueRobot, liveStateRef.current.redRobot];

        const { puck: nextPuck, events } = stepPuckPhysics(
          liveStateRef.current.puck,
          activeRobots,
          curGoalSize,
          dt
        );
        liveStateRef.current.puck = nextPuck;

        // Record trajectory point for Goal Replay
        const hist = puckHistoryRef.current;
        const lastPt = hist[hist.length - 1];
        if (!lastPt || Math.hypot(nextPuck.x - lastPt.x, nextPuck.y - lastPt.y) > 12) {
          hist.push({ x: Math.round(nextPuck.x), y: Math.round(nextPuck.y) });
          if (hist.length > 65) hist.shift();
        }

        // Process all collision feedback events
        for (const ev of events) {
          if (ev.type === 'GOAL' && ev.team) {
            handleGoalScored(ev.team);
          } else if (ev.type === 'SPEAKER') {
            // [REQ] 경기장 정가운데 실제 물리 스피커 충돌 피드백 (묵직한 킥 타격음 + 스파크)
            soundManager.playSpeakerHit(Math.min(1.2, ev.speed / 450));
            const screenHit = screenTf.tableToScreen(ev.x, ev.y);
            spawnParticles(screenHit.x, screenHit.y, '#38bdf8', 12);
            setStats((s) => ({ ...s, speakerHits: (s.speakerHits || 0) + 1 }));
          } else if (ev.type === 'ROBOT') {
            if (ev.team === 'obstacle') {
              soundManager.playPaddleHit(Math.min(1.0, ev.speed / 450));
            } else {
              if (ev.speed > 550) {
                soundManager.playHighSpeedSmash();
              } else {
                soundManager.playRobotHit(Math.min(1.0, ev.speed / 500));
              }
            }
            const screenHit = screenTf.tableToScreen(ev.x, ev.y);
            spawnParticles(
              screenHit.x,
              screenHit.y,
              ev.team === 'blue' ? '#2563eb' : (ev.team === 'red' ? '#dc2626' : '#ec4899'),
              ev.speed > 550 ? 20 : 12
            );
            if (ev.team && ev.team !== 'obstacle') {
              setStats((s) => ({
                ...s,
                [ev.team === 'blue' ? 'blueHits' : 'redHits']:
                  s[ev.team === 'blue' ? 'blueHits' : 'redHits'] + 1,
                maxPuckSpeed: Math.max(s.maxPuckSpeed, ev.speed),
              }));
            }
          } else if (ev.type === 'POST') {
            soundManager.playGoalPost();
            addImpactRipple(ev.x, ev.y, '#f59e0b', 46, 300);
          } else if (ev.type === 'WALL') {
            soundManager.playWallBounce(Math.min(1.0, ev.speed / 400));
            addImpactRipple(ev.x, ev.y, 'rgba(148, 163, 184, 0.7)', 28, 200);
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
  }, [cameraActive, handleGoalScored, addImpactRipple]);

  // Screen Court Corner Dragging during CALIBRATION_SCREEN
  const handleScreenPointerDown = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingScreenCorner(idx);
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingScreenCorner !== null && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const normX = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top) / rect.height));

      setScreenCorners((prev) => {
        const next = [...prev] as FourCorners;
        next[draggingScreenCorner] = { x: normX, y: normY };
        try {
          localStorage.setItem('airhockey_screen_corners', JSON.stringify(next));
        } catch {}
        return next;
      });
      return;
    }

    // Allow direct mouse/touch paddle control on the main canvas when AI Bot is playing against 1P!
    if (gamePhase === 'PLAYING' && (isVirtualMode || botTeam === 'RED') && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const tablePt = screenTransformerRef.current.screenToTable(px, py);
      if (tablePt.x >= 0 && tablePt.x <= TABLE_WIDTH / 2) {
        handleUpdateVirtualRobot('blue', tablePt.x, tablePt.y);
      }
    }
  };

  const handleContainerPointerUp = () => {
    if (draggingScreenCorner !== null) {
      setDraggingScreenCorner(null);
      try {
        window.electronAPI?.sendAction({
          type: 'GAME_ACTION',
          action: 'UPDATE_SCREEN_CORNERS',
          screenCorners,
        });
        broadcastRef.current?.postMessage({
          type: 'GAME_ACTION',
          action: 'UPDATE_SCREEN_CORNERS',
          screenCorners,
        });
      } catch {}
    }
  };

  const handleConfirmScreenCalibration = () => {
    setGamePhase('READY');
    try {
      localStorage.setItem('airhockey_screen_corners', JSON.stringify(screenCorners));
      window.electronAPI?.sendAction({
        type: 'GAME_ACTION',
        action: 'CONFIRM_CALIBRATION',
      });
      broadcastRef.current?.postMessage({
        type: 'GAME_ACTION',
        action: 'CONFIRM_CALIBRATION',
      });
    } catch {}
  };

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

      {/* [REQ] 매인 경기창에는 모든 UI 넣지 말고 경기장 라인, 골대, 말, 숫자/시간만 띄워 */}
      <div
        ref={containerRef}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        className="relative w-full h-full overflow-hidden flex items-center justify-center cursor-default"
      >
        <GameCanvas
          normalizedCorners={screenCorners}
          gamePhase={gamePhase}
          score={score}
          timeLeft={timeLeft}
          blueRobot={blueRobot}
          redRobot={redRobot}
          puck={puck}
          liveStateRef={liveStateRef}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          goalSize={goalSize}
          theme={theme}
          isVirtualMode={isVirtualMode}
          stats={stats}
        />

        {/* [REQ] 경기장은 깔끔한 4개 모서리 핀 캘리브레이션 */}
        {gamePhase === 'CALIBRATION_SCREEN' && (
          <div className="absolute inset-0 z-30 pointer-events-auto">
            {/* SVG Connecting 4-point Quadrilateral */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <polygon
                points={screenCorners
                  .map((p) => `${p.x * containerSize.width},${p.y * containerSize.height}`)
                  .join(' ')}
                fill="rgba(6, 182, 212, 0.14)"
                stroke="#06b6d4"
                strokeWidth="3"
                strokeDasharray="8 6"
              />
            </svg>

            {/* 4 Interactive Corner Pins */}
            {screenCorners.map((corner, idx) => {
              const cornerColors = ['#0284c7', '#2563eb', '#d97706', '#7c3aed'];
              const cornerNames = ['1.좌상(TL)', '2.우상(TR)', '3.우하(BR)', '4.좌하(BL)'];
              const px = corner.x * containerSize.width;
              const py = corner.y * containerSize.height;

              return (
                <div
                  key={idx}
                  onPointerDown={(e) => handleScreenPointerDown(idx, e)}
                  style={{
                    transform: `translate(${px}px, ${py}px) translate(-50%, -50%)`,
                  }}
                  className="absolute cursor-move group select-none touch-none z-40"
                >
                  <div
                    className="w-12 h-12 rounded-full border-4 border-white shadow-[0_0_20px_rgba(0,0,0,0.85)] flex items-center justify-center font-black text-xs text-white transition-transform group-hover:scale-125"
                    style={{ backgroundColor: cornerColors[idx % cornerColors.length] }}
                  >
                    {idx + 1}
                  </div>
                  <div className="absolute top-14 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 text-white text-[11px] font-bold px-2 py-0.5 rounded border border-slate-700 shadow pointer-events-none">
                    {cornerNames[idx % cornerNames.length]}
                  </div>
                </div>
              );
            })}

            {/* Top Calibration Banner with Done Button */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 rounded-2xl bg-slate-900/95 border-2 border-cyan-400 text-white shadow-2xl backdrop-blur-md">
              <div className="flex flex-col">
                <span className="text-sm font-black text-cyan-400">
                  📐 [창 캘리브레이션] 프로젝터 화면 책상 맞춤 (4점)
                </span>
                <span className="text-xs text-slate-300">
                  모서리 4개 핀(1~4번)을 실제 책상 네 모서리에 맞춰 드래그하세요.
                </span>
              </div>
              <button
                onClick={handleConfirmScreenCalibration}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg"
              >
                설정 완료
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
