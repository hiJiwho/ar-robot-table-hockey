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
    onOpenSettings,
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

    // Clicking either end's large score badge opens settings
    const leftScoreScreen = transformerRef.current.tableToScreen(95, TABLE_HEIGHT / 2);
    const distLeftScore = Math.hypot(clientX - leftScoreScreen.x, clientY - leftScoreScreen.y);
    const rightScoreScreen = transformerRef.current.tableToScreen(TABLE_WIDTH - 95, TABLE_HEIGHT / 2);
    const distRightScore = Math.hypot(clientX - rightScoreScreen.x, clientY - rightScoreScreen.y);

    if ((distLeftScore <= 65 || distRightScore <= 65) && onOpenSettings) {
      onOpenSettings();
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

  // High-performance continuous render loop (Decoupled from React lifecycle for 60-144 FPS)
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
      const particles = live ? live.particles : currentProps.particles;
      const { score, goalAnnouncement, goalSize = 240 } = currentProps;

      const width = canvas.width;
      const height = canvas.height;
      const tf = transformerRef.current;

      // 1. Pure Crisp White Screen Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const c = pixelCorners;
      ctx.save();

      // 2. Table Playing Surface
      ctx.beginPath();
      ctx.moveTo(c[0].x, c[0].y);
      ctx.lineTo(c[1].x, c[1].y);
      ctx.lineTo(c[2].x, c[2].y);
      ctx.lineTo(c[3].x, c[3].y);
      ctx.closePath();
      ctx.fillStyle = '#f8fafc';
      ctx.fill();

      // 3. Desk Perimeter Rails (Clean dark slate borders)
      ctx.strokeStyle = '#334155';
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

      // Goal Opening Geometry
      const goalHalf = goalSize / 2;

      // Left End Wall & Posts (청팀 - Blue Goal):
      const leftTop = tf.tableToScreen(0, 0);
      const leftGoalPostTop = tf.tableToScreen(0, TABLE_HEIGHT / 2 - goalHalf);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(leftTop.x, leftTop.y);
      ctx.lineTo(leftGoalPostTop.x, leftGoalPostTop.y);
      ctx.stroke();

      const leftGoalPostBot = tf.tableToScreen(0, TABLE_HEIGHT / 2 + goalHalf);
      const leftBot = tf.tableToScreen(0, TABLE_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(leftGoalPostBot.x, leftGoalPostBot.y);
      ctx.lineTo(leftBot.x, leftBot.y);
      ctx.stroke();

      // Right End Wall & Posts (적팀 - Red Goal):
      const rightTop = tf.tableToScreen(TABLE_WIDTH, 0);
      const rightGoalPostTop = tf.tableToScreen(TABLE_WIDTH, TABLE_HEIGHT / 2 - goalHalf);
      ctx.beginPath();
      ctx.moveTo(rightTop.x, rightTop.y);
      ctx.lineTo(rightGoalPostTop.x, rightGoalPostTop.y);
      ctx.stroke();

      const rightGoalPostBot = tf.tableToScreen(TABLE_WIDTH, TABLE_HEIGHT / 2 + goalHalf);
      const rightBot = tf.tableToScreen(TABLE_WIDTH, TABLE_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(rightGoalPostBot.x, rightGoalPostBot.y);
      ctx.lineTo(rightBot.x, rightBot.y);
      ctx.stroke();

      // 4. Goal Arches & Nets in BLUE (청) and RED (적)
      // Left Goal Net (청골대 - Blue):
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 6;
      ctx.beginPath();
      const leftNetBack = tf.tableToScreen(-40, TABLE_HEIGHT / 2);
      ctx.moveTo(leftGoalPostTop.x, leftGoalPostTop.y);
      ctx.quadraticCurveTo(leftNetBack.x, leftNetBack.y, leftGoalPostBot.x, leftGoalPostBot.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(37, 99, 235, 0.10)';
      ctx.fill();

      // Goal post highlights (Blue caps)
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(leftGoalPostTop.x, leftGoalPostTop.y, 6, 0, Math.PI * 2);
      ctx.arc(leftGoalPostBot.x, leftGoalPostBot.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Right Goal Net (적골대 - Red):
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 6;
      ctx.beginPath();
      const rightNetBack = tf.tableToScreen(TABLE_WIDTH + 40, TABLE_HEIGHT / 2);
      ctx.moveTo(rightGoalPostTop.x, rightGoalPostTop.y);
      ctx.quadraticCurveTo(rightNetBack.x, rightNetBack.y, rightGoalPostBot.x, rightGoalPostBot.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220, 38, 38, 0.10)';
      ctx.fill();

      // Goal post highlights (Red caps)
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.arc(rightGoalPostTop.x, rightGoalPostTop.y, 6, 0, Math.PI * 2);
      ctx.arc(rightGoalPostBot.x, rightGoalPostBot.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // 5. Center Line & Face-off Circle (Clean Field without any center clock)
      ctx.strokeStyle = '#94a3b8';
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
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const circleRadius = 90;
      const circleSegments = 32;
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

      // Center Face-Off Spot Dot
      const centerPt = tf.tableToScreen(TABLE_WIDTH / 2, TABLE_HEIGHT / 2);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(centerPt.x, centerPt.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // 6. [REQ] GIANT END SCORES: ONLY MY SCORE (상대 골에 넣은 점수) VERY LARGE AT EACH END
      const isBlueGoal = goalAnnouncement?.team === 'blue';
      const isRedGoal = goalAnnouncement?.team === 'red';

      // 6-A. Left End (Blue Player End): ONLY Blue's own score ("매우 크게", rotated 90deg facing Left Player)
      const leftScorePt = tf.tableToScreen(95, TABLE_HEIGHT / 2);
      ctx.save();
      ctx.translate(leftScorePt.x, leftScorePt.y);
      ctx.rotate(Math.PI / 2);
      renderLargeEndScore(ctx, 'blue', score.blue, isBlueGoal);
      ctx.restore();

      // 6-B. Right End (Red Player End): ONLY Red's own score ("매우 크게", rotated -90deg facing Right Player)
      const rightScorePt = tf.tableToScreen(TABLE_WIDTH - 95, TABLE_HEIGHT / 2);
      ctx.save();
      ctx.translate(rightScorePt.x, rightScorePt.y);
      ctx.rotate(-Math.PI / 2);
      renderLargeEndScore(ctx, 'red', score.red, isRedGoal);
      ctx.restore();

      // 7. [REQ] ROBOT POSITION: CLEAN TRACKING DOTS ONLY ("검정 마커 빼고 점으로만 표시")
      renderCleanTrackingDot(ctx, tf, blueRobot);
      renderCleanTrackingDot(ctx, tf, redRobot);

      // 8. Render Virtual Puck & Trail
      renderCleanPuck(ctx, tf, puck);

      // 9. Render Spark Particles
      for (const p of particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 10. [REQ] DUAL-FACING CENTER GOAL BANNER: Visible & upright from BOTH player ends
      if (goalAnnouncement) {
        renderDualGoalBanner(ctx, tf, goalAnnouncement);
      }

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [containerWidth, containerHeight, isPickingColor, isVirtualMode]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none touch-none bg-white">
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

// Helper: Render Giant Player Score at each end (Only that player's own score, VERY LARGE)
function renderLargeEndScore(
  ctx: CanvasRenderingContext2D,
  team: 'blue' | 'red',
  playerScore: number,
  isScoredNow: boolean
) {
  const isBlue = team === 'blue';
  const color = isBlue ? '#2563eb' : '#dc2626';
  const textColor = isBlue ? '#1e3a8a' : '#7f1d1d';
  const labelText = isBlue ? '청 (BLUE)' : '적 (RED)';

  ctx.save();

  // Clean, high-impact scoreboard plate
  ctx.shadowColor = isScoredNow
    ? isBlue
      ? 'rgba(37, 99, 235, 0.45)'
      : 'rgba(220, 38, 38, 0.45)'
    : 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = isScoredNow ? 24 : 10;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = isScoredNow
    ? isBlue
      ? 'rgba(37, 99, 235, 0.12)'
      : 'rgba(220, 38, 38, 0.12)'
    : 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = isScoredNow ? color : '#cbd5e1';
  ctx.lineWidth = isScoredNow ? 3.5 : 2;
  ctx.beginPath();
  ctx.roundRect(-56, -64, 112, 128, 20);
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = 'transparent';

  // Team tag at top
  ctx.font = '800 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(labelText, 0, -44);

  // Very Large Score Number ("매우 크게")
  ctx.font = '900 82px monospace, sans-serif';
  ctx.fillStyle = textColor;
  ctx.fillText(String(playerScore), 0, 10);

  // Goal celebration indicator badge
  if (isScoredNow) {
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText('+1 GOAL!', 0, 50);
  }

  ctx.restore();
}

// Helper: Render Clean Minimal Tracking Dot ("검정 마커 빼고 점으로만 표시")
function renderCleanTrackingDot(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  robot: RobotState
) {
  if (!robot.detected && Date.now() - robot.lastSeenTime > 500) return;
  const screenPos = tf.tableToScreen(robot.tableX, robot.tableY);

  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);

  // Soft drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.arc(1.5, 2, 8, 0, Math.PI * 2);
  ctx.fill();

  // Solid black tracking dot
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.fill();

  // Subtle platinum center pinpoint for clean precision tracking
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Helper: Render Virtual Puck on White Background
function renderCleanPuck(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  puck: PuckState
) {
  // Trail (Only render when moving to avoid tremor)
  const puckSpeed = Math.hypot(puck.vx, puck.vy);
  if (puckSpeed > 35 && puck.trail && puck.trail.length > 1) {
    for (let i = 0; i < puck.trail.length; i++) {
      const pt = puck.trail[i];
      if (Math.hypot(pt.x - puck.x, pt.y - puck.y) < 4) continue;
      const screenPt = tf.tableToScreen(pt.x, pt.y);
      const alpha = pt.alpha * (i / puck.trail.length) * 0.30;

      ctx.fillStyle = `rgba(15, 23, 42, ${alpha})`;
      ctx.beginPath();
      ctx.arc(screenPt.x, screenPt.y, 5 * (i / puck.trail.length) + 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Puck Main Body
  const screenPos = tf.tableToScreen(puck.x, puck.y);
  const offsetPos = tf.tableToScreen(puck.x + puck.radius, puck.y);
  const screenRadius = Math.max(10, Math.hypot(offsetPos.x - screenPos.x, offsetPos.y - screenPos.y));

  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);

  // Drop shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.30)';
  ctx.beginPath();
  ctx.ellipse(3, 5, screenRadius * 1.1, screenRadius * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  // Charcoal Black Sports Puck
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, screenRadius, 0, Math.PI * 2);
  ctx.fill();

  // Silver Rim
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Inner Core
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(0, 0, screenRadius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // White gleam reflection
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(-screenRadius * 0.3, -screenRadius * 0.3, screenRadius * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Helper: Render Dual-Facing Goal Banner in the center of the field so BOTH players can read it upright
function renderDualGoalBanner(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  announcement: { team: 'blue' | 'red'; countdown: number }
) {
  const isBlue = announcement.team === 'blue';
  const color = isBlue ? '#2563eb' : '#dc2626';
  const teamText = isBlue ? '청팀 득점 (GOAL)!!' : '적팀 득점 (GOAL)!!';
  const nextServeText = `다음 서브까지 ${announcement.countdown.toFixed(1)}초`;

  const bannerW = 210;
  const bannerH = 76;
  const halfW = bannerW / 2;
  const halfH = bannerH / 2;

  // Single card drawer
  const drawCard = () => {
    ctx.save();
    ctx.shadowColor = isBlue ? 'rgba(37, 99, 235, 0.5)' : 'rgba(220, 38, 38, 0.5)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 2;

    // Card background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfH, bannerW, bannerH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';

    // Title GOAL!
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GOAL!', 0, -18);

    // Team name
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.fillStyle = isBlue ? '#93c5fd' : '#fca5a5';
    ctx.fillText(teamText, 0, 8);

    // Next serve countdown
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(nextServeText, 0, 26);

    ctx.restore();
  };

  // 1. Facing Left Player (Placed left of center circle, rotated 90deg)
  const leftBannerPt = tf.tableToScreen(TABLE_WIDTH / 2 - 95, TABLE_HEIGHT / 2);
  ctx.save();
  ctx.translate(leftBannerPt.x, leftBannerPt.y);
  ctx.rotate(Math.PI / 2);
  drawCard();
  ctx.restore();

  // 2. Facing Right Player (Placed right of center circle, rotated -90deg)
  const rightBannerPt = tf.tableToScreen(TABLE_WIDTH / 2 + 95, TABLE_HEIGHT / 2);
  ctx.save();
  ctx.translate(rightBannerPt.x, rightBannerPt.y);
  ctx.rotate(-Math.PI / 2);
  drawCard();
  ctx.restore();
}
