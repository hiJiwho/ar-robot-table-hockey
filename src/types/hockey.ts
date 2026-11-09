export interface Point2D {
  x: number;
  y: number;
}

export type FourCorners = [Point2D, Point2D, Point2D, Point2D]; // [TopLeft, TopRight, BottomRight, BottomLeft]

// [REQ] 8-Point Calibration: 4 corners + 4 edge midpoints to eliminate optical/projector distortion
// [0:TL, 1:TopMid, 2:TR, 3:RightMid, 4:BR, 5:BottomMid, 6:BL, 7:LeftMid]
export type EightPoints = [
  Point2D,
  Point2D,
  Point2D,
  Point2D,
  Point2D,
  Point2D,
  Point2D,
  Point2D
];

export type CalibrationCorners = FourCorners | EightPoints;

export interface RobotState {
  id?: string;
  team: 'blue' | 'red' | 'obstacle'; // 1P(blue), 2P(red), 또는 경기장 내 물리 장애물 로봇(obstacle)
  // Position in virtual table coordinates (e.g. 0..1000 x 0..600)
  tableX: number;
  tableY: number;
  // Position in camera video pixel coordinates
  screenX: number;
  screenY: number;
  vx: number;
  vy: number;
  detected: boolean;
  radius: number;
  lastSeenTime: number;
  confidence: number;
}

export interface PuckState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
  lastHitTeam: 'blue' | 'red' | 'obstacle' | null;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface ImpactRipple {
  id: string;
  x: number; // Table coordinate X
  y: number; // Table coordinate Y
  color: string;
  maxRadius: number;
  createdAt: number;
  duration: number; // ms
  label?: string;
}

export interface LiveGameState {
  blueRobot: RobotState;
  redRobot: RobotState;
  allRobots: RobotState[]; // [REQ] 2개에서 10개 사이로 유동적 인식된 모든 마젠타 로봇/블록 (장애물 로봇 포함)
  puck: PuckState;
  particles: Particle[];
}

export type BotDifficulty = 'EASY' | 'NORMAL' | 'HARD' | 'PRO';
export type BotTargetTeam = 'NONE' | 'RED' | 'BLUE' | 'BOTH';

export interface GoalLogEntry {
  id: string;
  team: 'blue' | 'red';
  points: number;
  speed: number;
  timeRemaining: number;
  timestamp: number;
  isSuperGoal?: boolean;
  replayPath?: Array<{ x: number; y: number }>;
}

export interface ColorFilter {
  // HSV ranges
  // Hue: 0-360
  hMin: number;
  hMax: number;
  // Saturation: 0-1
  sMin: number;
  sMax: number;
  // Value: 0-1
  vMin: number;
  vMax: number;
}

export type VisionEngineType = 'OPENCV' | 'CHROMATIC' | 'YCRCB' | 'HSV' | 'ADAPTIVE_HSV';

export interface ColorSettings {
  magenta: ColorFilter;
  minBlobSize: number;
  maxBlobSize: number;
  visionEngine: VisionEngineType;
  sensitivity: number; // 1 (narrow) to 5 (wide), default 3
  customSample?: { r: number; g: number; b: number; hex: string } | null;
  lowLightMode?: boolean; // [REQ] 불 꺼도 인식 잘 되는 암실/저조도 감도 부스트 모드
}

export type GamePhase = 'READY' | 'PLAYING' | 'GOAL' | 'TIME_UP' | 'CALIBRATION_SCREEN' | 'CALIBRATION_CAMERA';

export interface MatchScore {
  blue: number; // 청팀 / 1P
  red: number;  // 적팀 / 2P
}

export interface MatchStats {
  blueHits: number;
  redHits: number;
  maxPuckSpeed: number;
  lastScoredTeam: 'blue' | 'red' | null;
  speakerHits?: number;
  maxRally?: number;
  currentRally?: number;
  goalHistory?: GoalLogEntry[];
}

export type GameActionMessage = {
  type: 'GAME_ACTION';
  action:
    | 'START'
    | 'PAUSE'
    | 'RESET'
    | 'PREPARE'
    | 'ADD_TIME'
    | 'SET_SCORE'
    | 'CHANGE_MODE'
    | 'SET_THEME'
    | 'START_CALIBRATE_SCREEN'
    | 'START_CALIBRATE_CAMERA'
    | 'UPDATE_SCREEN_CORNERS'
    | 'UPDATE_CAMERA_CORNERS'
    | 'CONFIRM_CALIBRATION'
    | 'TOGGLE_MIRROR'
    | 'UPDATE_GOAL_SIZE'
    | 'SET_LOW_LIGHT_MODE'
    | 'UPDATE_COLOR_SETTINGS'
    | 'SAMPLE_COLOR';
  seconds?: number;
  score?: MatchScore;
  mode?: MatchMode;
  theme?: 'dark' | 'light';
  customDuration?: number;
  targetPoints?: number;
  goalSize?: number;
  screenCorners?: CalibrationCorners;
  cameraCorners?: CalibrationCorners;
  isCameraMirrored?: boolean;
  lowLightMode?: boolean;
  colorSettings?: Partial<ColorSettings>;
  customSample?: { r: number; g: number; b: number; hex: string } | null;
};

export const DEFAULT_NORMALIZED_CORNERS: FourCorners = [
  { x: 0.04, y: 0.05 }, // Top-Left (화면에 꽉 찬 시원한 경기장)
  { x: 0.96, y: 0.05 }, // Top-Right
  { x: 0.96, y: 0.95 }, // Bottom-Right
  { x: 0.04, y: 0.95 }, // Bottom-Left
];

