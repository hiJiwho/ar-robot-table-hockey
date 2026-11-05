import React, { useRef, useEffect } from 'react';
import {
  FourCorners,
  GamePhase,
  PuckState,
  RobotState,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  LiveGameState,
} from '../types/hockey';
import { PerspectiveTransformer } from '../utils/perspective';

interface GameCanvasProps {
  normalizedCorners: FourCorners;
  gamePhase: GamePhase;
  blueRobot: RobotState;
  redRobot: RobotState;
  puck: PuckState;
  liveStateRef?: React.MutableRefObject<LiveGameState>;
  containerWidth: number;
  containerHeight: number;
  goalSize?: number;
  theme?: 'dark' | 'light';
}

export const GameCanvas: React.FC<GameCanvasProps> = (props) => {
  const {
    normalizedCorners,
    containerWidth,
    containerHeight,
    theme = 'dark',
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
      const { goalSize = 260, gamePhase, theme = 'dark' } = currentProps;

      const width = canvas.width;
      const height = canvas.height;
      const tf = transformerRef.current;

      const isLight = theme === 'light';
      const isGameOver = gamePhase === 'TIME_UP';
      const isReadyPhase = gamePhase === 'READY' || gamePhase === 'CALIBRATION';
      const showGoals = !isReadyPhase; // 대기 중에는 골대 없음 (벽면만 닫힌 경기장 모습)

      // Theme color palette
      const bgColor = isLight ? '#ffffff' : '#000000';
      const tableFill = isLight ? '#f8fafc' : '#020408';
      const primaryLine = isGameOver
        ? (isLight ? '#94a3b8' : '#3f3f46')
        : (isLight ? '#0f172a' : '#ffffff');
      const secondaryLine = isGameOver
        ? (isLight ? '#cbd5e1' : '#27272a')
        : (isLight ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.55)');

      // 1. Clear Viewport Background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      const c = pixelCorners;
      ctx.save();

      // 2. Table Playing Surface (Dark/Light)
      ctx.beginPath();
      ctx.moveTo(c[0].x, c[0].y);
      ctx.lineTo(c[1].x, c[1].y);
      ctx.lineTo(c[2].x, c[2].y);
      ctx.lineTo(c[3].x, c[3].y);
      ctx.closePath();
      ctx.fillStyle = tableFill;
      ctx.fill();

      // 3. Pro Air Hockey Table Perimeter Rails (Rounded Corner Boundary)
      ctx.strokeStyle = primaryLine;
      ctx.lineWidth = 5;
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
        // [REQ] 대기 모드: 골대 없이 양쪽 벽면이 닫힌 완전한 경기장 라인만 표시
        ctx.beginPath();
        ctx.moveTo(leftTop.x, leftTop.y);
        ctx.lineTo(leftBot.x, leftBot.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightTop.x, rightTop.y);
        ctx.lineTo(rightBot.x, rightBot.y);
        ctx.stroke();
      } else {
        // 게임 진행 중: 골대 포스트 및 골 입구
        const leftGoalPostTop = tf.tableToScreen(0, TABLE_HEIGHT / 2 - goalHalf);
        const leftGoalPostBot = tf.tableToScreen(0, TABLE_HEIGHT / 2 + goalHalf);
        const rightGoalPostTop = tf.tableToScreen(TABLE_WIDTH, TABLE_HEIGHT / 2 - goalHalf);
        const rightGoalPostBot = tf.tableToScreen(TABLE_WIDTH, TABLE_HEIGHT / 2 + goalHalf);

        // Left End Walls
        ctx.beginPath();
        ctx.moveTo(leftTop.x, leftTop.y);
        ctx.lineTo(leftGoalPostTop.x, leftGoalPostTop.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(leftGoalPostBot.x, leftGoalPostBot.y);
        ctx.lineTo(leftBot.x, leftBot.y);
        ctx.stroke();

        // Right End Walls
        ctx.beginPath();
        ctx.moveTo(rightTop.x, rightTop.y);
        ctx.lineTo(rightGoalPostTop.x, rightGoalPostTop.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightGoalPostBot.x, rightGoalPostBot.y);
        ctx.lineTo(rightBot.x, rightBot.y);
        ctx.stroke();

        // Left Goal Post Net Arc
        ctx.strokeStyle = primaryLine;
        ctx.lineWidth = 4;
        ctx.beginPath();
        const leftNetBack = tf.tableToScreen(-45, TABLE_HEIGHT / 2);
        ctx.moveTo(leftGoalPostTop.x, leftGoalPostTop.y);
        ctx.quadraticCurveTo(leftNetBack.x, leftNetBack.y, leftGoalPostBot.x, leftGoalPostBot.y);
        ctx.stroke();

        // Right Goal Post Net Arc
        ctx.beginPath();
        const rightNetBack = tf.tableToScreen(TABLE_WIDTH + 45, TABLE_HEIGHT / 2);
        ctx.moveTo(rightGoalPostTop.x, rightGoalPostTop.y);
        ctx.quadraticCurveTo(rightNetBack.x, rightNetBack.y, rightGoalPostBot.x, rightGoalPostBot.y);
        ctx.stroke();

        // Goal Crease Semi-Circles (골대 앞 반원 수비 구역)
        ctx.strokeStyle = secondaryLine;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 5]);

        // Left Crease
        ctx.beginPath();
        const creaseRadius = goalHalf + 25;
        for (let i = -16; i <= 16; i++) {
          const theta = (i / 16) * (Math.PI / 2);
          const pt = tf.tableToScreen(
            Math.cos(theta) * creaseRadius,
            TABLE_HEIGHT / 2 + Math.sin(theta) * creaseRadius
          );
          if (i === -16) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();

        // Right Crease
        ctx.beginPath();
        for (let i = -16; i <= 16; i++) {
          const theta = (i / 16) * (Math.PI / 2);
          const pt = tf.tableToScreen(
            TABLE_WIDTH - Math.cos(theta) * creaseRadius,
            TABLE_HEIGHT / 2 + Math.sin(theta) * creaseRadius
          );
          if (i === -16) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 4. Center Line (중앙 분할선)
      ctx.strokeStyle = primaryLine;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      const centerTop = tf.tableToScreen(TABLE_WIDTH / 2, 0);
      const centerBot = tf.tableToScreen(TABLE_WIDTH / 2, TABLE_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(centerTop.x, centerTop.y);
      ctx.lineTo(centerBot.x, centerBot.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 5. Center Face-off Circle (페이스오프 서클)
      ctx.strokeStyle = primaryLine;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const circleRadius = 120;
      const circleSegments = 40;
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

      // Center Spot Dot (중심점)
      const centerPt = tf.tableToScreen(TABLE_WIDTH / 2, TABLE_HEIGHT / 2);
      ctx.fillStyle = primaryLine;
      ctx.beginPath();
      ctx.arc(centerPt.x, centerPt.y, 7, 0, Math.PI * 2);
      ctx.fill();

      // 6. Face-off Dots (양 진영 페이스오프 스팟 마커)
      const spotOffsetX = 220;
      const spotOffsetY = 160;
      const faceOffSpots = [
        { x: TABLE_WIDTH / 2 - spotOffsetX, y: TABLE_HEIGHT / 2 - spotOffsetY },
        { x: TABLE_WIDTH / 2 - spotOffsetX, y: TABLE_HEIGHT / 2 + spotOffsetY },
        { x: TABLE_WIDTH / 2 + spotOffsetX, y: TABLE_HEIGHT / 2 - spotOffsetY },
        { x: TABLE_WIDTH / 2 + spotOffsetX, y: TABLE_HEIGHT / 2 + spotOffsetY },
      ];
      ctx.strokeStyle = secondaryLine;
      ctx.lineWidth = 2;
      for (const spot of faceOffSpots) {
        const screenPt = tf.tableToScreen(spot.x, spot.y);
        ctx.beginPath();
        ctx.arc(screenPt.x, screenPt.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 7. [REQ] 말 (패들 / 스트라이커) - 실제 에어하키 말 형태의 깔끔한 디자인
      renderRealisticMal(ctx, tf, blueRobot, isLight, isGameOver);
      renderRealisticMal(ctx, tf, redRobot, isLight, isGameOver);

      // 8. [REQ] 공 (퍽) - 순수 원형 스포츠 퍽
      renderRealisticPuck(ctx, tf, puck, isLight, isGameOver);

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [containerWidth, containerHeight]);

  return (
    <div className={`relative w-full h-full overflow-hidden select-none touch-none ${theme === 'light' ? 'bg-white' : 'bg-black'}`}>
      <canvas
        ref={canvasRef}
        width={containerWidth}
        height={containerHeight}
        className="w-full h-full block"
      />
    </div>
  );
};

// [REQ] 실제 에어하키 "말 (Striker/Mal)" 디자인
function renderRealisticMal(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  robot: RobotState,
  isLight: boolean,
  isGameOver: boolean
) {
  if (!robot.detected && Date.now() - robot.lastSeenTime > 500) return;
  const screenPos = tf.tableToScreen(robot.tableX, robot.tableY);
  const outerRadius = 32;

  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);

  const primary = isGameOver
    ? '#52525b'
    : isLight
    ? '#0f172a'
    : '#f8fafc';
  const rimFill = isGameOver
    ? 'rgba(82, 82, 91, 0.25)'
    : isLight
    ? 'rgba(15, 23, 42, 0.12)'
    : 'rgba(255, 255, 255, 0.18)';
  const knobFill = isGameOver
    ? '#3f3f46'
    : isLight
    ? '#1e293b'
    : '#ffffff';

  // 1. Base Outer Flange (말 밑판)
  ctx.fillStyle = rimFill;
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = primary;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // 2. Inner Ring
  ctx.strokeStyle = primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius * 0.65, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Center Handle Knob (말 손잡이)
  ctx.fillStyle = knobFill;
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius * 0.38, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = primary;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

// [REQ] 실제 에어하키 "공 (Puck)" 디자인
function renderRealisticPuck(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  puck: PuckState,
  isLight: boolean,
  isGameOver: boolean
) {
  const screenPos = tf.tableToScreen(puck.x, puck.y);
  const offsetPos = tf.tableToScreen(puck.x + (puck.radius || 20), puck.y);
  const screenRadius = Math.max(14, Math.hypot(offsetPos.x - screenPos.x, offsetPos.y - screenPos.y));

  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);

  const puckBody = isGameOver
    ? '#3f3f46'
    : isLight
    ? '#e11d48' // 라이트 모드에서는 강렬한 레드 퍽
    : '#ffffff'; // 다크(프로젝터) 모드에서는 선명한 화이트 퍽

  const puckBorder = isGameOver
    ? '#27272a'
    : isLight
    ? '#9f1239'
    : '#cbd5e1';

  // Outer Body
  ctx.fillStyle = puckBody;
  ctx.beginPath();
  ctx.arc(0, 0, screenRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = puckBorder;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Center Dimple Ring
  ctx.strokeStyle = isLight ? '#ffffff' : '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, screenRadius * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
