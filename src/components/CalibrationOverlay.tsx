import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FourCorners, Point2D, TABLE_HEIGHT, MIN_GOAL_SIZE, MAX_GOAL_SIZE } from '../types/hockey';
import { Check, RotateCcw, Move, FlipHorizontal, Goal, ArrowRight, ArrowLeft, Monitor, Camera } from 'lucide-react';

interface CalibrationOverlayProps {
  screenCorners: FourCorners;
  cameraCorners: FourCorners;
  goalSize: number;
  isCameraMirrored: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraActive: boolean;
  onUpdateScreenCorners: (corners: FourCorners) => void;
  onUpdateCameraCorners: (corners: FourCorners) => void;
  onUpdateGoalSize: (size: number) => void;
  onToggleCameraMirror: () => void;
  onConfirm: () => void;
}

const CORNER_NAMES = [
  '1. 좌측 상단 (Top-Left)',
  '2. 우측 상단 (Top-Right)',
  '3. 우측 하단 (Bottom-Right)',
  '4. 좌측 하단 (Bottom-Left)',
];

const CORNER_COLORS = [
  '#0284c7', // Sky Blue
  '#2563eb', // Royal Blue
  '#d97706', // Amber
  '#7c3aed', // Violet
];

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({
  screenCorners,
  cameraCorners,
  goalSize,
  isCameraMirrored,
  videoRef,
  cameraActive,
  onUpdateScreenCorners,
  onUpdateCameraCorners,
  onUpdateGoalSize,
  onToggleCameraMirror,
  onConfirm,
}) => {
  // Step 1: 'SCREEN_COURT' (화면 경기장 선택)
  // Step 2: 'CAMERA_MATCH' (카메라에서 같은 점 선택)
  const [step, setStep] = useState<'SCREEN_COURT' | 'CAMERA_MATCH'>('SCREEN_COURT');
  const [cameraClickIndex, setCameraClickIndex] = useState<number>(4); // 4 = all corners clicked
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getNormalizedPoint = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): Point2D | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches[0]?.clientX) : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? (e as TouchEvent).changedTouches[0]?.clientY) : (e as MouseEvent).clientY;
    if (clientX === undefined || clientY === undefined || rect.width === 0 || rect.height === 0) return null;

    const normX = Math.max(0.01, Math.min(0.99, (clientX - rect.left) / rect.width));
    const normY = Math.max(0.01, Math.min(0.99, (clientY - rect.top) / rect.height));

    return { x: normX, y: normY };
  };

  const activeCorners = step === 'SCREEN_COURT' ? screenCorners : cameraCorners;
  const updateActiveCorners = step === 'SCREEN_COURT' ? onUpdateScreenCorners : onUpdateCameraCorners;

  // Pointer Down on container (Sequential clicking in Camera mode)
  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (step === 'CAMERA_MATCH' && cameraClickIndex < 4) {
      const pt = getNormalizedPoint(e);
      if (!pt) return;
      const next = [...cameraCorners] as FourCorners;
      next[cameraClickIndex] = pt;
      onUpdateCameraCorners(next);
      setCameraClickIndex(cameraClickIndex + 1);
    }
  };

  const handleCornerHandleStart = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingIdx(idx);
  };

  const handleGlobalPointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (draggingIdx === null) return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    const next = [...activeCorners] as FourCorners;
    next[draggingIdx] = pt;
    updateActiveCorners(next);
  }, [draggingIdx, activeCorners, updateActiveCorners]);

  const handleGlobalPointerUp = useCallback(() => {
    if (draggingIdx !== null) {
      setDraggingIdx(null);
    }
  }, [draggingIdx]);

  useEffect(() => {
    if (draggingIdx !== null) {
      window.addEventListener('mousemove', handleGlobalPointerMove);
      window.addEventListener('mouseup', handleGlobalPointerUp);
      window.addEventListener('touchmove', handleGlobalPointerMove, { passive: false });
      window.addEventListener('touchend', handleGlobalPointerUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalPointerMove);
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchmove', handleGlobalPointerMove);
      window.removeEventListener('touchend', handleGlobalPointerUp);
    };
  }, [draggingIdx, handleGlobalPointerMove, handleGlobalPointerUp]);

  // Presets for screen court
  const applyTableBoxPreset = () => {
    const next: FourCorners = [
      { x: 0.24, y: 0.26 },
      { x: 0.70, y: 0.26 },
      { x: 0.70, y: 0.65 },
      { x: 0.24, y: 0.65 },
    ];
    updateActiveCorners(next);
  };

  const applyCenterPreset = () => {
    const next: FourCorners = [
      { x: 0.12, y: 0.14 },
      { x: 0.88, y: 0.14 },
      { x: 0.88, y: 0.86 },
      { x: 0.12, y: 0.86 },
    ];
    updateActiveCorners(next);
  };

  const applyFullPreset = () => {
    const next: FourCorners = [
      { x: 0.04, y: 0.04 },
      { x: 0.96, y: 0.04 },
      { x: 0.96, y: 0.96 },
      { x: 0.04, y: 0.96 },
    ];
    updateActiveCorners(next);
  };

  // Goal ratio calculation for lines
  const goalFraction = Math.max(0.15, Math.min(0.7, goalSize / TABLE_HEIGHT));
  const postTopFraction = (1 - goalFraction) / 2;
  const postBotFraction = 1 - postTopFraction;

  return (
    <div
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      className={`absolute inset-0 z-40 select-none overflow-hidden touch-none ${
        step === 'CAMERA_MATCH' && cameraClickIndex < 4 ? 'cursor-crosshair' : 'cursor-default'
      }`}
    >
      {/* Background:
          - Step 1 (SCREEN_COURT): Clean dark slate with projected white court surface
          - Step 2 (CAMERA_MATCH): Live camera video feed
      */}
      {step === 'CAMERA_MATCH' && cameraActive && videoRef.current && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
          <video
            src=""
            ref={(el) => {
              if (el && videoRef.current?.srcObject && el.srcObject !== videoRef.current.srcObject) {
                el.srcObject = videoRef.current.srcObject;
                el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
            muted
            style={{
              transform: isCameraMirrored ? 'scaleX(-1)' : 'none',
            }}
            className="w-full h-full object-cover opacity-95"
          />
        </div>
      )}

      {step === 'SCREEN_COURT' && (
        <div className="absolute inset-0 bg-slate-950/70 pointer-events-none" />
      )}

      {/* Top Banner & Multi-Step Navigation Header */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-700 rounded-2xl px-6 py-3.5 shadow-2xl backdrop-blur-md max-w-3xl w-[95%] pointer-events-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Step Segmented Switch */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setStep('SCREEN_COURT')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                step === 'SCREEN_COURT'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>1단계: 화면 경기장 지정</span>
            </button>

            <button
              onClick={() => setStep('CAMERA_MATCH')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                step === 'CAMERA_MATCH'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>2단계: 카메라 같은 점 매핑</span>
            </button>
          </div>

          {/* Quick Camera Mirror Button & Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onToggleCameraMirror}
              title={isCameraMirrored ? '카메라 좌우반전 해제' : '카메라 좌우반전 적용'}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 border ${
                isCameraMirrored
                  ? 'bg-amber-600/90 text-white border-amber-500 shadow-sm'
                  : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span>{isCameraMirrored ? '좌우반전 ON' : '좌우반전'}</span>
            </button>

            <button
              onClick={applyTableBoxPreset}
              className="px-2.5 py-1.5 text-xs text-amber-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors font-medium border border-amber-500/40"
            >
              중앙 박스
            </button>

            <button
              onClick={applyFullPreset}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              전체화면
            </button>

            {step === 'SCREEN_COURT' ? (
              <button
                onClick={() => setStep('CAMERA_MATCH')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md transition-colors flex items-center gap-1.5"
              >
                <span>다음: 카메라 매핑 →</span>
              </button>
            ) : (
              <button
                onClick={onConfirm}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md transition-colors flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>완료 (게임 시작)</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Instructional Guide */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-800/80 pt-2">
          <p className="text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            {step === 'SCREEN_COURT' ? (
              <span>
                <strong>화면 경기장 설정:</strong> 화면(또는 프로젝터)에 표시할 <strong>경기장 4개 모서리(1~4번 핀)</strong>를 원하는 위치로 배치하세요.
              </span>
            ) : cameraClickIndex < 4 ? (
              <span className="text-amber-300 font-medium">
                카메라 화면에서 화면의 <strong>{CORNER_NAMES[cameraClickIndex]}</strong>과 같은 위치를 클릭하세요!
              </span>
            ) : (
              <span>
                <strong>카메라 매핑 완료:</strong> 핀을 드래그하여 화면 모서리와 완전히 일치시키세요.
              </span>
            )}
          </p>

          {step === 'CAMERA_MATCH' && (
            <button
              onClick={() => setCameraClickIndex(0)}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>카메라 점 다시 찍기</span>
            </button>
          )}
        </div>

        {/* Goal Size Setting Controls */}
        <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <Goal className="w-4 h-4 text-sky-400" />
            <span>골대 크기:</span>
            <span className="font-mono text-sky-400 font-bold">{goalSize}px</span>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-xs">
            <input
              type="range"
              min={MIN_GOAL_SIZE}
              max={MAX_GOAL_SIZE}
              step={10}
              value={goalSize}
              onChange={(e) => onUpdateGoalSize(Number(e.target.value))}
              className="w-full accent-sky-500"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdateGoalSize(160)}
              className={`px-2 py-0.5 rounded text-[11px] ${
                goalSize === 160 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              소형 160px
            </button>
            <button
              onClick={() => onUpdateGoalSize(240)}
              className={`px-2 py-0.5 rounded text-[11px] ${
                goalSize === 240 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              보통 240px
            </button>
            <button
              onClick={() => onUpdateGoalSize(320)}
              className={`px-2 py-0.5 rounded text-[11px] ${
                goalSize === 320 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              대형 320px
            </button>
          </div>
        </div>
      </div>

      {/* SVG Outline for the Active Playing Area (Screen court or Camera mapped court) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {(() => {
          const c0 = `${activeCorners[0].x * 100}% ${activeCorners[0].y * 100}%`;
          const c1 = `${activeCorners[1].x * 100}% ${activeCorners[1].y * 100}%`;
          const c2 = `${activeCorners[2].x * 100}% ${activeCorners[2].y * 100}%`;
          const c3 = `${activeCorners[3].x * 100}% ${activeCorners[3].y * 100}%`;

          // Mid points for center line
          const topMidX = ((activeCorners[0].x + activeCorners[1].x) / 2) * 100;
          const topMidY = ((activeCorners[0].y + activeCorners[1].y) / 2) * 100;
          const botMidX = ((activeCorners[3].x + activeCorners[2].x) / 2) * 100;
          const botMidY = ((activeCorners[3].y + activeCorners[2].y) / 2) * 100;

          // Goal Coordinates based on dynamic goalFraction
          const leftGoalTopX = (activeCorners[0].x * (1 - postTopFraction) + activeCorners[3].x * postTopFraction) * 100;
          const leftGoalTopY = (activeCorners[0].y * (1 - postTopFraction) + activeCorners[3].y * postTopFraction) * 100;
          const leftGoalBotX = (activeCorners[0].x * (1 - postBotFraction) + activeCorners[3].x * postBotFraction) * 100;
          const leftGoalBotY = (activeCorners[0].y * (1 - postBotFraction) + activeCorners[3].y * postBotFraction) * 100;

          const rightGoalTopX = (activeCorners[1].x * (1 - postTopFraction) + activeCorners[2].x * postTopFraction) * 100;
          const rightGoalTopY = (activeCorners[1].y * (1 - postTopFraction) + activeCorners[2].y * postTopFraction) * 100;
          const rightGoalBotX = (activeCorners[1].x * (1 - postBotFraction) + activeCorners[2].x * postBotFraction) * 100;
          const rightGoalBotY = (activeCorners[1].y * (1 - postBotFraction) + activeCorners[2].y * postBotFraction) * 100;

          return (
            <>
              {/* Field polygon */}
              <polygon
                points={`${c0}, ${c1}, ${c2}, ${c3}`}
                fill={step === 'SCREEN_COURT' ? '#ffffff' : 'rgba(56, 189, 248, 0.15)'}
                stroke={step === 'SCREEN_COURT' ? '#334155' : '#38bdf8'}
                strokeWidth={step === 'SCREEN_COURT' ? 4 : 3}
                strokeDasharray={step === 'SCREEN_COURT' ? 'none' : '6 4'}
              />

              {/* Center dividing line */}
              <line
                x1={`${topMidX}%`}
                y1={`${topMidY}%`}
                x2={`${botMidX}%`}
                y2={`${botMidY}%`}
                stroke={step === 'SCREEN_COURT' ? '#94a3b8' : '#38bdf8'}
                strokeWidth="2"
                strokeDasharray="4 4"
              />

              {/* Left Goal marker (Safe Steel Blue) */}
              <line
                x1={`${leftGoalTopX}%`}
                y1={`${leftGoalTopY}%`}
                x2={`${leftGoalBotX}%`}
                y2={`${leftGoalBotY}%`}
                stroke="#0284c7"
                strokeWidth="10"
                strokeLinecap="round"
              />

              {/* Right Goal marker (Safe Forest Teal) */}
              <line
                x1={`${rightGoalTopX}%`}
                y1={`${rightGoalTopY}%`}
                x2={`${rightGoalBotX}%`}
                y2={`${rightGoalBotY}%`}
                stroke="#0d9488"
                strokeWidth="10"
                strokeLinecap="round"
              />
            </>
          );
        })()}
      </svg>

      {/* 4 Draggable Handles with Percentage Positioning */}
      {activeCorners.map((corner, idx) => {
        const isTarget = step === 'CAMERA_MATCH' && cameraClickIndex === idx;
        const color = CORNER_COLORS[idx];

        return (
          <div
            key={idx}
            onPointerDown={(e) => handleCornerHandleStart(idx, e)}
            style={{
              left: `${corner.x * 100}%`,
              top: `${corner.y * 100}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-grab active:cursor-grabbing group z-50"
          >
            {isTarget && (
              <div
                className="absolute -inset-4 rounded-full animate-ping opacity-75"
                style={{ backgroundColor: color }}
              />
            )}

            <div
              className="w-10 h-10 rounded-full border-2 border-white flex items-center justify-center font-bold text-xs text-white shadow-xl transition-transform group-hover:scale-110 active:scale-95"
              style={{ backgroundColor: color }}
            >
              {idx + 1}
            </div>

            <div className="absolute top-11 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900/90 text-[11px] font-medium text-white whitespace-nowrap border border-slate-700 shadow-md">
              {['좌상단', '우상단', '우하단', '좌하단'][idx]}
            </div>
          </div>
        );
      })}

      {/* Mini Reference Card in Step 2: Shows the corresponding Screen Point currently being clicked */}
      {step === 'CAMERA_MATCH' && (
        <div className="absolute bottom-4 left-4 z-50 bg-slate-900/90 border border-slate-700 p-3 rounded-xl shadow-xl backdrop-blur-md pointer-events-auto text-xs text-slate-200 flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">현재 매칭 중인 점</span>
            <span className="font-bold text-white text-sm">
              {cameraClickIndex < 4 ? CORNER_NAMES[cameraClickIndex] : '모든 점 매핑 완료!'}
            </span>
          </div>
          <button
            onClick={() => setStep('SCREEN_COURT')}
            className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 rounded-md text-sky-400 hover:text-sky-300 font-medium transition-colors"
          >
            ← 화면 영역 수정
          </button>
        </div>
      )}
    </div>
  );
};
