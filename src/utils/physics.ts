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
}

export interface PhysicsStepResult {
  puck: PuckState;
  events: CollisionEvent[];
}

/**
 * Professional Air Hockey Physics Engine
 * - Multi-substep continuous collision detection (CCD) to eliminate tunneling & sticking
 * - Center Speaker Bounce: 퍽이 테이블 정가운데 놓인 실제 물리 스피커에 닿으면 튕겨나감
 * - Dynamic 2..10 Magenta Robots: 1P, 2P 및 중간 장애물 로봇 모두와 실시간 물리 충돌
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

    // 3. Air Cushion Drag (Floating puck: virtually zero friction so bank shots glide freely across the table)
    pvx *= 0.99995;
    pvy *= 0.99995;

    // 4. [REQ] 상하 벽면(Top & Bottom Cushion Rails): 부딪치면 아예 역동적인 대각선으로 튀게 (Dynamic Sharp Diagonal Carom)
    const RAIL_RESTITUTION = 1.04;
    if (py - r < 0) {
      py = r + 0.5;
      const incomingSpeed = Math.hypot(pvx, pvy);
      const curSpeed = Math.max(incomingSpeed * RAIL_RESTITUTION, 640);

      // [REQ] 아예 뚜렷하고 역동적인 대각선 반사각 (32도 ~ 58도) 강제 부여
      const diagAngleDeg = 32 + Math.random() * 26;
      const rad = (diagAngleDeg * Math.PI) / 180;
      const dirX = pvx !== 0 ? Math.sign(pvx) : (Math.random() < 0.5 ? 1 : -1);

      pvx = dirX * Math.cos(rad) * curSpeed + spin * 14;
      pvy = Math.sin(rad) * curSpeed;
      spin = spin * 0.6 + (Math.random() < 0.5 ? 1 : -1) * 4.0;

      events.push({ type: 'WALL', x: px, y: py, speed: Math.hypot(pvx, pvy) });
    } else if (py + r > TABLE_HEIGHT) {
      py = TABLE_HEIGHT - r - 0.5;
      const incomingSpeed = Math.hypot(pvx, pvy);
      const curSpeed = Math.max(incomingSpeed * RAIL_RESTITUTION, 640);

      const diagAngleDeg = 32 + Math.random() * 26;
      const rad = (diagAngleDeg * Math.PI) / 180;
      const dirX = pvx !== 0 ? Math.sign(pvx) : (Math.random() < 0.5 ? 1 : -1);

      pvx = dirX * Math.cos(rad) * curSpeed - spin * 14;
      pvy = -Math.sin(rad) * curSpeed;
      spin = spin * 0.6 + (Math.random() < 0.5 ? 1 : -1) * 4.0;

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
        const curSpeed = Math.max(Math.hypot(pvx, pvy) * RAIL_RESTITUTION, 640);
        const diagAngleDeg = 32 + Math.random() * 26; // 32 ~ 58도 대각선
        const rad = (diagAngleDeg * Math.PI) / 180;
        const signY = pvy !== 0 ? Math.sign(pvy) : (py < TABLE_HEIGHT / 2 ? 1 : -1);

        pvx = Math.cos(rad) * curSpeed;
        pvy = signY * Math.sin(rad) * curSpeed;
        spin = spin * 0.6 + (Math.random() < 0.5 ? 1 : -1) * 4.5;
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
        const curSpeed = Math.max(Math.hypot(pvx, pvy) * RAIL_RESTITUTION, 640);
        const diagAngleDeg = 32 + Math.random() * 26; // 32 ~ 58도 대각선
        const rad = (diagAngleDeg * Math.PI) / 180;
        const signY = pvy !== 0 ? Math.sign(pvy) : (py < TABLE_HEIGHT / 2 ? 1 : -1);

        pvx = -Math.cos(rad) * curSpeed;
        pvy = signY * Math.sin(rad) * curSpeed;
        spin = spin * 0.6 + (Math.random() < 0.5 ? 1 : -1) * 4.5;
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

        // 초특급 폭풍 가속: 경기장 1920px 전체를 단숨에 반전시키는 1950 ~ 2450 px/s 초광속 반사!
        const incomingSpeed = Math.hypot(pvx, pvy);
        const speakerHyperSpeed = Math.min(2450, Math.max(incomingSpeed * 2.1, 1950 + Math.random() * 350));

        // 25도~65도의 가파른 대각선 각도로 마지막 타격자의 골대 쪽으로 초광속 발사
        const signY = sNy !== 0 ? (Math.random() < 0.2 ? -Math.sign(sNy) : Math.sign(sNy)) : (Math.random() < 0.5 ? 1 : -1);
        const diagonalAngleDeg = 25 + Math.random() * 40;
        const rad = (diagonalAngleDeg * Math.PI) / 180;

        const dirX = hitterIs1P ? -Math.cos(rad) : Math.cos(rad);
        const dirY = signY * Math.sin(rad);

        pvx = dirX * speakerHyperSpeed;
        pvy = dirY * speakerHyperSpeed;

        // 슈퍼 퍽 활성화 (슈퍼차지 불꽃 & 고속 유지)
        superCharged = true;
        const spinSign = Math.random() < 0.5 ? 1 : -1;
        spin = spinSign * (14.0 + Math.random() * 12.0);

        events.push({
          type: 'SPEAKER',
          x: px,
          y: py,
          speed: speakerHyperSpeed,
          combo: rallyCount,
        });
      }
    }

    // 8. [REQ] 마젠타 센서 2개~10개 유동적 인식 & 충돌 (패들 + 장애물 로봇 모두 튕김)
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
            // [REQ] "장애물 에선 전체에 반 정도, 아에 대각선으로 튀게"
            px = robot.tableX + nx * (minDist + 1.5);
            py = robot.tableY + ny * (minDist + 1.5);

            const hitterIs1P = lastHitTeam === 'blue' || (lastHitTeam !== 'red' && pvx > 0);
            // 경기장 전체(1920px)의 반(960px) 정도를 시원하게 날아가는 속도 (900 ~ 1150 px/s)
            const incomingSpeed = Math.hypot(pvx, pvy);
            const obstacleHalfCourtSpeed = Math.min(1250, Math.max(incomingSpeed * 1.15, 880 + Math.random() * 180));

            // 아예 뚜렷하고 예측 불가능한 대각선 각도 (32도 ~ 58도 대각선 반사)
            const signY = ny !== 0 ? (Math.random() < 0.25 ? -Math.sign(ny) : Math.sign(ny)) : (Math.random() < 0.5 ? 1 : -1);
            const diagonalAngleDeg = 32 + Math.random() * 26; // 32 ~ 58 deg
            const rad = (diagonalAngleDeg * Math.PI) / 180;

            const dirX = hitterIs1P ? -Math.cos(rad) : Math.cos(rad);
            const dirY = signY * Math.sin(rad);

            pvx = dirX * obstacleHalfCourtSpeed;
            pvy = dirY * obstacleHalfCourtSpeed;

            // 마구 스핀 회전 부여
            const spinSign = Math.random() < 0.5 ? 1 : -1;
            spin = spinSign * (8.5 + Math.random() * 8.5);

            // Retain the last player hitter, but notify event as obstacle bounce
            events.push({
              type: 'ROBOT',
              team: 'obstacle',
              x: px,
              y: py,
              speed: obstacleHalfCourtSpeed,
            });
            continue; // Obstacle handled; avoid paddle hit branch and avoid overwriting lastHitTeam
          } else if (isLeftSide) {
            // [1P 패들]: 왼쪽 골대 반대 방향인 오른쪽(+X)으로 무조건 밀어냄 (자책골 방지)
            if (nx < 0.2) {
              nx = Math.max(0.4, Math.abs(nx));
              const reLen = Math.hypot(nx, ny) || 1;
              nx /= reLen;
              ny /= reLen;
            }
            px = Math.max(robot.tableX + minDist * 0.5, robot.tableX + nx * (minDist + 1));
            py = robot.tableY + ny * (minDist + 1);

            const swingBonus = Math.max(0, robot.vx * 0.9) + Math.abs(robot.vy) * 0.6;
            pvx = Math.max(720, Math.abs(pvx) * 1.18 + swingBonus + 460);
            const offsetRatio = Math.max(-1, Math.min(1, dy / minDist));
            pvy = pvy * 0.25 + offsetRatio * 200 + robot.vy * 0.5;
          } else {
            // [2P 패들]: 오른쪽 골대 반대 방향인 왼쪽(-X)으로 무조건 밀어냄 (자책골 방지)
            if (nx > -0.2) {
              nx = -Math.max(0.4, Math.abs(nx));
              const reLen = Math.hypot(nx, ny) || 1;
              nx /= reLen;
              ny /= reLen;
            }
            px = Math.min(robot.tableX - minDist * 0.5, robot.tableX + nx * (minDist + 1));
            py = robot.tableY + ny * (minDist + 1);

            const swingBonus = Math.max(0, -robot.vx * 0.9) + Math.abs(robot.vy) * 0.6;
            pvx = -Math.max(720, Math.abs(pvx) * 1.18 + swingBonus + 460);
            const offsetRatio = Math.max(-1, Math.min(1, dy / minDist));
            pvy = pvy * 0.25 + offsetRatio * 200 + robot.vy * 0.5;
          }

          let curSpeed = Math.hypot(pvx, pvy);
          const minHitSpeed = 660;
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

  // Speed clamping to terminal velocity (스피커 반사 시 초광속 2450 px/s 폭풍 반사 완벽 지원)
  let speed = Math.hypot(pvx, pvy);
  const MAX_SPEED = superCharged ? 2450 : 1900;
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    pvx *= scale;
    pvy *= scale;
    speed = MAX_SPEED;
  }

  // [REQ] 말만 양 옆으로 이동해도 항상 공이 플레이어 앞까지 도달하도록 최소 수평 속도(360 px/s) 완벽 보장:
  if (speed > 1 && Math.abs(pvx) < 360) {
    const dir = pvx >= 0 ? 1 : -1;
    pvx = dir * 380;
    speed = Math.hypot(pvx, pvy);
  }

  if (speed > 1 && speed < 360) {
    const boost = 360 / speed;
    pvx *= boost;
    pvy *= boost;
    speed = 360;
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
      rallyCount,
      lastHitTeam,
      trail: newTrail,
    },
    events,
  };
}
