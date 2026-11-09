import React from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Settings2,
  Crosshair,
  Bot,
  Play,
  Pause,
  FlipHorizontal,
  Maximize,
  Minimize,
  Timer,
} from 'lucide-react';
import { GamePhase, MatchScore, RobotState, MatchMode, MATCH_MODES } from '../types/hockey';

interface ScoreBoardProps {
  score: MatchScore;
  timeLeft: number;
  gamePhase: GamePhase;
  blueRobot: RobotState;
  redRobot: RobotState;
  matchMode: MatchMode;
  isMuted: boolean;
  isVirtualMode: boolean;
  isCameraMirrored?: boolean;
  isFullscreen?: boolean;
  onChangeMatchMode: (mode: MatchMode) => void;
  onToggleMute: () => void;
  onToggleVirtualMode: () => void;
  onToggleCameraMirror?: () => void;
  onToggleFullscreen?: () => void;
  onOpenCalibration: () => void;
  onOpenColorTuner: () => void;
  onStartGame: () => void;
  onPauseGame: () => void;
  onResetGame: () => void;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({
  score,
  timeLeft,
  gamePhase,
  blueRobot,
  redRobot,
  matchMode,
  isMuted,
  isVirtualMode,
  isCameraMirrored = false,
  isFullscreen = false,
  onChangeMatchMode,
  onToggleMute,
  onToggleVirtualMode,
  onToggleCameraMirror,
  onToggleFullscreen,
  onOpenCalibration,
  onOpenColorTuner,
  onStartGame,
  onPauseGame,
  onResetGame,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isLowTime = timeLeft <= 10 && gamePhase === 'PLAYING';

  return (
    <header className="relative z-30 w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100 select-none">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand & Mode status */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
              테이블 에어하키
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-pink-400 font-medium">마젠타 블록 2개 감지</span>
              <span aria-hidden="true">·</span>
              <span>골대: Cyan / Yellow</span>
            </div>
          </div>

          {/* Match Mode Selector dropdown/buttons */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(Object.keys(MATCH_MODES) as MatchMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onChangeMatchMode(mode)}
                disabled={gamePhase === 'PLAYING'}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                  matchMode === mode
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white disabled:opacity-50'
                }`}
              >
                {MATCH_MODES[mode].label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Match Score & Match Countdown */}
        <div className="flex items-center gap-5 sm:gap-7 mx-auto">
          {/* Cyan Team Score */}
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-xs font-semibold text-cyan-400 tracking-wide uppercase">
                Cyan 팀 (Cyan)
              </div>
              <div className="text-[11px] text-slate-400">
                {blueRobot.detected ? (
                  <span className="text-cyan-300">마젠타 1 ({(blueRobot.confidence * 100).toFixed(0)}%)</span>
                ) : (
                  <span className="text-slate-500">탐색 중...</span>
                )}
              </div>
            </div>
            <div className="w-11 h-11 rounded-lg bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center font-mono text-2xl font-bold text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)] tabular-nums">
              {score.blue}
            </div>
          </div>

          {/* Match Timer Badge */}
          <div className="flex flex-col items-center px-3 py-1 bg-slate-950/90 rounded-lg border border-slate-800 shadow-inner">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 font-medium">
              <Timer className="w-3 h-3" />
              <span>{MATCH_MODES[matchMode].label}</span>
            </div>
            <span
              className={`font-mono text-2xl font-bold tabular-nums transition-colors ${
                isLowTime ? 'text-red-400 animate-pulse' : 'text-amber-400'
              }`}
            >
              {formatTime(timeLeft)}
            </span>
            <span className="text-[10px] text-slate-400">
              {gamePhase === 'PLAYING' && '진행 중'}
              {gamePhase === 'READY' && '시작 대기'}
              {gamePhase === 'GOAL' && '득점! 리셋 중'}
              {gamePhase === 'TIME_UP' && '경기 종료'}
              {(gamePhase === 'CALIBRATION_SCREEN' || gamePhase === 'CALIBRATION_CAMERA') && '경기장 설정 중'}
            </span>
          </div>

          {/* Yellow Team Score */}
          <div className="flex items-center gap-2">
            <div className="w-11 h-11 rounded-lg bg-yellow-950/90 border border-yellow-500/50 flex items-center justify-center font-mono text-2xl font-bold text-yellow-300 shadow-[0_0_12px_rgba(234,179,8,0.3)] tabular-nums">
              {score.red}
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-yellow-400 tracking-wide uppercase">
                Yellow 팀 (Yellow)
              </div>
              <div className="text-[11px] text-slate-400">
                {redRobot.detected ? (
                  <span className="text-yellow-300">마젠타 2 ({(redRobot.confidence * 100).toFixed(0)}%)</span>
                ) : (
                  <span className="text-slate-500">탐색 중...</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Actions and Tool Toggles */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Play / Pause Toggle */}
          {gamePhase === 'PLAYING' ? (
            <button
              onClick={onPauseGame}
              title="게임 일시정지"
              className="px-3 py-1.5 text-xs font-medium bg-amber-600/90 hover:bg-amber-500 text-white rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>일시정지</span>
            </button>
          ) : (
            <button
              onClick={onStartGame}
              title={gamePhase === 'TIME_UP' ? '새 경기 시작' : '경기 시작'}
              className="px-3.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{gamePhase === 'TIME_UP' ? '새 경기' : '경기 시작'}</span>
            </button>
          )}

          {/* Reset button */}
          <button
            onClick={onResetGame}
            title="점수 및 공 위치 초기화"
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Desk Calibration Button */}
          <button
            onClick={onOpenCalibration}
            title="화면 경기장 선택 및 카메라 매핑"
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${
              gamePhase === 'CALIBRATION_SCREEN' || gamePhase === 'CALIBRATION_CAMERA'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">캘리브레이션</span>
          </button>

          {/* Camera Horizontal Flip Toggle */}
          {onToggleCameraMirror && (
            <button
              onClick={onToggleCameraMirror}
              title={isCameraMirrored ? '카메라 좌우반전 해제' : '카메라 좌우반전 켜기'}
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap border ${
                isCameraMirrored
                  ? 'bg-amber-600/90 text-white border-amber-500 shadow-sm'
                  : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{isCameraMirrored ? '좌우반전 ON' : '좌우반전'}</span>
            </button>
          )}

          {/* Color Tuner Button */}
          <button
            onClick={onOpenColorTuner}
            title="마젠타 마커 인식 감도 조절"
            className="px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">마젠타 감도</span>
          </button>

          {/* Virtual Mode Toggle */}
          <button
            onClick={onToggleVirtualMode}
            title={isVirtualMode ? '카메라 비전 모드로 전환' : '마우스/키보드 가상 로봇 모드로 전환'}
            className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${
              isVirtualMode
                ? 'bg-amber-600/90 text-white shadow-sm'
                : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isVirtualMode ? '가상봇 ON' : '가상봇'}</span>
          </button>

          {/* Fullscreen Toggle (Crucial for Table Projectors) */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={isFullscreen ? '전체화면 종료' : '빔프로젝터 전체화면 모드'}
              className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
            >
              {isFullscreen ? <Minimize className="w-4 h-4 text-sky-400" /> : <Maximize className="w-4 h-4" />}
            </button>
          )}

          {/* Mute button */}
          <button
            onClick={onToggleMute}
            title={isMuted ? '음소거 해제' : '음소거'}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
