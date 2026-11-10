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

    // 3. Air Cushion Drag (Floating puck: very low drag so bank shots glide across the table)
    pvx *= 0.9998;
    pvy *= 0.9998;

    // 4. Top and Bottom Cushion Rails (Crisp elastic rebound + Spin English transfer)
    const RAIL_RESTITUTION = 0.99;
    if (py - r < 0) {
      py = r;
      pvy = Math.abs(pvy) * RAIL_RESTITUTION;
      // Spin transfer on rail contact
      pvx += spin * 14;
      spin *= 0.65;

      // [REQ] 상하 벽면으로만 튕기며 공이 멈추는 현상(Dead Puck) 완전 제거:
      const dir = pvx >= 0 ? 1 : -1;
      if (Math.abs(pvx) < 320) {
        pvx = dir * 360;
      }
      if (Math.abs(pvy) > Math.abs(pvx) * 1.5) {
        pvy *= 0.75;
        pvx = dir * Math.max(Math.abs(pvx), 340);
      }
      events.push({ type: 'WALL', x: px, y: py, speed: Math.hypot(pvx, pvy) });
    } else if (py + r > TABLE_HEIGHT) {
      py = TABLE_HEIGHT - r;
      pvy = -Math.abs(pvy) * RAIL_RESTITUTION;
      pvx -= spin * 14;
      spin *= 0.65;

      const dir = pvx >= 0 ? 1 : -1;
      if (Math.abs(pvx) < 320) {
        pvx = dir * 360;
      }
      if (Math.abs(pvy) > Math.abs(pvx) * 1.5) {
        pvy *= 0.75;
        pvx = dir * Math.max(Math.abs(pvx), 340);
      }
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
        px = r;
        pvx = Math.abs(pvx) * RAIL_RESTITUTION;
        events.push({ type: 'WALL', x: px, y: py, speed: Math.abs(pvx) });
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
        px = TABLE_WIDTH - r;
        pvx = -Math.abs(pvx) * RAIL_RESTITUTION;
        events.push({ type: 'WALL', x: px, y: py, speed: Math.abs(pvx) });
      }
    }

    // 7. [REQ] 정가운데 물리 스피커 충돌 (가운데 공 오면 튕기게!)
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

      // Position separation to prevent puck tunneling inside speaker
      px = speakerX + sNx * (sMinDist + 0.5);
      py = speakerY + sNy * (sMinDist + 0.5);

      const vDotN = pvx * sNx + pvy * sNy;
      if (vDotN < 0) {
        // High-elasticity speaker bounce (1.28x restitution)
        const restitution = 1.28;
        pvx -= (1 + restitution) * vDotN * sNx;
        pvy -= (1 + restitution) * vDotN * sNy;

        let curSpeed = Math.hypot(pvx, pvy);
        const minBounceSpeed = 580;
        if (curSpeed < minBounceSpeed) {
          const boost = minBounceSpeed / (curSpeed || 1);
          pvx *= boost;
          pvy *= boost;
          curSpeed = minBounceSpeed;
        }

        events.push({
          type: 'SPEAKER',
          x: px,
          y: py,
          speed: curSpeed,
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
            // [중간 장애물 로봇]: 물리적 장애물처럼 닿는 즉시 탄력 있게 튕겨냄
            px = robot.tableX + nx * (minDist + 1);
            py = robot.tableY + ny * (minDist + 1);

            const vDotN = pvx * nx + pvy * ny;
            if (vDotN < 0) {
              const restitution = 1.35;
              pvx -= (1 + restitution) * vDotN * nx;
              pvy -= (1 + restitution) * vDotN * ny;
            }
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

            const swingBonus = Math.max(0, robot.vx * 0.85);
            pvx = Math.max(680, Math.abs(pvx) * 1.15 + swingBonus + 420);
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

            const swingBonus = Math.max(0, -robot.vx * 0.85);
            pvx = -Math.max(680, Math.abs(pvx) * 1.15 + swingBonus + 420);
          }

          // Controlled Y deflection
          const offsetRatio = Math.max(-1, Math.min(1, dy / minDist));
          pvy = pvy * 0.25 + offsetRatio * 180 + robot.vy * 0.45;

          let curSpeed = Math.hypot(pvx, pvy);
          const minHitSpeed = 620;
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

  // Speed clamping to terminal velocity (1600 px/s, or 1680 when superCharged)
  let speed = Math.hypot(pvx, pvy);
  const MAX_SPEED = superCharged ? 1680 : 1550;
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