// [REQ] Default 8 normalized points with 4 edge midpoints for wide-angle distortion correction
export const DEFAULT_NORMALIZED_8POINTS: EightPoints = [
  { x: 0.04, y: 0.05 }, // 0: TL (좌상)
  { x: 0.50, y: 0.05 }, // 1: Top-Mid (상단 중앙)
  { x: 0.96, y: 0.05 }, // 2: TR (우상)
  { x: 0.96, y: 0.50 }, // 3: Right-Mid (우측 중앙)
  { x: 0.96, y: 0.95 }, // 4: BR (우하)
  { x: 0.50, y: 0.95 }, // 5: Bottom-Mid (하단 중앙)
  { x: 0.04, y: 0.95 }, // 6: BL (좌하)
  { x: 0.04, y: 0.50 }, // 7: Left-Mid (좌측 중앙)
];

export function toEightPoints(pts: Point2D[]): EightPoints {
  if (pts && pts.length >= 8) {
    return [pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]];
  }
  if (pts && pts.length === 4) {
    const p0 = pts[0];
    const p2 = pts[1];
    const p4 = pts[2];
    const p6 = pts[3];
    return [
      p0,
      { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 },
      p2,
      { x: (p2.x + p4.x) / 2, y: (p2.y + p4.y) / 2 },
      p4,
      { x: (p4.x + p6.x) / 2, y: (p4.y + p6.y) / 2 },
      p6,
      { x: (p6.x + p0.x) / 2, y: (p6.y + p0.y) / 2 },
    ];
  }
  return DEFAULT_NORMALIZED_8POINTS;
}

export const FULL_FRAME_NORMALIZED_CORNERS: FourCorners = [
  { x: 0.03, y: 0.03 },
  { x: 0.97, y: 0.03 },
  { x: 0.97, y: 0.97 },
  { x: 0.03, y: 0.97 },
];

// Table logical dimensions (standard aspect ratio 1000 x 600)
export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 600;
export const DEFAULT_GOAL_SIZE = 260; // Default height of the goal opening
export const GOAL_SIZE = DEFAULT_GOAL_SIZE;
export const MIN_GOAL_SIZE = 140;
export const MAX_GOAL_SIZE = 420;
export const PUCK_RADIUS = 20;
export const ROBOT_RADIUS = 38;
export const CENTER_SPEAKER_RADIUS = 44; // [REQ] 정가운데 물리 스피커 반경 (공 오면 튕김)
export type MatchMode = '1MIN' | 'CUSTOM_TIME' | 'TARGET_N';

export const MATCH_DURATION_SECONDS = 60;
export const MATCH_MODES: Record<MatchMode, { label: string; duration: number; targetScore?: number }> = {
  '1MIN': { label: '1분 매치', duration: 60 },
  'CUSTOM_TIME': { label: '입력 시간 매치', duration: 180 },
  'TARGET_N': { label: 'n점 선승제', duration: 600, targetScore: 5 },
};

export interface SyncStatePayload {
  type: 'SYNC_STATE';
  score: MatchScore;
  timeLeft: number;
  gamePhase: GamePhase;
  matchMode: MatchMode;
  customDuration?: number;
  targetPoints?: number;
  goalSize?: number;
  theme?: 'dark' | 'light';
  stats: MatchStats;
  goalAnnouncement?: { team: 'blue' | 'red'; countdown: number; points?: number } | null;
  screenCorners?: CalibrationCorners;
  cameraCorners?: CalibrationCorners;
  isCameraMirrored?: boolean;
  lowLightMode?: boolean;
  colorSettings?: ColorSettings;
  visionDiagnostics?: {
    engine: VisionEngineType;
    isOpenCVActive: boolean;
    detectedBlobsCount: number;
    blueConfidence: number;
    redConfidence: number;
  };
  puck?: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    spin?: number;
    superCharged?: boolean;
    rallyCount?: number;
  };
  blueRobot?: { tableX: number; tableY: number; detected: boolean; confidence: number };
  redRobot?: { tableX: number; tableY: number; detected: boolean; confidence: number };
  allRobots?: Array<{ id?: string; team: 'blue' | 'red' | 'obstacle'; tableX: number; tableY: number; detected: boolean; confidence: number }>;
  centerSpeaker?: { x: number; y: number; radius: number };
}

export interface ElectronAPI {
  isElectron: boolean;
  sendSyncState: (payload: SyncStatePayload) => void;
  onSyncState: (callback: (data: SyncStatePayload) => void) => () => void;
  sendAction: (action: GameActionMessage) => void;
  onAction: (callback: (action: GameActionMessage) => void) => () => void;
  openOrFocusSubWindow: () => void;
  openOrFocusConsoleWindow: () => void;
  arrangeSideBySide: () => void;
  toggleFullscreen: () => Promise<boolean>;
  getFullscreenState: () => Promise<boolean>;
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void;
  loadSavedConfig?: () => Promise<any>;
  saveConfig?: (config: any) => void;
  saveSlotConfig?: (slot: 'A' | 'B' | 'C', data: any) => Promise<{ ok: boolean; path?: string }>;
  loadSlotConfig?: (slot: 'A' | 'B' | 'C') => Promise<any>;
  openAppDataFolder?: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
