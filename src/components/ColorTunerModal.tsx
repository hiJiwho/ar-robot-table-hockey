import React from 'react';
import { X, Pipette, RotateCcw, Eye, Cpu, Zap, SlidersHorizontal, Sparkles } from 'lucide-react';
import { ColorSettings, VisionEngineType } from '../types/hockey';
import { DEFAULT_COLOR_SETTINGS } from '../utils/vision';

interface ColorTunerModalProps {
  settings: ColorSettings;
  isOpen: boolean;
  isPickingColor: boolean;
  onClose: () => void;
  onUpdateSettings: (settings: ColorSettings) => void;
  onStartColorPick: () => void;
  debugCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export const ColorTunerModal: React.FC<ColorTunerModalProps> = ({
  settings,
  isOpen,
  isPickingColor,
  onClose,
  onUpdateSettings,
  onStartColorPick,
  debugCanvasRef,
}) => {
  if (!isOpen) return null;

  const handleReset = () => {
    onUpdateSettings({ ...DEFAULT_COLOR_SETTINGS });
  };

  const handleEngineChange = (engine: VisionEngineType) => {
    onUpdateSettings({
      ...settings,
      visionEngine: engine,
    });
  };

  const handleSensitivityChange = (val: number) => {
    onUpdateSettings({
      ...settings,
      sensitivity: val,
    });
  };

  const handleFilterChange = (
    key: 'hMin' | 'hMax' | 'sMin' | 'sMax' | 'vMin' | 'vMax',
    value: number
  ) => {
    onUpdateSettings({
      ...settings,
      magenta: {
        ...settings.magenta,
        [key]: value,
      },
    });
  };

  const handleClearSample = () => {
    onUpdateSettings({
      ...settings,
      customSample: null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">비전 인식 엔진 & 마커 감도 설정</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                빔프로젝터 투사광 및 조도 환경에 맞춰 최적의 컴퓨터 비전 엔진을 선택합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Eyedropper Notice if picking */}
          {isPickingColor && (
            <div className="p-3 bg-pink-950/80 border border-pink-500 rounded-xl flex items-center gap-3 text-pink-200 text-xs shadow-lg animate-pulse">
              <Pipette className="w-5 h-5 text-pink-400 shrink-0 animate-bounce" />
              <div>
                <strong>마젠타 블록 색상 스포이트 모드:</strong> 우측 상단 실시간 카메라 모니터 또는 화면 속 마젠타 블록을 클릭하면 색상이 즉시 학습됩니다.
              </div>
            </div>
          )}

          {/* 1. Vision Engine Selection */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              인식 엔진 선택 (Vision Recognition Engine)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleEngineChange('OPENCV')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  (settings.visionEngine || 'OPENCV') === 'OPENCV'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-md'
                    : 'bg-slate-800/40 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-emerald-300">OpenCV (opencv.js)</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">기본</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  진짜 OpenCV(WASM): HSV 마스크 + 모폴로지 + 컨투어. Node.js / Electron 모두 동작
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleEngineChange('CHROMATIC')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  settings.visionEngine === 'CHROMATIC'
                    ? 'bg-pink-600/20 border-pink-500 text-white shadow-md'
                    : 'bg-slate-800/40 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-pink-300">스마트 크로마틱</span>
                  <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded font-mono">추천</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  빔프로젝터 투사광 반사 및 조도 변화에 매우 강함 (OpenCV 지수 방식)
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleEngineChange('YCRCB')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  settings.visionEngine === 'YCRCB'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/40 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-indigo-300">YCrCb 채도 분리</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono">OpenCV</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  밝기(Y)와 색차(Cr, Cb)를 완벽히 분리하여 그림자 간섭 최소화
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleEngineChange('HSV')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  settings.visionEngine === 'HSV'
                    ? 'bg-sky-600/20 border-sky-500 text-white shadow-md'
                    : 'bg-slate-800/40 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-sky-300">적응형 HSV</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  색조, 채도, 명도 기반 수동 세부 슬라이더 튜닝 모드
                </p>
              </button>
            </div>
          </div>

          {/* 2. Sensitivity Slider */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                인식 감도 레벨 (Sensitivity):
              </span>
              <span className="font-bold text-pink-400">
                Level {settings.sensitivity || 3} ({['매우 엄격', '엄격', '표준(권장)', '민감', '초광대역'][Math.min(4, Math.max(0, (settings.sensitivity || 3) - 1))]})
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={settings.sensitivity || 3}
              onChange={(e) => handleSensitivityChange(Number(e.target.value))}
              className="accent-pink-500 w-full"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>1 (오인식 방지)</span>
              <span>3 (표준 추천)</span>
              <span>5 (빛바램/어두움 대응)</span>
            </div>
          </div>

          {/* [REQ] 암실 / 불 끈 환경 최적화 토글 (설정에 이거 인식용 하나 넣어주면 ㄱㅅ) */}
          <div className="p-4 bg-purple-950/30 rounded-xl border border-purple-800/60 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-semibold text-xs text-purple-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                🌙 암실 / 불 끈 환경 최적화 (저조도 모드)
              </span>
              <p className="text-[11px] text-slate-400">
                실내 조명을 끈 어두운 방이나 프로젝터 전용 환경에서 마젠타 감도와 명암비를 자동 증폭합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, lowLightMode: !settings.lowLightMode })}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                settings.lowLightMode
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)] border border-purple-400'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
              }`}
            >
              {settings.lowLightMode ? 'ON (활성화)' : 'OFF'}
            </button>
          </div>

          {/* 3. Real-time Vision Mask PIP Preview */}
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-sky-400" />
                실시간 감지 마스크 (분홍색 = 엔진이 인식 중인 픽셀)
              </span>
              <button
                onClick={onStartColorPick}
                className="px-2.5 py-1 text-xs font-medium bg-pink-600 hover:bg-pink-500 text-white rounded-md transition-colors flex items-center gap-1 shadow-sm"
              >
                <Pipette className="w-3.5 h-3.5" />
                <span>스포이드로 색상 찍기</span>
              </button>
            </div>
            <div className="relative aspect-video max-h-48 rounded-lg overflow-hidden border border-slate-800 bg-black flex items-center justify-center">
              <canvas
                ref={debugCanvasRef}
                width={320}
                height={180}
                className="w-full h-full object-contain"
              />
            </div>

            {/* Custom Sample Pill if calibrated */}
            {settings.customSample && (
              <div className="mt-2.5 flex items-center justify-between p-2 rounded-lg bg-pink-950/40 border border-pink-700/50 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full border border-white/50 shadow-sm"
                    style={{ backgroundColor: settings.customSample.hex }}
                  />
                  <span className="text-pink-200">
                    학습된 색상: <strong className="font-mono">{settings.customSample.hex}</strong>
                  </span>
                </div>
                <button
                  onClick={handleClearSample}
                  className="text-[11px] text-slate-400 hover:text-white underline"
                >
                  학습 해제
                </button>
              </div>
            )}
          </div>

          {/* 4. Fine-tuning HSV sliders (Always accessible, but prioritized when in HSV mode) */}
          <details className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-4">
            <summary className="text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200">
              고급 색상(HSV) 및 픽셀 크기 세부 파라미터 펼치기...
            </summary>
            <div className="pt-3 space-y-3">
              {/* Hue Range */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">색상(Hue) 범위:</span>
                  <span className="font-mono text-pink-400">
                    {settings.magenta.hMin}° ~ {settings.magenta.hMax}°
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={settings.magenta.hMin}
                    onChange={(e) => handleFilterChange('hMin', Number(e.target.value))}
                    className="accent-pink-500 w-full"
                  />
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={settings.magenta.hMax}
                    onChange={(e) => handleFilterChange('hMax', Number(e.target.value))}
                    className="accent-pink-500 w-full"
                  />
                </div>
              </div>

              {/* Min Blob Size */}
              <div className="space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">최소 인식 픽셀 크기:</span>
                  <span className="font-mono text-pink-400">{settings.minBlobSize} px</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="40"
                  step="1"
                  value={settings.minBlobSize}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, minBlobSize: Number(e.target.value) })
                  }
                  className="accent-pink-500 w-full"
                />
              </div>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/70 border-t border-slate-800">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>기본값 초기화</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
};
