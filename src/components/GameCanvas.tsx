import React, { useRef, useEffect } from 'react';
import {
  FourCorners,
  GamePhase,
  MatchScore,
  Particle,
  PuckState,
  RobotState,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  PUCK_RADIUS,
  LiveGameState,
} from '../types/hockey';
import { PerspectiveTransformer } from '../utils/perspective';

interface GameCanvasProps {
  normalizedCorners: FourCorners;
  gamePhase: GamePhase;
  score: MatchScore;
  timeLeft?: number;
  blueRobot: RobotState;
  redRobot: RobotState;
  puck: PuckState;
  particles: Particle[];
  liveStateRef?: React.MutableRefObject<LiveGameState>;
  goalAnnouncement: { team: 'blue' | 'red'; countdown: number } | null;
  isVirtualMode: boolean;
  onOpenSettings?: () => void;
  onUpdateVirtualRobot: (team: 'blue' | 'red', x: number, y: number) => void;
  onCanvasClickForColorPick?: (normX: number, normY: number) => void;
  isPickingColor: boolean;
  containerWidth: number;
  containerHeight: number;
  goalSize?: number;
}

export const GameCanvas: React.FC<GameCanvasProps> = (props) => {
  const {
    normalizedCorners,
    containerWidth,
    containerHeight,
    isPickingColor,
    isVirtualMode,
    onCanvasClickForColorPick,
    onUpdateVirtualRobot,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<GameCanvasProps>(props);
  propsRef.current = props;

  const pixelCorners: FourCorners = [
    { x: normalizedCorners[0].x * containerWidth, y: normalizedCorners[0].y * containerHeight },
    { x: normalizedCorners[1].x * containerWidth, y: normalizedCorners[1].y * containerHeight },
    { x: normalizedCorners[2].x * containerWidth, y: normalizedCorners[2].y * containerHeight },
    { x: normalizedCorners[3].x * containerWidth, y: normalizedCorners[3].y * containerHeight },
  ];

  const transformerRef = useRef<PerspectiveTransformer>(new PerspectiveTransformer(pixelCorners));

  useEffect(() => {
    transformerRef.current.updateCorners(pixelCorners);
  }, [normalizedCorners, containerWidth, containerHeight]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (isPickingColor && onCanvasClickForColorPick) {
      onCanvasClickForColorPick(clientX / rect.width, clientY / rect.height);
      return;
    }

    if (isVirtualMode) {
      const tablePt = transformerRef.current.screenToTable(clientX, clientY);
      if (tablePt.x < TABLE_WIDTH / 2) {
        onUpdateVirtualRobot('blue', tablePt.x, tablePt.y);
      } else {
        onUpdateVirtualRobot('red', tablePt.x, tablePt.y);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isVirtualMode || e.buttons !== 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const tablePt = transformerRef.current.screenToTable(clientX, clientY);
    if (tablePt.x < TABLE_WIDTH / 2) {
      onUpdateVirtualRobot('blue', tablePt.x, tablePt.y);
    } else {
      onUpdateVirtualRobot('red', tablePt.x, tablePt.y);
    }
  };

  // High-performance continuous render loop (60-144 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const currentProps = propsRef.current;
      const live = currentProps.liveStateRef?.current;
      const blueRobot = live ? live.blueRobot : currentProps.blueRobot;
      const redRobot = live ? live.redRobot : currentProps.redRobot;
      const puck = live ? live.puck : currentProps.puck;
      const { score, goalAnnouncement, goalSize = 240, gamePhase, timeLeft = 0 } = currentProps;

      const width = canvas.width;
      const height = canvas.height;
      const tf = transformerRef.current;

      const isGameOver = gamePhase === 'TIME_UP';
      const isReadyPhase = gamePhase === 'READY' || gamePhase === 'CALIBRATION';
      const showGoals = !isReadyPhase; // [REQ] 대기 중에는 골대 없음 (경기장 모습만)

      // 1. [REQ] Pure Deep Black Projector Background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const c = pixelCorners;
      ctx.save();

      // [REQ] 게임 종료시 메인은 회색 비활성화 된 느낌으로 (색을 전부 빼)
      if (isGameOver) {
        ctx.filter = 'grayscale(100%) brightness(0.65)';
      }

      // 2. Table Playing Surface (Dark Charcoal/Black for Projector)
      ctx.beginPath();
      ctx.moveTo(c[0].x, c[0].y);
      ctx.lineTo(c[1].x, c[1].y);
      ctx.lineTo(c[2].x, c[2].y);
      ctx.lineTo(c[3].x, c[3].y);
      ctx.closePath();
      ctx.fillStyle = '#05070a';
      ctx.fill();

      // 3. [REQ] Field Boundary Lines in Crisp WHITE
      const lineColor = isGameOver ? '#52525b' : '#ffffff';
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Top rail
      ctx.beginPath();
      ctx.moveTo(c[0].x, c[0].y);
      ctx.lineTo(c[1].x, c[1].y);
      ctx.stroke();

      // Bottom rail
      ctx.beginPath();
      ctx.moveTo(c[3].x, c[3].y);
      ctx.lineTo(c[2].x, c[2].y);
      ctx.stroke();

      const goalHalf = goalSize / 2;
      const leftTop = tf.tableToScreen(0, 0);
      const leftBot = tf.tableToScreen(0, TABLE_HEIGHT);
      const rightTop = tf.tableToScreen(TABLE_WIDTH, 0);
      const rightBot = tf.tableToScreen(TABLE_WIDTH, TABLE_HEIGHT);

      if (!showGoals) {
        // [REQ] 대기 상태: 골대 없이 양쪽 벽면이 닫힌 완전한 경기장 라인만 표시
        ctx.beginPath();
        ctx.moveTo(leftTop.x, leftTop.y);
        ctx.lineTo(leftBot.x, leftBot.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightTop.x, rightTop.y);
        ctx.lineTo(rightBot.x, rightBot.y);
        ctx.stroke();
      } else {
        // 경기 진행/득점 중: 골대 입구 및 골포스트 렌더링
        const leftGoalPostTop = tf.tableToScreen(0, TABLE_HEIGHT / 2 - goalHalf);
        const leftGoalPostBot = tf.tableToScreen(0, TABLE_HEIGHT / 2 + goalHalf);
        const rightGoalPostTop = tf.tableToScreen(TABLE_WIDTH, TABLE_HEIGHT / 2 - goalHalf);
        const rightGoalPostBot = tf.tableToScreen(TABLE_WIDTH, TABLE_HEIGHT / 2 + goalHalf);

        // Left End Wall (Blue Goal Side)
        ctx.beginPath();
        ctx.moveTo(leftTop.x, leftTop.y);
        ctx.lineTo(leftGoalPostTop.x, leftGoalPostTop.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(leftGoalPostBot.x, leftGoalPostBot.y);
        ctx.lineTo(leftBot.x, leftBot.y);
        ctx.stroke();

        // Right End Wall (Red Goal Side)
        ctx.beginPath();
        ctx.moveTo(rightTop.x, rightTop.y);
        ctx.lineTo(rightGoalPostTop.x, rightGoalPostTop.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightGoalPostBot.x, rightGoalPostBot.y);
        ctx.lineTo(rightBot.x, rightBot.y);
        ctx.stroke();

        // Left Goal Net Outline
        ctx.strokeStyle = isGameOver ? '#71717a' : '#38bdf8';
        ctx.lineWidth = 5;
        ctx.beginPath();
        const leftNetBack = tf.tableToScreen(-35, TABLE_HEIGHT / 2);
        ctx.moveTo(leftGoalPostTop.x, leftGoalPostTop.y);
        ctx.quadraticCurveTo(leftNetBack.x, leftNetBack.y, leftGoalPostBot.x, leftGoalPostBot.y);
        ctx.stroke();

        // Right Goal Net Outline
        ctx.strokeStyle = isGameOver ? '#71717a' : '#f87171';
        ctx.lineWidth = 5;
        ctx.beginPath();
        const rightNetBack = tf.tableToScreen(TABLE_WIDTH + 35, TABLE_HEIGHT / 2);
        ctx.moveTo(rightGoalPostTop.x, rightGoalPostTop.y);
        ctx.quadraticCurveTo(rightNetBack.x, rightNetBack.y, rightGoalPostBot.x, rightGoalPostBot.y);
        ctx.stroke();
      }

      // 4. [REQ] Center Line & Face-off Circle in Crisp WHITE
      ctx.strokeStyle = isGameOver ? '#3f3f46' : 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);

      const centerTop = tf.tableToScreen(TABLE_WIDTH / 2, 0);
      const centerBot = tf.tableToScreen(TABLE_WIDTH / 2, TABLE_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(centerTop.x, centerTop.y);
      ctx.lineTo(centerBot.x, centerBot.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center Circle Outline
      ctx.strokeStyle = isGameOver ? '#3f3f46' : 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const circleRadius = 110;
      const circleSegments = 36;
      for (let i = 0; i <= circleSegments; i++) {
        const theta = (i / circleSegments) * Math.PI * 2;
        const pt = tf.tableToScreen(
          TABLE_WIDTH / 2 + Math.cos(theta) * circleRadius,
          TABLE_HEIGHT / 2 + Math.sin(theta) * circleRadius
        );
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // 5. [REQ] 시계도 중앙에 크게 회색으로 (Big Gray Center Clock)
      const centerPt = tf.tableToScreen(TABLE_WIDTH / 2, TABLE_HEIGHT / 2 - 24);
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      ctx.save();
      ctx.translate(centerPt.x, centerPt.y);
      ctx.font = '900 52px monospace, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isGameOver ? '#52525b' : 'rgba(156, 163, 175, 0.55)'; // 큰 회색
      ctx.fillText(formattedTime, 0, 0);

      if (isGameOver) {
        ctx.font = '800 22px system-ui, sans-serif';
        ctx.fillStyle = '#71717a';
        ctx.fillText('GAME OVER', 0, 48);
      }
      ctx.restore();

      // 6. [REQ] 점수는 크게 회색으로 (네모 박스 ㄴㄴ, 중앙 근처에)
      // Blue Score (왼쪽, 중앙선 근처)
      const blueScorePt = tf.tableToScreen(TABLE_WIDTH / 2 - 130, TABLE_HEIGHT / 2 + 10);
      ctx.save();
      ctx.translate(blueScorePt.x, blueScorePt.y);
      ctx.font = '900 96px monospace, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isGameOver ? '#3f3f46' : 'rgba(156, 163, 175, 0.45)'; // 네모 박스 없는 거대 회색
      ctx.fillText(String(score.blue), 0, 0);
      ctx.restore();

      // Red Score (오른쪽, 중앙선 근처)
      const redScorePt = tf.tableToScreen(TABLE_WIDTH / 2 + 130, TABLE_HEIGHT / 2 + 10);
      ctx.save();
      ctx.translate(redScorePt.x, redScorePt.y);
      ctx.font = '900 96px monospace, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isGameOver ? '#3f3f46' : 'rgba(156, 163, 175, 0.45)'; // 네모 박스 없는 거대 회색
      ctx.fillText(String(score.red), 0, 0);
      ctx.restore();

      // 7. [REQ] Robot Paddle Position (Clean simple rings/dots)
      renderPaddle(ctx, tf, blueRobot, '#38bdf8', isGameOver);
      renderPaddle(ctx, tf, redRobot, '#f87171', isGameOver);

      // 8. [REQ] Virtual Puck (공 주변 효과 완전히 지우고 깔끔한 심플 원반만 렌더링)
      if (!isGameOver || gamePhase === 'TIME_UP') {
        renderCleanPuckNoEffects(ctx, tf, puck, isGameOver);
      }

      // 9. Goal Announcement Overlay (Clean banner if scored)
      if (goalAnnouncement && !isGameOver) {
        renderGoalOverlay(ctx, tf, goalAnnouncement);
      }

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [containerWidth, containerHeight, isPickingColor, isVirtualMode]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none touch-none bg-black">
      <canvas
        ref={canvasRef}
        width={containerWidth}
        height={containerHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className={`w-full h-full object-contain ${
          isPickingColor ? 'cursor-crosshair' : isVirtualMode ? 'cursor-pointer' : 'cursor-default'
        }`}
      />
    </div>
  );
};

// Helper: Clean Paddle Indicator
function renderPaddle(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  robot: RobotState,
  color: string,
  isGameOver: boolean
) {
  if (!robot.detected && Date.now() - robot.lastSeenTime > 500) return;
  const screenPos = tf.tableToScreen(robot.tableX, robot.tableY);

  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);

  // Outer ring
  ctx.strokeStyle = isGameOver ? '#71717a' : color;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.stroke();

  // Core dot
  ctx.fillStyle = isGameOver ? '#52525b' : color;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Helper: Render Virtual Puck WITH ZERO EXTRA EFFECTS (공 주변 효과 지우기)
function renderCleanPuckNoEffects(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  puck: PuckState,
  isGameOver: boolean
) {
  const screenPos = tf.tableToScreen(puck.x, puck.y);
  const offsetPos = tf.tableToScreen(puck.x + puck.radius, puck.y);
  const screenRadius = Math.max(12, Math.hypot(offsetPos.x - screenPos.x, offsetPos.y - screenPos.y));

  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);

  // Main Puck Solid Body
  ctx.fillStyle = isGameOver ? '#404040' : '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, 0, screenRadius, 0, Math.PI * 2);
  ctx.fill();

  // Clean boundary rim
  ctx.strokeStyle = isGameOver ? '#262626' : '#94a3b8';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Inner center ring
  ctx.strokeStyle = isGameOver ? '#52525b' : '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, screenRadius * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// Helper: Clean Goal Overlay (Dual Facing for Table)
function renderGoalOverlay(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  announcement: { team: 'blue' | 'red'; countdown: number }
) {
  const isBlue = announcement.team === 'blue';
  const color = isBlue ? '#38bdf8' : '#f87171';
  const teamText = isBlue ? '청팀 득점 (GOAL)!' : '적팀 득점 (GOAL)!';

  const centerPt = tf.tableToScreen(TABLE_WIDTH / 2, TABLE_HEIGHT / 2 + 55);

  ctx.save();
  ctx.translate(centerPt.x, centerPt.y);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-130, -38, 260, 76, 16);
  ctx.fill();
  ctx.stroke();

  ctx.font = '900 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('GOAL!!', 0, -10);

  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(teamText, 0, 18);

  ctx.restore();
}
