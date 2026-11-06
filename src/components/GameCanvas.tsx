import React, { useRef, useEffect } from 'react';
import {
  FourCorners,
  GamePhase,
  MatchScore,
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
  score?: MatchScore;
  timeLeft?: number;
  blueRobot: RobotState;
  redRobot: RobotState;
  puck: PuckState;
  liveStateRef?: React.MutableRefObject<LiveGameState>;
  containerWidth: number;
  containerHeight: number;
  goalSize?: number;
  theme?: 'dark' | 'light';
  isVirtualMode?: boolean;
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
      const {
        goalSize = 260,
        gamePhase,
        theme = 'dark',
        score = { blue: 0, red: 0 },
        timeLeft = 60,
      } = currentProps;

      const width = canvas.width;
      const height = canvas.height;
      const tf = transformerRef.current;

      const isLight = theme === 'light';
      const isGameOver = gamePhase === 'TIME_UP';
      const isReadyPhase = gamePhase === 'READY' || gamePhase === 'CALIBRATION_SCREEN' || gamePhase === 'CALIBRATION_CAMERA';
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

        // Left Goal Post Net Arc (Cyan 팀)
        ctx.strokeStyle = isGameOver ? primaryLine : '#06b6d4';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const leftNetBack = tf.tableToScreen(-45, TABLE_HEIGHT / 2);
        ctx.moveTo(leftGoalPostTop.x, leftGoalPostTop.y);
        ctx.quadraticCurveTo(leftNetBack.x, leftNetBack.y, leftGoalPostBot.x, leftGoalPostBot.y);
        ctx.stroke();

        // Right Goal Post Net Arc (Yellow 팀)
        ctx.strokeStyle = isGameOver ? primaryLine : '#eab308';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const rightNetBack = tf.tableToScreen(TABLE_WIDTH + 45, TABLE_HEIGHT / 2);
        ctx.moveTo(rightGoalPostTop.x, rightGoalPostTop.y);
        ctx.quadraticCurveTo(rightNetBack.x, rightNetBack.y, rightGoalPostBot.x, rightGoalPostBot.y);
        ctx.stroke();

        // Goal Crease Semi-Circles (골대 앞 반원 수비 구역: 좌측 Cyan, 우측 Yellow)
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 5]);

        // Left Crease (Cyan)
        ctx.strokeStyle = isGameOver ? secondaryLine : 'rgba(6, 182, 212, 0.75)';
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

        // Right Crease (Yellow)
        ctx.strokeStyle = isGameOver ? secondaryLine : 'rgba(234, 179, 8, 0.75)';
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

      // Center Spot Dot (중심점: 페이스오프 정중앙)
      const centerPt = tf.tableToScreen(TABLE_WIDTH / 2, TABLE_HEIGHT / 2);
      ctx.fillStyle = primaryLine;
      ctx.beginPath();
      ctx.arc(centerPt.x, centerPt.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // [REQ 3] 메인 시계위치 상단으로 올려!
      // 경기장 상단 중앙 HUD 타이머 디스플레이
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      const topClockPt = tf.tableToScreen(TABLE_WIDTH / 2, 56);

      ctx.save();
      ctx.translate(topClockPt.x, topClockPt.y);

      // 타이머 배경 캡슐 배지
      ctx.fillStyle = isLight ? 'rgba(241, 245, 249, 0.85)' : 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = isLight ? 'rgba(148, 163, 184, 0.6)' : 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 2;
      const badgeW = 160;
      const badgeH = 48;
      ctx.beginPath();
      ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 24);
      ctx.fill();
      ctx.stroke();

      // 타이머 글자 (선명한 네온 디지털 폰트)
      ctx.font = '900 34px monospace, "Courier New", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!isGameOver) {
        ctx.shadowColor = isLight ? 'rgba(2, 132, 199, 0.4)' : 'rgba(56, 189, 248, 0.7)';
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = isGameOver
        ? (isLight ? '#94a3b8' : '#64748b')
        : (timeLeft <= 10
            ? (isLight ? '#dc2626' : '#f87171')
            : (isLight ? '#0369a1' : '#38bdf8'));
      ctx.fillText(timeStr, 0, 1);
      ctx.restore();

      // [REQ] Left (1P) Score Number - 각자 진영(왼쪽)으로 더 내리고(이동), 90도 회전 (+90deg), 초대형 230px Ultra-Bold Cyan
      const p1ScorePt = tf.tableToScreen(TABLE_WIDTH / 2 - 270, TABLE_HEIGHT / 2);
      ctx.save();
      ctx.translate(p1ScorePt.x, p1ScorePt.y);
      ctx.rotate(Math.PI / 2); // 1P 골대 쪽에 선 사람이 똑바로 보이도록 90도 회전
      ctx.font = '900 230px "Arial Black", Impact, -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!isGameOver) {
        ctx.shadowColor = isLight ? 'rgba(6, 182, 212, 0.6)' : 'rgba(34, 211, 238, 0.75)';
        ctx.shadowBlur = 18;
      }
      ctx.fillStyle = isGameOver
        ? (isLight ? '#cbd5e1' : '#3f3f46')
        : (isLight ? 'rgba(6, 182, 212, 0.90)' : 'rgba(34, 211, 238, 0.95)');
      ctx.fillText(String(score.blue), 0, 0);
      ctx.restore();

      // [REQ] Right (2P) Score Number - 각자 진영(오른쪽)으로 더 내리고(이동), -90도 회전 (-90deg), 초대형 230px Ultra-Bold Yellow
      const p2ScorePt = tf.tableToScreen(TABLE_WIDTH / 2 + 270, TABLE_HEIGHT / 2);
      ctx.save();
      ctx.translate(p2ScorePt.x, p2ScorePt.y);
      ctx.rotate(-Math.PI / 2); // 2P 골대 쪽에 선 사람이 똑바로 보이도록 -90도 회전
      ctx.font = '900 230px "Arial Black", Impact, -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!isGameOver) {
        ctx.shadowColor = isLight ? 'rgba(234, 179, 8, 0.6)' : 'rgba(250, 204, 21, 0.75)';
        ctx.shadowBlur = 18;
      }
      ctx.fillStyle = isGameOver
        ? (isLight ? '#cbd5e1' : '#3f3f46')
        : (isLight ? 'rgba(202, 138, 4, 0.92)' : 'rgba(250, 204, 21, 0.95)');
      ctx.fillText(String(score.red), 0, 0);
      ctx.restore();

      // 6. Face-off Dots (양 진영 페이스오프 스팟: 좌측 Cyan, 우측 Yellow)
      const spotOffsetX = 220;
      const spotOffsetY = 160;
      const faceOffSpots = [
        { x: TABLE_WIDTH / 2 - spotOffsetX, y: TABLE_HEIGHT / 2 - spotOffsetY, team: 'blue' },
        { x: TABLE_WIDTH / 2 - spotOffsetX, y: TABLE_HEIGHT / 2 + spotOffsetY, team: 'blue' },
        { x: TABLE_WIDTH / 2 + spotOffsetX, y: TABLE_HEIGHT / 2 - spotOffsetY, team: 'red' },
        { x: TABLE_WIDTH / 2 + spotOffsetX, y: TABLE_HEIGHT / 2 + spotOffsetY, team: 'red' },
      ];
      ctx.lineWidth = 2.5;
      for (const spot of faceOffSpots) {
        ctx.strokeStyle = isGameOver
          ? secondaryLine
          : spot.team === 'blue'
          ? '#06b6d4'
          : '#eab308';
        const screenPt = tf.tableToScreen(spot.x, spot.y);
        ctx.beginPath();
        ctx.arc(screenPt.x, screenPt.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 7. [REQ] "그 패들에 는 색 붙이지 말아줘!"
      // 실제 손에 든 패들/레고블록 위에 프로젝터 빛이 덮어씌워지지 않도록 메인 경기장에서 패들 색상 원형 투사를 완전 비활성화.
      // (가상 봇 모드일 때만 마우스 위치 확인용으로 은은하게 표시)
      if (currentProps.isVirtualMode) {
        renderRealisticMal(ctx, tf, blueRobot, isLight, isGameOver);
        renderRealisticMal(ctx, tf, redRobot, isLight, isGameOver);
      }

      // 8. [REQ] 공 (퍽) - 순수 원형 스포츠 퍽
      renderRealisticPuck(ctx, tf, puck, isLight, isGameOver);

      // 9. GOAL Text Overlay (득점 시 심플한 투사)
      if (gamePhase === 'GOAL') {
        const goalBannerPt = tf.tableToScreen(TABLE_WIDTH / 2, TABLE_HEIGHT / 2 + 75);
        ctx.save();
        ctx.translate(goalBannerPt.x, goalBannerPt.y);
        ctx.font = '900 36px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isLight ? '#e11d48' : '#38bdf8';
        ctx.fillText('GOAL!!', 0, 0);
        ctx.restore();
      }

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

// [REQ] 실제 에어하키 "말 (Striker/Mal)" 디자인: 중앙 기준 좌측 Cyan, 우측 Yellow
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
  const isCyan = robot.team === 'blue';

  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);

  // [REQ] 경기장에서도 Cyan, Yellow 표시 (게임 종료 시에는 무채색 회색으로 비활성화)
  const primary = isGameOver
    ? '#52525b'
    : isCyan
    ? '#22d3ee'
    : '#facc15';

  const rimFill = isGameOver
    ? 'rgba(82, 82, 91, 0.25)'
    : isCyan
    ? 'rgba(6, 182, 212, 0.35)'
    : 'rgba(234, 179, 8, 0.35)';

  const knobFill = isGameOver
    ? '#3f3f46'
    : isCyan
    ? '#0891b2'
    : '#ca8a04';

  const innerRingColor = isGameOver
    ? '#52525b'
    : isCyan
    ? '#67e8f9'
    : '#fde047';

  // 1. Base Outer Flange (말 밑판)
  ctx.fillStyle = rimFill;
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = primary;
  ctx.lineWidth = 4;
  ctx.stroke();

  // 2. Inner Ring
  ctx.strokeStyle = innerRingColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius * 0.65, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Center Handle Knob (말 손잡이)
  ctx.fillStyle = knobFill;
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius * 0.40, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
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
    ? '#e11d48'
    : '#ffffff';

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
