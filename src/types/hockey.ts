export interface Point2D {
  x: number;
  y: number;
}

export type FourCorners = [Point2D, Point2D, Point2D, Point2D]; // [TopLeft, TopRight, BottomRight, BottomLeft]

export interface RobotState {
  team: 'blue' | 'red';
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
  lastHitTeam: 'blue' | 'red' | null;
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

export interface LiveGameState {
  blueRobot: RobotState;
  redRobot: RobotState;
  puck: PuckState;
  particles: Particle[];
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

export type VisionEngineType = 'CHROMATIC' | 'YCRCB' | 'HSV';

export interface ColorSettings {
  magenta: ColorFilter;
  minBlobSize: number;
  maxBlobSize: number;
  visionEngine: VisionEngineType;
  sensitivity: number; // 1 (narrow) to 5 (wide), default 3
  customSample?: { r: number; g: number; b: number; hex: string } | null;
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
    | 'UPDATE_GOAL_SIZE';
  seconds?: number;
  score?: MatchScore;
  mode?: MatchMode;
  theme?: 'dark' | 'light';
  customDuration?: number;
  targetPoints?: number;
  goalSize?: number;
  screenCorners?: FourCorners;
  cameraCorners?: FourCorners;
  isCameraMirrored?: boolean;
};

export const DEFAULT_NORMALIZED_CORNERS: FourCorners = [
  { x: 0.04, y: 0.05 }, // Top-Left (화면에 꽉 찬 시원한 경기장)
  { x: 0.96, y: 0.05 }, // Top-Right
  { x: 0.96, y: 0.95 }, // Bottom-Right
  { x: 0.04, y: 0.95 }, // Bottom-Left
];

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
  goalAnnouncement?: { team: 'blue' | 'red'; countdown: number } | null;
  screenCorners?: FourCorners;
  cameraCorners?: FourCorners;
  isCameraMirrored?: boolean;
  puck?: { x: number; y: number; vx: number; vy: number };
  blueRobot?: { tableX: number; tableY: number; detected: boolean; confidence: number };
  redRobot?: { tableX: number; tableY: number; detected: boolean; confidence: number };
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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
