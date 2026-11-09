import React, { useState, useEffect } from 'react';
import { Trophy, RotateCcw, Zap, Target, Crosshair, QrCode, ExternalLink } from 'lucide-react';
import { MatchScore, MatchStats } from '../types/hockey';
import { generateAIPlayerReport, generateQRCode, AIPlayerReport } from '../utils/aiAnalytics';

interface GameOverModalProps {
  isOpen: boolean;
  score: MatchScore;
  stats: MatchStats;
  onRestart: () => void;
  onRecalibrate: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  score,
  stats,
  onRestart,
  onRecalibrate,
}) => {
  const [blueReport, setBlueReport] = useState<AIPlayerReport | null>(null);
  const [redReport, setRedReport] = useState<AIPlayerReport | null>(null);
  const [blueQr, setBlueQr] = useState<string>('');
  const [redQr, setRedQr] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    // Run 100% Local Lightweight AI Scout Analytics (Zero Cost, No Gemini/Cloud API)
    const report1 = generateAIPlayerReport('blue', score, stats);
    const report2 = generateAIPlayerReport('red', score, stats);
    setBlueReport(report1);
    setRedReport(report2);

    // Generate dual QR codes for 1P and 2P
    generateQRCode(report1.reportUrl, '#0284c7', '#ffffff').then(setBlueQr);
    generateQRCode(report2.reportUrl, '#d97706', '#ffffff').then(setRedQr);
  }, [isOpen, score, stats]);

  if (!isOpen) return null;

  const winner: 'blue' | 'red' | 'draw' =
    score.blue > score.red
      ? 'blue'
      : score.red > score.blue
      ? 'red'
      : 'draw';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-xl p-6 shadow-2xl text-center space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Trophy & Winner Title */}
        <div className="space-y-1.5">
          <div className="w-14 h-14 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center shadow-lg">
            <Trophy
              className={`w-7 h-7 ${
                winner === 'blue'
                  ? 'text-cyan-400'
                  : winner === 'red'
                  ? 'text-yellow-400'
                  : 'text-amber-400'
              }`}
            />
          </div>

          <h2 className="text-2xl font-black tracking-tight text-white">
            {winner === 'blue' && <span className="text-cyan-400">Cyan 팀 승리!</span>}
            {winner === 'red' && <span className="text-yellow-400">Yellow 팀 승리!</span>}
            {winner === 'draw' && <span className="text-amber-400">무승부 (동점)!</span>}
          </h2>

          <p className="text-xs text-slate-400">
            정규 경기가 종료되었습니다. 아래 QR을 스마트폰으로 스캔하여 개인 AI 리포트를 확인하세요!
          </p>
        </div>

        {/* Final Scoreboard */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
          <div className="text-center">
            <div className="text-xs font-bold text-cyan-400">Cyan 팀 (1P)</div>
            <div className="font-mono text-3xl font-extrabold text-cyan-300 tabular-nums">
              {score.blue}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">유효타 {stats.blueHits}회</div>
          </div>

          <div className="text-center">
            <div className="text-xs font-bold text-yellow-400">Yellow 팀 (2P)</div>
            <div className="font-mono text-3xl font-extrabold text-yellow-300 tabular-nums">
              {score.red}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">유효타 {stats.redHits}회</div>
          </div>
        </div>

        {/* [REQ] 1P, 2P 양끝 AI 모바일 분석 QR 코드 공유 섹션 */}
        <div className="grid grid-cols-2 gap-4 text-left">
          {/* 1P Cyan Card & QR */}
          <div className="p-3.5 bg-slate-950/90 rounded-2xl border border-cyan-500/40 flex flex-col items-center text-center space-y-2">
            <div className="flex items-center justify-between w-full px-1">
              <span className="text-xs font-extrabold text-cyan-400">1P Cyan 리포트</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-bold">
                {blueReport?.grade || 'S'}
              </span>
            </div>

            <div className="text-xs font-black text-slate-200">
              {blueReport?.badge} {blueReport?.title}
            </div>
            {blueReport?.growthBadge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-bold">
                {blueReport.growthBadge}
              </span>
            )}

            {blueQr ? (
              <div className="p-2 bg-white rounded-xl shadow-md border-2 border-cyan-400/80">
                <img src={blueQr} alt="1P AI Report QR" className="w-28 h-28 object-contain" />
              </div>
            ) : (
              <div className="w-28 h-28 bg-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-500">
                QR 생성 중...
              </div>
            )}

            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              <span>1P 폰 카메라로 스캔</span>
            </div>

            {blueReport?.reportUrl && (
              <a
                href={blueReport.reportUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-cyan-400/90 hover:underline flex items-center gap-1 pt-0.5"
              >
                <span>웹에서 바로보기</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>

          {/* 2P Yellow Card & QR */}
          <div className="p-3.5 bg-slate-950/90 rounded-2xl border border-yellow-500/40 flex flex-col items-center text-center space-y-2">
            <div className="flex items-center justify-between w-full px-1">
              <span className="text-xs font-extrabold text-yellow-400">2P Yellow 리포트</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-950 text-yellow-300 border border-yellow-800/60 font-bold">
                {redReport?.grade || 'S'}
              </span>
            </div>

            <div className="text-xs font-black text-slate-200">
              {redReport?.badge} {redReport?.title}
            </div>
            {redReport?.growthBadge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-950/80 border border-yellow-500/30 text-yellow-300 font-bold">
                {redReport.growthBadge}
              </span>
            )}

            {redQr ? (
              <div className="p-2 bg-white rounded-xl shadow-md border-2 border-yellow-400/80">
                <img src={redQr} alt="2P AI Report QR" className="w-28 h-28 object-contain" />
              </div>
            ) : (
              <div className="w-28 h-28 bg-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-500">
                QR 생성 중...
              </div>
            )}

            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <QrCode className="w-3.5 h-3.5 text-yellow-400" />
              <span>2P 폰 카메라로 스캔</span>
            </div>

            {redReport?.reportUrl && (
              <a
                href={redReport.reportUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-yellow-400/90 hover:underline flex items-center gap-1 pt-0.5"
              >
                <span>웹에서 바로보기</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>새 경기 시작</span>
          </button>

          <button
            onClick={onRecalibrate}
            className="w-full py-2 px-4 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>경기장 캘리브레이션 재설정</span>
          </button>
        </div>
      </div>
    </div>
  );
};
