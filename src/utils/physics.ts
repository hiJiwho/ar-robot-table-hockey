import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  ROBOT_RADIUS,
  PUCK_RADIUS,
  CENTER_SPEAKER_RADIUS,
  PuckState,
  RobotState,
} from '../types/hockey';

export interface CollisionEvent {
  type: 'WALL' | 'POST' | 'ROBOT' | 'GOAL' | 'SPEAKER';
  x: number;
  y: number;
  team?: 'blue' | 'red' | 'obstacle';
  speed: number;
  combo?: number;
  multiplier?: number; // [REQ] 스피커 충돌 시 1.1 ~ 3.0배 가속 배율
}

export interface PhysicsStepResult {
  puck: PuckState;
  events: CollisionEvent[];
}

/**
 * Professional Air Hockey Physics Engine
 * - Multi-substep continuous collision detection (CCD) to eliminate tunneling & sticking
 * - Center Speaker Bounce: 퍽이 테이블 정가운데 놓인 실제 물리 스피커에 닿으면 튕겨나감
 * - Dynamic Tracking: 1P/2P 마젠타 플레이어(2개 고정) 및 시안 장애물 로봇(0..10개) 모두와 실시간 물리 충돌
 */
export function stepPuckPhysics(
  currPuck: PuckState,
  allRobots: RobotState[],
  goalSize: number,
  dt: number
): PhysicsStepResult {
  const events: CollisionEvent[] = [];

  // Limit max dt to avoid simulation blowout
  const clampedDt = Math.min(0.04, Math.max(0.001, dt));
  // 8 sub-steps per frame guarantees rock-solid continuous collision detection (CCD)
  const SUB_STEPS = 8;
  const subDt = clampedDt / SUB_STEPS;

  let px = currPuck.x;
  let py = currPuck.y;
  let pvx = currPuck.vx;
  let pvy = currPuck.vy;
  let spin = currPuck.spin || 0;
  let angle = currPuck.angle || 0;
  let superCharged = Boolean(currPuck.superCharged);
  let speakerBoostUntil = currPuck.speakerBoostUntil || 0;
  let speakerMultiplier = currPuck.speakerMultiplier || 1.0;
  let rallyCount = currPuck.rallyCount || 0;
  let lastHitTeam = currPuck.lastHitTeam;

  const r = currPuck.radius || PUCK_RADIUS;
  const goalHalf = goalSize / 2;
  const postTop = TABLE_HEIGHT / 2 - goalHalf;
  const postBottom = TABLE_HEIGHT / 2 + goalHalf;
  const postRadius = 10; // Rounded post caps

  for (let step = 0; step < SUB_STEPS; step++) {
    // 1. Magnus Spin Curve Force (F_magnus perpendicular to velocity)
    if (Math.abs(spin) > 0.05) {
      const magnusFactor = 0.22;
      const ax = -spin * pvy * magnusFactor;
      const ay = spin * pvx * magnusFactor;
      pvx += ax * subDt;
      pvy += ay * subDt;
      spin *= 0.9985; // Gradual spin decay
      angle += spin * subDt;
    }

    // 2. Position Integration
    px += pvx * subDt;
    py += pvy * subDt;

    // 3. Air Cushion Drag (자연스럽게 조작 가능한 쾌적한 감속 계수)
    pvx *= 0.9995;
    pvy *= 0.9995;

    // 4. [REQ] 상하 벽면(Top & Bottom Cushion Rails): 역동적인 대각선 반사각 유지하되 편안한 속도감
    const RAIL_RESTITUTION = 0.98;
    if (py - r < 0) {
      py = r + 0.5;
      const incomingSpeed = Math.hypot(pvx, pvy);
      const curSpeed = Math.max(incomingSpeed * RAIL_RESTITUTION, 340);

      // [REQ] 뚜렷하고 역동적인 대각선 반사각 (32도 ~ 58도) 부여
      const diagAngleDeg = 32 + Math.random() * 26;
      const rad = (diagAngleDeg * Math.PI) / 180;
      const dirX = pvx !== 0 ? Math.sign(pvx) : (Math.random() < 0.5 ? 1 : -1);

      pvx = dirX * Math.cos(rad) * curSpeed + spin * 8;
      pvy = Math.sin(rad) * curSpeed;
      spin = spin * 0.55 + (Math.random() < 0.5 ? 1 : -1) * 3.0;

      events.push({ type: 'WALL', x: px, y: py, speed: Math.hypot(pvx, pvy) });
    } else if (py + r > TABLE_HEIGHT) {
      py = TABLE_HEIGHT - r - 0.5;
      const incomingSpeed = Math.hypot(pvx, pvy);
      const curSpeed = Math.max(incomingSpeed * RAIL_RESTITUTION, 340);

      const diagAngleDeg = 32 + Math.random() * 26;
      const rad = (diagAngleDeg * Math.PI) / 180;
      const dirX = pvx !== 0 ? Math.sign(pvx) : (Math.random() < 0.5 ? 1 : -1);

      pvx = dirX * Math.cos(rad) * curSpeed - spin * 8;
      pvy = -Math.sin(rad) * curSpeed;
      spin = spin * 0.55 + (Math.random() < 0.5 ? 1 : -1) * 3.0;

      events.push({ type: 'WALL', x: px, y: py, speed: Math.hypot(pvx, pvy) });
    }

    // 5. Goal Posts (Rounded Corner Bounces)
    const checkPostBounce = (postX: number, postY: number) => {
      const dx = px - postX;
      const dy = py - postY;
      const dist = Math.hypot(dx, dy);
      const minD = r + postRadius;
      if (dist < minD && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        px = postX + nx * minD;
        py = postY + ny * minD;
        const vDotN = pvx * nx + pvy * ny;
        if (vDotN < 0) {
          pvx -= 1.95 * vDotN * nx;
          pvy -= 1.95 * vDotN * ny;
          events.push({ type: 'POST', x: px, y: py, speed: Math.hypot(pvx, pvy) });
        }
      }
    };

    checkPostBounce(0, postTop);
    checkPostBounce(0, postBottom);
    checkPostBounce(TABLE_WIDTH, postTop);
    checkPostBounce(TABLE_WIDTH, postBottom);

    // 6. Left End Wall & Blue Goal Mouth
    const inGoalMouthY = py >= postTop && py <= postBottom;
    if (px - r < 0) {
      if (inGoalMouthY) {
        if (px < -r * 1.35) {
          events.push({ type: 'GOAL', team: 'red', x: 0, y: py, speed: Math.hypot(pvx, pvy), combo: rallyCount });
          pvx = 0;
          pvy = 0;
          spin = 0;
          break;
        }
      } else {
        // [REQ] "벽 부딫치면 아에 대각선으로 튀게": 좌측 끝 벽면 충돌 시 코트 중앙 대각선 방향으로 방출
        px = r + 1;
        const curSpeed = Math.max(Math.hypot(pvx, pvy) * RAIL_RESTITUTION, 340);
        const diagAngleDeg = 32 + Math.random() * 26; // 32 ~ 58도 대각선
        const rad = (diagAngleDeg * Math.PI) / 180;
        const signY = pvy !== 0 ? Math.sign(pvy) : (py < TABLE_HEIGHT / 2 ? 1 : -1);

        pvx = Math.cos(rad) * curSpeed;
        pvy = signY * Math.sin(rad) * curSpeed;
        spin = spin * 0.55 + (Math.random() < 0.5 ? 1 : -1) * 3.0;
        events.push({ type: 'WALL', x: px, y: py, speed: curSpeed });
      }
    }

    // 7. Right End Wall & Red Goal Mouth
    if (px + r > TABLE_WIDTH) {
      if (inGoalMouthY) {
        if (px > TABLE_WIDTH + r * 1.35) {
          events.push({ type: 'GOAL', team: 'blue', x: TABLE_WIDTH, y: py, speed: Math.hypot(pvx, pvy), combo: rallyCount });
          pvx = 0;
          pvy = 0;
          spin = 0;
          break;
        }
      } else {
        // [REQ] "벽 부딫치면 아에 대각선으로 튀게": 우측 끝 벽면 충돌 시 코트 중앙 대각선 방향으로 방출
        px = TABLE_WIDTH - r - 1;
        const curSpeed = Math.max(Math.hypot(pvx, pvy) * RAIL_RESTITUTION, 340);
        const diagAngleDeg = 32 + Math.random() * 26; // 32 ~ 58도 대각선
        const rad = (diagAngleDeg * Math.PI) / 180;
        const signY = pvy !== 0 ? Math.sign(pvy) : (py < TABLE_HEIGHT / 2 ? 1 : -1);

        pvx = -Math.cos(rad) * curSpeed;
        pvy = signY * Math.sin(rad) * curSpeed;
        spin = spin * 0.55 + (Math.random() < 0.5 ? 1 : -1) * 3.0;
        events.push({ type: 'WALL', x: px, y: py, speed: curSpeed });
      }
    }

    // 7. [REQ] 정가운데 물리 스피커 충돌
    // [REQ] "스피커는 훨씬 더 빠르고 더 많이 튀게... 경기장 전체 반전될 정도로 세게 반사시켜줘"
    const speakerX = TABLE_WIDTH / 2;
    const speakerY = TABLE_HEIGHT / 2;
    const speakerR = CENTER_SPEAKER_RADIUS;
    const sDx = px - speakerX;
    const sDy = py - speakerY;
    const sDist = Math.hypot(sDx, sDy);
    const sMinDist = r + speakerR;

    if (sDist < sMinDist && sDist > 0.0001) {
      const sNx = sDx / sDist;
      const sNy = sDy / sDist;

      // Position separation
      px = speakerX + sNx * (sMinDist + 1.5);
      py = speakerY + sNy * (sMinDist + 1.5);

      const vDotN = pvx * sNx + pvy * sNy;
      if (vDotN < 0) {
        const hitterIs1P = lastHitTeam === 'blue' || (lastHitTeam !== 'red' && pvx > 0);
        const penaltyTeam: 'blue' | 'red' = hitterIs1P ? 'blue' : 'red';

        // [REQ] "1.1배 ~ 3배까지 랜덤으로 빨라지게"
        const incomingSpeed = Math.hypot(pvx, pvy);
        const randMultiplier = Number((1.1 + Math.random() * 1.9).toFixed(2)); // 1.10 ~ 3.00배 랜덤
        const baseSpeed = Math.max(incomingSpeed, 360);
        const speakerBoostedSpeed = Math.min(2200, Math.max(baseSpeed * randMultiplier, 520));

        // 25도~65도의 가파른 대각선 각도로 마지막 타격자의 골대 쪽으로 반사 (마지막 타격자에게 불리하게)
        const signY = sNy !== 0 ? (Math.random() < 0.2 ? -Math.sign(sNy) : Math.sign(sNy)) : (Math.random() < 0.5 ? 1 : -1);
        const diagonalAngleDeg = 25 + Math.random() * 40;
        const rad = (diagonalAngleDeg * Math.PI) / 180;

        const dirX = hitterIs1P ? -Math.cos(rad) : Math.cos(rad);
        const dirY = signY * Math.sin(rad);

        pvx = dirX * speakerBoostedSpeed;
        pvy = dirY * speakerBoostedSpeed;

        // [REQ] "그리고 10초 뒤 or 골 되면 해제하게 해줘!"
        superCharged = true;
        speakerBoostUntil = Date.now() + 10000; // 10초 동안 슈퍼차지 가속 유지
        speakerMultiplier = randMultiplier;

        const spinSign = Math.random() < 0.5 ? 1 : -1;
        spin = spinSign * (10.0 + Math.random() * 8.0);

        events.push({
          type: 'SPEAKER',
          x: px,
          y: py,
          team: penaltyTeam,
          speed: speakerBoostedSpeed,
          combo: rallyCount,
          multiplier: randMultiplier,
        });
      }
    }

    // 8. [REQ] 마젠타 플레이어(1P/2P) 및 시안 장애물 로봇(0~10개 유동 설정) 충돌 처리
    if (allRobots && allRobots.length > 0) {
      for (const robot of allRobots) {
        if (!robot.detected || robot.confidence < 0.28) continue;

        const strikerRadius = robot.radius || ROBOT_RADIUS;
        const dx = px - robot.tableX;
        const dy = py - robot.tableY;
        const dist = Math.hypot(dx, dy);
        const minDist = r + strikerRadius;

        if (dist < minDist) {
          let nx = dist > 0.0001 ? dx / dist : (robot.tableX < TABLE_WIDTH / 2 ? 1 : -1);
          let ny = dist > 0.0001 ? dy / dist : 0;

          const isObstacle = robot.team === 'obstacle';
          const isLeftSide = robot.tableX < TABLE_WIDTH / 2;

          if (isObstacle) {
            // [REQ] 시안 장애물 로봇: 코트 절반 정도(520 ~ 780 px/s) 대각선 반사
            px = robot.tableX + nx * (minDist + 1.5);
            py = robot.tableY + ny * (minDist + 1.5);

            const hitterIs1P = lastHitTeam === 'blue' || (lastHitTeam !== 'red' && pvx > 0);
            const incomingSpeed = Math.hypot(pvx, pvy);
            const obstacleHalfCourtSpeed = Math.min(820, Math.max(incomingSpeed * 0.95, 480 + Math.random() * 140));

            // 뚜렷한 대각선 각도 (32도 ~ 58도 대각선 반사)
            const signY = ny !== 0 ? (Math.random() < 0.25 ? -Math.sign(ny) : Math.sign(ny)) : (Math.random() < 0.5 ? 1 : -1);
            const diagonalAngleDeg = 32 + Math.random() * 26;
            const rad = (diagonalAngleDeg * Math.PI) / 180;

            const dirX = hitterIs1P ? -Math.cos(rad) : Math.cos(rad);
            const dirY = signY * Math.sin(rad);

            pvx = dirX * obstacleHalfCourtSpeed;
            pvy = dirY * obstacleHalfCourtSpeed;

            const spinSign = Math.random() < 0.5 ? 1 : -1;
            spin = spinSign * (6.5 + Math.random() * 6.5);

            events.push({
              type: 'ROBOT',
              team: 'obstacle',
              x: px,
              y: py,
              speed: obstacleHalfCourtSpeed,
            });
            continue;
          } else if (isLeftSide) {
            // [1P 패들]: 오른쪽(+X)으로 밀어냄 (자책골 방지)
            if (nx < 0.2) {
              nx = Math.max(0.4, Math.abs(nx));
              const reLen = Math.hypot(nx, ny) || 1;
              nx /= reLen;
              ny /= reLen;
            }
            px = Math.max(robot.tableX + minDist * 0.5, robot.tableX + nx * (minDist + 1));
            py = robot.tableY + ny * (minDist + 1);

            const swingBonus = Math.max(0, robot.vx * 0.75) + Math.abs(robot.vy) * 0.5;
            pvx = Math.max(480, Math.abs(pvx) * 1.06 + swingBonus + 260);
            const offsetRatio = Math.max(-1, Math.min(1, dy / minDist));
            pvy = pvy * 0.25 + offsetRatio * 160 + robot.vy * 0.4;
          } else {
            // [2P 패들]: 왼쪽(-X)으로 밀어냄 (자책골 방지)
            if (nx > -0.2) {
              nx = -Math.max(0.4, Math.abs(nx));
              const reLen = Math.hypot(nx, ny) || 1;
              nx /= reLen;
              ny /= reLen;
            }
            px = Math.min(robot.tableX - minDist * 0.5, robot.tableX + nx * (minDist + 1));
            py = robot.tableY + ny * (minDist + 1);

            const swingBonus = Math.max(0, -robot.vx * 0.75) + Math.abs(robot.vy) * 0.5;
            pvx = -Math.max(480, Math.abs(pvx) * 1.06 + swingBonus + 260);
            const offsetRatio = Math.max(-1, Math.min(1, dy / minDist));
            pvy = pvy * 0.25 + offsetRatio * 160 + robot.vy * 0.4;
          }

          let curSpeed = Math.hypot(pvx, pvy);
          const minHitSpeed = 440;
          if (curSpeed < minHitSpeed) {
            const boost = minHitSpeed / (curSpeed || 1);
            pvx *= boost;
            pvy *= boost;
            curSpeed = minHitSpeed;
          }

          lastHitTeam = robot.team;
          events.push({
            type: 'ROBOT',
            team: robot.team,
            x: px,
            y: py,
            speed: curSpeed,
          });
        }
      }
    }
  }

  // [REQ] "그리고 10초 뒤 or 골 되면 해제하게 해줘!": 10초 경과 시 스피커 부스트 자동 만료
  const now = Date.now();
  if (speakerBoostUntil > 0 && now >= speakerBoostUntil) {
    superCharged = false;
    speakerBoostUntil = 0;
    speakerMultiplier = 1.0;
    let curSpd = Math.hypot(pvx, pvy);
    if (curSpd > 520) {
      const slowScale = 520 / curSpd;
      pvx *= slowScale;
      pvy *= slowScale;
    }
  }

  // Speed clamping to terminal velocity
  let speed = Math.hypot(pvx, pvy);
  const MAX_SPEED = superCharged ? 2200 : 960;
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    pvx *= scale;
    pvy *= scale;
    speed = MAX_SPEED;
  }

  // [REQ] "공 속도 좀 늦추고 ㅋㅋ": 최소 수평 속도를 220 px/s로 완화하여 플레이 제어감 향상
  if (speed > 1 && Math.abs(pvx) < 200) {
    const dir = pvx >= 0 ? 1 : -1;
    pvx = dir * 220;
    speed = Math.hypot(pvx, pvy);
  }

  if (speed > 1 && speed < 200) {
    const boost = 220 / speed;
    pvx *= boost;
    pvy *= boost;
    speed = 220;
  }

  const newTrail: Array<{ x: number; y: number; alpha: number }> = [];

  if (pvx === 0 && pvy === 0 && currPuck.vx === 0 && currPuck.vy === 0) {
    return {
      puck: currPuck,
      events,
    };
  }

  return {
    puck: {
      ...currPuck,
      x: px,
      y: py,
      vx: pvx,
      vy: pvy,
      spin,
      angle,
      superCharged,
      speakerBoostUntil,
      speakerMultiplier,
      rallyCount,
      lastHitTeam,
      trail: newTrail,
    },
    events,
  };
}
