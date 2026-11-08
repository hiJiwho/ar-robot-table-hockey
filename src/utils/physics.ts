import { TABLE_WIDTH, TABLE_HEIGHT, ROBOT_RADIUS, PUCK_RADIUS, PuckState, RobotState, Obstacle } from '../types/hockey';

export interface CollisionEvent {
  type: 'WALL' | 'POST' | 'ROBOT' | 'GOAL' | 'OBSTACLE';
  x: number;
  y: number;
  team?: 'blue' | 'red';
  speed: number;
}

export interface PhysicsStepResult {
  puck: PuckState;
  events: CollisionEvent[];
}

/**
 * Professional Air Hockey Physics Engine
 * - Multi-substep continuous collision detection (CCD) to eliminate tunneling & sticking
 * - High-elasticity crisp rail bounces (e = 0.98) with rounded goal post corners
 * - Realistic momentum transfer & dynamic impulse from striker swing velocity
 * - Clean air cushion glide with zero unnatural vortex forces or phantom trembling
 */
export function stepPuckPhysics(
  currPuck: PuckState,
  blueRobot: RobotState,
  redRobot: RobotState,
  goalSize: number,
  dt: number,
  obstacles: Obstacle[] = []
): PhysicsStepResult {
  const events: CollisionEvent[] = [];

  // Limit max dt to avoid simulation blowout
  const clampedDt = Math.min(0.04, Math.max(0.001, dt));
  // 4 sub-steps per frame guarantees smooth continuous collision detection (CCD)
  const SUB_STEPS = 4;
  const subDt = clampedDt / SUB_STEPS;

  let px = currPuck.x;
  let py = currPuck.y;
  let pvx = currPuck.vx;
  let pvy = currPuck.vy;
  let lastHitTeam = currPuck.lastHitTeam;

  const r = currPuck.radius || PUCK_RADIUS;
  const goalHalf = goalSize / 2;
  const postTop = TABLE_HEIGHT / 2 - goalHalf;
  const postBottom = TABLE_HEIGHT / 2 + goalHalf;
  const postRadius = 10; // Rounded post caps

  for (let step = 0; step < SUB_STEPS; step++) {
    // 1. Position Integration
    px += pvx * subDt;
    py += pvy * subDt;

    // 2. Air Cushion Drag (Floating puck: very low drag so bank shots glide across the table)
    // 0.9996 per sub-step (~0.9984 per frame)
    pvx *= 0.9996;
    pvy *= 0.9996;

    // 3. Top and Bottom Cushion Rails (Crisp elastic rebound)
    const RAIL_RESTITUTION = 0.99;
    if (py - r < 0) {
      py = r;
      pvy = Math.abs(pvy) * RAIL_RESTITUTION;
      // [REQ] 상하 벽면으로만 튕기며 공이 멈추는 현상(Dead Puck) 완전 제거:
      // Y축 반사 시 항상 강력한 X축 전진 추진력(최소 360 px/s)을 주입
      const dir = pvx >= 0 ? 1 : -1;
      if (Math.abs(pvx) < 320) {
        pvx = dir * 360;
      }
      // 수직 왕복 억제: Y속도가 너무 크면 일부를 X로 분산
      if (Math.abs(pvy) > Math.abs(pvx) * 1.5) {
        pvy *= 0.75;
        pvx = dir * Math.max(Math.abs(pvx), 340);
      }
      events.push({ type: 'WALL', x: px, y: py, speed: Math.hypot(pvx, pvy) });
    } else if (py + r > TABLE_HEIGHT) {
      py = TABLE_HEIGHT - r;
      pvy = -Math.abs(pvy) * RAIL_RESTITUTION;
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

    // 4. Goal Posts (Rounded Corner Bounces)
    const checkPostBounce = (postX: number, postY: number) => {
      const dx = px - postX;
      const dy = py - postY;
      const dist = Math.hypot(dx, dy);
      const minD = r + postRadius;
      if (dist < minD && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        // Position resolution
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

    // 5. Left End Wall & Blue Goal Mouth
    const inGoalMouthY = py >= postTop && py <= postBottom;
    if (px - r < 0) {
      if (inGoalMouthY) {
        // Entered goal opening
        if (px < -r * 1.5) {
          events.push({ type: 'GOAL', team: 'red', x: 0, y: py, speed: Math.hypot(pvx, pvy) });
          pvx = 0;
          pvy = 0;
          break;
        }
      } else {
        // Hit left solid end rail
        px = r;
        pvx = Math.abs(pvx) * RAIL_RESTITUTION;
        events.push({ type: 'WALL', x: px, y: py, speed: Math.abs(pvx) });
      }
    }

    // 6. Right End Wall & Red Goal Mouth
    if (px + r > TABLE_WIDTH) {
      if (inGoalMouthY) {
        // Entered goal opening
        if (px > TABLE_WIDTH + r * 1.5) {
          events.push({ type: 'GOAL', team: 'blue', x: TABLE_WIDTH, y: py, speed: Math.hypot(pvx, pvy) });
          pvx = 0;
          pvy = 0;
          break;
        }
      } else {
        // Hit right solid end rail
        px = TABLE_WIDTH - r;
        pvx = -Math.abs(pvx) * RAIL_RESTITUTION;
        events.push({ type: 'WALL', x: px, y: py, speed: Math.abs(pvx) });
      }
    }

    // 7. Striker / Paddle Collisions (Both Blue & Red robots)
    // [REQ 4] "공이 콕에 맞고 자책골 되던데;; 이 엔진 좀 바꿔줘" -> 자책골 100% 방지 & 호쾌한 전방 튕김 엔진
    const checkStriker = (robot: RobotState, team: 'blue' | 'red') => {
      if (!robot.detected || robot.confidence < 0.35) return;

      const strikerRadius = robot.radius || ROBOT_RADIUS;
      const dx = px - robot.tableX;
      const dy = py - robot.tableY;
      const dist = Math.hypot(dx, dy);
      const minDist = r + strikerRadius;

      if (dist < minDist) {
        // Safe normal calculation
        let nx = dist > 0.0001 ? dx / dist : (team === 'blue' ? 1 : -1);
        let ny = dist > 0.0001 ? dy / dist : 0;

        // [Anti-Own-Goal Guarantee]
        // [REQ] "그냥 퍽 인식시 골대 반대로 밀어내게"
        // 패들의 현재 위치(왼쪽 진영 / 오른쪽 진영)에 따라 뒤쪽 골대의 정반대 방향으로 100% 강력하게 퍽을 밀어냄!
        const isLeftSide = robot.tableX < TABLE_WIDTH / 2;
        if (isLeftSide) {
          // 왼쪽 진영 패들: 왼쪽 골대(X=0) 반대편인 오른쪽(+X)으로 무조건 밀어냄!
          if (nx < 0.2) {
            nx = Math.max(0.4, Math.abs(nx));
            const reLen = Math.hypot(nx, ny) || 1;
            nx /= reLen;
            ny /= reLen;
          }
          px = Math.max(robot.tableX + minDist * 0.5, robot.tableX + nx * (minDist + 1));
          py = robot.tableY + ny * (minDist + 1);

          // Force energetic forward propulsion (+X, 오른쪽 골대 방향)
          const swingBonus = Math.max(0, robot.vx * 0.85);
          pvx = Math.max(680, Math.abs(pvx) * 1.15 + swingBonus + 420);
        } else {
          // 오른쪽 진영 패들: 오른쪽 골대(X=TABLE_WIDTH) 반대편인 왼쪽(-X)으로 무조건 밀어냄!
          if (nx > -0.2) {
            nx = -Math.max(0.4, Math.abs(nx));
            const reLen = Math.hypot(nx, ny) || 1;
            nx /= reLen;
            ny /= reLen;
          }
          px = Math.min(robot.tableX - minDist * 0.5, robot.tableX + nx * (minDist + 1));
          py = robot.tableY + ny * (minDist + 1);

          // Force energetic forward propulsion (-X, 왼쪽 골대 방향)
          const swingBonus = Math.max(0, -robot.vx * 0.85);
          pvx = -Math.max(680, Math.abs(pvx) * 1.15 + swingBonus + 420);
        }

        // Controlled Y deflection based on impact height & paddle vertical velocity
        const offsetRatio = Math.max(-1, Math.min(1, dy / minDist));
        pvy = pvy * 0.25 + offsetRatio * 180 + robot.vy * 0.45;

        // Ensure crisp total speed
        let curSpeed = Math.hypot(pvx, pvy);
        const minHitSpeed = 650;
        if (curSpeed < minHitSpeed) {
          const boost = minHitSpeed / (curSpeed || 1);
          pvx *= boost;
          pvy *= boost;
          curSpeed = minHitSpeed;
        }

        lastHitTeam = team;
        events.push({
          type: 'ROBOT',
          team,
          x: px,
          y: py,
          speed: curSpeed,
        });
      }
    };

    checkStriker(blueRobot, 'blue');
    checkStriker(redRobot, 'red');

    // 8. [REQ] Bumping Obstacles (중간중간 튕기는 랜덤 장애물 / 핀볼 네온 범퍼)
    if (obstacles && obstacles.length > 0) {
      for (const obs of obstacles) {
        const dx = px - obs.x;
        const dy = py - obs.y;
        const dist = Math.hypot(dx, dy);
        const minDist = r + obs.radius;

        if (dist < minDist && dist > 0.0001) {
          const nx = dx / dist;
          const ny = dy / dist;

          // Position separation
          px = obs.x + nx * (minDist + 0.5);
          py = obs.y + ny * (minDist + 0.5);

          const vDotN = pvx * nx + pvy * ny;
          if (vDotN < 0) {
            // High-elasticity pinball bumper bounce (1.35x restitution)
            const restitution = 1.35;
            pvx -= (1 + restitution) * vDotN * nx;
            pvy -= (1 + restitution) * vDotN * ny;

            // Ensure crisp energetic ricochet speed (at least 600 px/s)
            let curSpeed = Math.hypot(pvx, pvy);
            const minBumperSpeed = 600;
            if (curSpeed < minBumperSpeed) {
              const boost = minBumperSpeed / (curSpeed || 1);
              pvx *= boost;
              pvy *= boost;
              curSpeed = minBumperSpeed;
            }

            obs.hitCount = (obs.hitCount || 0) + 1;
            obs.lastHitTime = Date.now();

            events.push({
              type: 'OBSTACLE',
              x: px,
              y: py,
              speed: curSpeed,
            });
          }
        }
      }
    }
  }

  // Speed clamping to terminal velocity (1450 px/s)
  let speed = Math.hypot(pvx, pvy);
  const MAX_SPEED = 1450;
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    pvx *= scale;
    pvy *= scale;
    speed = MAX_SPEED;
  }

  // [REQ] 공이 어정쩡하게 멈추는 현상(Dead Puck) 완전 방지:
  // 1) X축 속도가 약해져 벽 사이에서만 맴돌면 전진 가속 부여
  if (speed > 1 && Math.abs(pvx) < 260) {
    const dir = pvx >= 0 ? 1 : -1;
    pvx = dir * 280;
    speed = Math.hypot(pvx, pvy);
  }

  // 2) 움직이고 있는 상태라면 최소 260 px/s 이상의 활공 속도를 유지하여 랠리가 끊기지 않음
  if (speed > 1 && speed < 260) {
    const boost = 260 / speed;
    pvx *= boost;
    pvy *= boost;
    speed = 260;
  }

  // [REQ] 공 주변 효과 지우기: 트레일 완전 제거
  const newTrail: Array<{ x: number; y: number; alpha: number }> = [];

  // If completely at rest, avoid floating-point state thrashing
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
      lastHitTeam,
      trail: newTrail,
    },
    events,
  };
}
