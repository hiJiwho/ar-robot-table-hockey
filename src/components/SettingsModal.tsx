import React from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Target,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  FlipHorizontal,
  Eye,
  EyeOff,
  SwitchCamera,
  Bot,
  Sliders,
  Sparkles,
  HelpCircle,
  Monitor,
} from 'lucide-react';
import { GamePhase, MatchMode, MATCH_MODES, RobotState, VisionEngineType } from '../types/hockey';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gamePhase: GamePhase;
  matchMode: MatchMode;
  timeLeft: number;
  blueRobot: RobotState;
  redRobot: RobotState;
  visionEngine?: VisionEngineType;
  isMuted: boolean;
  isVirtualMode: boolean;
  isCameraMirrored: boolean;
  isFullscreen: boolean;
  showCameraPip: boolean;
  goalSize: number;
  cameraActive: boolean;
  onChangeMatchMode: (mode: MatchMode) => void;
  onStartGame: () => void;
  onPauseGame: () => void;
  onResetGame: () => void;
  onToggleMute: () => void;
  onToggleVirtualMode: () => void;
  onToggleCameraMirror: () => void;
  onToggleFullscreen: () => void;
  onToggleCameraPip: () => void;
  onToggleCameraFacing: () => void;
  onOpenCalibration: () => void;
  onOpenColorTuner: () => void;
  onUpdateGoalSize: (size: number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  gamePhase,
  matchMode,
  timeLeft,
  blueRobot,
  redRobot,
  visionEngine = 'OPENCV',
  isMuted,
  isVirtualMode,
  isCameraMirrored,
  isFullscreen,
  showCameraPip,
  goalSize,
  cameraActive,
  onChangeMatchMode,
  onStartGame,
  onPauseGame,
  onResetGame,
  onToggleMute,
  onToggleVirtualMode,
  onToggleCameraMirror,
  onToggleFullscreen,
  onToggleCameraPip,
  onToggleCameraFacing,
  onOpenCalibration,
  onOpenColorTuner,
  onUpdateGoalSize,
}) => {
  if (!isOpen) return null;

  const isPlaying = gamePhase === 'PLAYING';
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                게임 설정
                <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  중앙 시계 클릭으로 오픈
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                경기 모드, 카메라 캘리브레이션 및 마젠타 마커 트래킹 설정
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-200 text-sm">
          {/* Quick Play & Space Shortcut Info */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center font-mono font-bold text-lg text-indigo-400">
                {formatTime(timeLeft)}
              </div>
              <div>
                <div className="font-semibold text-white flex items-center gap-2">
                  <span>현재 상태: {isPlaying ? '경기 진행 중' : gamePhase === 'TIME_UP' ? '경기 종료' : '시작 대기'}</span>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-slate-300">Space</span>
                  <span>키를 누르면 언제든 즉시 시작/정지할 수 있습니다.</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {isPlaying ? (
                <button
                  onClick={() => {
                    onPauseGame();
                  }}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow transition-colors"
                >
                  <Pause className="w-4 h-4" />
                  일시정지
                </button>
              ) : (
                <button
                  onClick={() => {
                    onStartGame();
                    onClose();
                  }}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow transition-colors"
                >
                  <Play className="w-4 h-4" />
                  경기 시작
                </button>
              )}
              <button
                onClick={onResetGame}
                title="점수 및 시간 초기화"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Match Mode Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              경기 모드 선택
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(MATCH_MODES) as MatchMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onChangeMatchMode(mode)}
                  disabled={isPlaying}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    matchMode === mode
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  } ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-xs font-bold">{MATCH_MODES[mode].label}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {mode === 'TARGET_5' ? '5골 먼저 넣으면 승리' : `${MATCH_MODES[mode].duration}초 제한`}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Vision & Tracking Status (Clean Black Paddles / Multi-Engine) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                로봇 패들 트래킹 상태
              </span>
              <span className="text-[11px] text-pink-400 font-medium">
                {visionEngine === 'OPENCV'
                  ? 'OpenCV 엔진 (opencv.js)'
                  : visionEngine === 'CHROMATIC'
                  ? '스마트 크로마틱 엔진 (추천)'
                  : visionEngine === 'YCRCB'
                  ? 'YCrCb 채도 분리 엔진 (OpenCV)'
                  : '적응형 HSV 엔진'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-black border-2 border-slate-500 inline-block shadow-sm" />
                  <span className="text-xs font-medium text-white">로봇 패들 (청 진영)</span>
                </div>
                <span className={`text-xs font-mono font-semibold ${blueRobot.detected ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {blueRobot.detected ? `${(blueRobot.confidence * 100).toFixed(0)}% 감지` : '탐색 중...'}
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-black border-2 border-slate-500 inline-block shadow-sm" />
                  <span className="text-xs font-medium text-white">로봇 패들 (적 진영)</span>
                </div>
                <span className={`text-xs font-mono font-semibold ${redRobot.detected ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {redRobot.detected ? `${(redRobot.confidence * 100).toFixed(0)}% 감지` : '탐색 중...'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => {
                  onClose();
                  onOpenCalibration();
                }}
                className="flex-1 min-w-[140px] px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow"
              >
                <Target className="w-4 h-4" />
                경기장 캘리브레이션
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenColorTuner();
                }}
                className="flex-1 min-w-[140px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-pink-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                비전 엔진 & 마커 튜닝
              </button>
            </div>
          </div>

          {/* Goal Size Setting */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">골대 크기 (청 / 적 골대)</span>
              <span className="font-mono text-indigo-400 font-bold">{goalSize} px</span>
            </div>
            <input
              type="range"
              min="140"
              max="340"
              step="10"
              value={goalSize}
              onChange={(e) => onUpdateGoalSize(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>좁게 (140px)</span>
              <span>표준 (220px)</span>
              <span>넓게 (340px)</span>
            </div>
          </div>

          {/* Camera & System Toggles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            <button
              onClick={onToggleFullscreen}
              className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                isFullscreen
                  ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              <span>{isFullscreen ? '창모드 복귀' : '프로젝터 전체화면'}</span>
            </button>

            <button
              onClick={onToggleCameraMirror}
              className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                isCameraMirrored
                  ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <FlipHorizontal className="w-4 h-4" />
              <span>{isCameraMirrored ? '좌우반전 ON' : '좌우반전 OFF'}</span>
            </button>

            <button
              onClick={onToggleCameraPip}
              className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                showCameraPip
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {showCameraPip ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showCameraPip ? '카메라 창 닫기' : '카메라 모니터'}</span>
            </button>

            <button
              onClick={onToggleVirtualMode}
              className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                isVirtualMode
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>{isVirtualMode ? '가상봇 ON (마우스)' : '가상봇 OFF'}</span>
            </button>

            <button
              onClick={onToggleMute}
              className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                isMuted
                  ? 'bg-red-600/20 border-red-500 text-red-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{isMuted ? '음소거 됨' : '효과음 켜짐'}</span>
            </button>

            {cameraActive && (
              <button
                onClick={onToggleCameraFacing}
                className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-300 hover:bg-slate-800 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <SwitchCamera className="w-4 h-4" />
                <span>카메라 전환</span>
              </button>
            )}

            <button
              onClick={() => {
                if (window.electronAPI) {
                  window.electronAPI.openOrFocusSubWindow();
                } else {
                  window.open(
                    window.location.origin + window.location.pathname + '?screen=scoreboard',
                    '_blank',
                    'width=1280,height=720'
                  );
                }
              }}
              title="시간과 점수가 표시되는 2번째 화면(전광판/Electron)을 새 창으로 열거나 포커스합니다"
              className="p-2.5 rounded-xl border border-indigo-600/40 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Monitor className="w-4 h-4 text-indigo-400" />
              <span>2번째 화면 (전광판)</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>경기 중 스페이스(Space) 또는 양 끝 점수판을 클릭하면 이 창이 열립니다.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg text-xs transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
