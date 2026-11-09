import React, { useRef, useEffect } from 'react';
import {
  FourCorners,
  GamePhase,
  MatchScore,
  PuckState,
  RobotState,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  CENTER_SPEAKER_RADIUS,
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

      // [REQ] "시계를 그리고 -90, 90도 돌리고 점수 아래, 골대에 서로 보이게 2개 넣는걸루 하자 (경기장에)"
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      const isUrgent = timeLeft <= 10 && !isGameOver;

      // =========================================================================
      // 1P 진영 (왼쪽): 점수 (+90도) & 점수 아래/골대 쪽 시계 (+90도)
      // =========================================================================
      // 1P 초대형 점수 (+90도)
      const p1ScorePt = tf.tableToScreen(TABLE_WIDTH / 2 - 230, TABLE_HEIGHT / 2);
      ctx.save();
      ctx.translate(p1ScorePt.x, p1ScorePt.y);
      ctx.rotate(Math.PI / 2); // 1P 골대 쪽에 선 사람이 똑바로 보이도록 +90도 회전
      ctx.font = '900 220px "Arial Black", Impact, -apple-system, system-ui, sans-serif';
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

      // 1P 시계 (점수 아래, 골대 쪽, +90도 회전)
      const p1ClockPt = tf.tableToScreen(TABLE_WIDTH / 2 - 375, TABLE_HEIGHT / 2);
      ctx.save();
      ctx.translate(p1ClockPt.x, p1ClockPt.y);
      ctx.rotate(Math.PI / 2); // 1P 플레이어 시선에 맞춰 +90도 회전

      // 타이머 배경 HUD 캡슐
      ctx.fillStyle = isLight ? 'rgba(241, 245, 249, 0.90)' : 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = isGameOver
        ? (isLight ? '#94a3b8' : '#475569')
        : isUrgent
        ? '#ef4444'
        : (isLight ? '#06b6d4' : '#22d3ee');
      ctx.lineWidth = 3;
      const clockW = 150;
      const clockH = 46;
      ctx.beginPath();
      ctx.roundRect(-clockW / 2, -clockH / 2, clockW, clockH, 23);
      ctx.fill();
      ctx.stroke();

      // 타이머 글자 (선명한 네온 디지털 폰트)
      ctx.font = '900 32px monospace, "Courier New", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!isGameOver) {
        ctx.shadowColor = isUrgent ? '#ef4444' : (isLight ? '#0891b2' : '#22d3ee');
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = isGameOver
        ? (isLight ? '#94a3b8' : '#64748b')
        : isUrgent
        ? '#ef4444'
        : (isLight ? '#0891b2' : '#22d3ee');
      ctx.fillText(timeStr, 0, 1);
      ctx.restore();

      // =========================================================================
      // 2P 진영 (오른쪽): 점수 (-90도) & 점수 아래/골대 쪽 시계 (-90도)
      // =========================================================================
      // 2P 초대형 점수 (-90도)
      const p2ScorePt = tf.tableToScreen(TABLE_WIDTH / 2 + 230, TABLE_HEIGHT / 2);
      ctx.save();
      ctx.translate(p2ScorePt.x, p2ScorePt.y);
      ctx.rotate(-Math.PI / 2); // 2P 골대 쪽에 선 사람이 똑바로 보이도록 -90도 회전
      ctx.font = '900 220px "Arial Black", Impact, -apple-system, system-ui, sans-serif';
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

      // 2P 시계 (점수 아래, 골대 쪽, -90도 회전)
      const p2ClockPt = tf.tableToScreen(TABLE_WIDTH / 2 + 375, TABLE_HEIGHT / 2);
      ctx.save();
      ctx.translate(p2ClockPt.x, p2ClockPt.y);
      ctx.rotate(-Math.PI / 2); // 2P 플레이어 시선에 맞춰 -90도 회전

      // 타이머 배경 HUD 캡슐
      ctx.fillStyle = isLight ? 'rgba(241, 245, 249, 0.90)' : 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = isGameOver
        ? (isLight ? '#94a3b8' : '#475569')
        : isUrgent
        ? '#ef4444'
        : (isLight ? '#ca8a04' : '#facc15');
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-clockW / 2, -clockH / 2, clockW, clockH, 23);
      ctx.fill();
      ctx.stroke();

      // 타이머 글자 (선명한 네온 디지털 폰트)
      ctx.font = '900 32px monospace, "Courier New", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!isGameOver) {
        ctx.shadowColor = isUrgent ? '#ef4444' : (isLight ? '#ca8a04' : '#facc15');
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = isGameOver
        ? (isLight ? '#94a3b8' : '#64748b')
        : isUrgent
        ? '#ef4444'
        : (isLight ? '#ca8a04' : '#facc15');
      ctx.fillText(timeStr, 0, 1);
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

      // 7.5. [REQ] 경기장 정가운데 실제 물리 스피커 존 (Acoustic Speaker Dock & Shockwave)
      renderCenterSpeakerZone(ctx, tf, isLight, isGameOver);

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

// [REQ] 경기장 정가운데 실제 물리 스피커 안착 링 & 음파 파동 렌더러
function renderCenterSpeakerZone(
  ctx: CanvasRenderingContext2D,
  tf: PerspectiveTransformer,
  isLight: boolean,
  isGameOver: boolean
) {
  const cx = TABLE_WIDTH / 2;
  const cy = TABLE_HEIGHT / 2;
  const centerPos = tf.tableToScreen(cx, cy);
  const edgePos = tf.tableToScreen(cx + CENTER_SPEAKER_RADIUS, cy);
  const screenRadius = Math.max(22, Math.hypot(edgePos.x - centerPos.x, edgePos.y - centerPos.y));

  ctx.save();
  ctx.translate(centerPos.x, centerPos.y);

  // 1. 은은한 사운드 웨이브 펄스 링 (서브우퍼 베이스 진동 효과)
  const time = Date.now() / 1000;
  const pulse = Math.sin(time * 3.5) * 0.5 + 0.5;
  const outerPulseR = screenRadius + 4 + pulse * 6;

  ctx.strokeStyle = isGameOver
    ? 'rgba(100, 116, 139, 0.25)'
    : isLight
    ? 'rgba(14, 165, 233, 0.35)'
    : 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, outerPulseR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. 스피커 안착 원형 가이드 라인 (Speaker Dock Guide Ring)
  ctx.strokeStyle = isGameOver
    ? '#475569'
    : isLight
    ? '#0284c7'
    : '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = isLight ? '#38bdf8' : '#0ea5e9';
  ctx.shadowBlur = isGameOver ? 0 : 8;

  ctx.beginPath();
  ctx.arc(0, 0, screenRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 3. 중심 스피커 마크 (음파 코어 아이콘)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isGameOver ? '#64748b' : (isLight ? '#0369a1' : '#7dd3fc');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, screenRadius * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = isGameOver ? '#64748b' : (isLight ? '#0284c7' : '#38bdf8');
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
