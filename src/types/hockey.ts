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

export type GamePhase = 'CALIBRATION' | 'READY' | 'PLAYING' | 'GOAL' | 'TIME_UP';

export interface MatchScore {
  blue: number; // 청팀
  red: number;  // 적팀
}

export interface MatchStats {
  blueHits: number;
  redHits: number;
  maxPuckSpeed: number;
  lastScoredTeam: 'blue' | 'red' | null;
}

export const DEFAULT_NORMALIZED_CORNERS: FourCorners = [
  { x: 0.22, y: 0.24 }, // Top-Left
  { x: 0.72, y: 0.24 }, // Top-Right
  { x: 0.72, y: 0.68 }, // Bottom-Right
  { x: 0.22, y: 0.68 }, // Bottom-Left
];

export const FULL_FRAME_NORMALIZED_CORNERS: FourCorners = [
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];

// Table logical dimensions (standard aspect ratio 1000 x 600)
export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 600;
export const DEFAULT_GOAL_SIZE = 240; // Default height of the goal opening
export const GOAL_SIZE = DEFAULT_GOAL_SIZE;
export const MIN_GOAL_SIZE = 120;
export const MAX_GOAL_SIZE = 420;
export const PUCK_RADIUS = 18;
export const ROBOT_RADIUS = 36;
export type MatchMode = '1MIN' | '2MIN' | '3MIN' | 'TARGET_5';

export const MATCH_DURATION_SECONDS = 60;
export const MATCH_MODES: Record<MatchMode, { label: string; duration: number; targetScore?: number }> = {
  '1MIN': { label: '1분 매치', duration: 60 },
  '2MIN': { label: '2분 매치', duration: 120 },
  '3MIN': { label: '3분 매치', duration: 180 },
  'TARGET_5': { label: '5점 선승제', duration: 300, targetScore: 5 },
};

export interface SyncStatePayload {
  type: 'SYNC_STATE';
  score: MatchScore;
  timeLeft: number;
  gamePhase: GamePhase;
  matchMode: MatchMode;
  stats: MatchStats;
  goalAnnouncement?: { team: 'blue' | 'red'; countdown: number } | null;
}

export interface ElectronAPI {
  isElectron: boolean;
  sendSyncState: (payload: SyncStatePayload) => void;
  onSyncState: (callback: (data: SyncStatePayload) => void) => () => void;
  openOrFocusSubWindow: () => void;
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
