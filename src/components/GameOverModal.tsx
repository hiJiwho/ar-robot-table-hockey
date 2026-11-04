import React from 'react';
import { Trophy, RotateCcw, Zap, Target, Crosshair } from 'lucide-react';
import { MatchScore, MatchStats } from '../types/hockey';

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
  if (!isOpen) return null;

  const winner: 'blue' | 'red' | 'draw' =
    score.blue > score.red
      ? 'blue'
      : score.red > score.blue
      ? 'red'
      : 'draw';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md p-6 shadow-2xl text-center space-y-6">
        {/* Trophy & Winner Title */}
        <div className="space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center shadow-lg">
            <Trophy
              className={`w-8 h-8 ${
                winner === 'blue'
                  ? 'text-blue-400'
                  : winner === 'red'
                  ? 'text-red-400'
                  : 'text-amber-400'
              }`}
            />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white">
            {winner === 'blue' && <span className="text-blue-400">청팀 (Blue) 승리!</span>}
            {winner === 'red' && <span className="text-red-400">적팀 (Red) 승리!</span>}
            {winner === 'draw' && <span className="text-amber-400">무승부 (동점)!</span>}
          </h2>

          <p className="text-xs text-slate-400">
            총 1분(60초) 정규 경기가 종료되었습니다.
          </p>
        </div>

        {/* Final Scoreboard */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950/80 rounded-xl border border-slate-800">
          <div className="text-center">
            <div className="text-xs font-semibold text-blue-400 mb-1">청팀 (Blue)</div>
            <div className="font-mono text-4xl font-bold text-blue-300 tabular-nums">
              {score.blue}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">유효타 {stats.blueHits}회</div>
          </div>

          <div className="text-center">
            <div className="text-xs font-semibold text-red-400 mb-1">적팀 (Red)</div>
            <div className="font-mono text-4xl font-bold text-red-300 tabular-nums">
              {score.red}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">유효타 {stats.redHits}회</div>
          </div>
        </div>

        {/* Match Records */}
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800/80 flex items-center gap-3">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">최고 퍽 속도</div>
              <div className="font-mono text-sm font-semibold text-slate-200 tabular-nums">
                {Math.round(stats.maxPuckSpeed)} px/s
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800/80 flex items-center gap-3">
            <Target className="w-4 h-4 text-sky-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">총 랠리 타격</div>
              <div className="font-mono text-sm font-semibold text-slate-200 tabular-nums">
                {stats.blueHits + stats.redHits}회
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>새 1분 매치 시작</span>
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
