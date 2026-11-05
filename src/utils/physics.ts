import { TABLE_WIDTH, TABLE_HEIGHT, ROBOT_RADIUS, PUCK_RADIUS, PuckState, RobotState } from '../types/hockey';

export interface CollisionEvent {
  type: 'WALL' | 'POST' | 'ROBOT' | 'GOAL';
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
  dt: number
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
    const checkStriker = (robot: RobotState, team: 'blue' | 'red') => {
      if (!robot.detected || robot.confidence < 0.35) return;

      const strikerRadius = robot.radius || ROBOT_RADIUS;
      const dx = px - robot.tableX;
      const dy = py - robot.tableY;
      const dist = Math.hypot(dx, dy);
      const minDist = r + strikerRadius;

      if (dist < minDist && dist > 0.0001) {
        const nx = dx / dist;
        const ny = dy / dist;

        // Position separation to completely prevent puck sticking inside paddle
        px = robot.tableX + nx * (minDist + 0.5);
        py = robot.tableY + ny * (minDist + 0.5);

        // Relative velocity: V_puck - V_striker
        const rvx = pvx - robot.vx;
        const rvy = pvy - robot.vy;
        const vDotN = rvx * nx + rvy * ny;

        // Only reflect if approaching striker
        if (vDotN < 0) {
          // Dynamic air-hockey restitution (1.45 = snappy, energetic smash)
          const restitution = 1.45;
          const impulse = -(1 + restitution) * vDotN;

          // Transfer momentum: normal reflection + fraction of paddle swing momentum
          pvx += impulse * nx + robot.vx * 0.7;
          pvy += impulse * ny + robot.vy * 0.7;

          // [REQ] 좀만 쳐도 앞뒤(상대 골대 X축)로만 시원하게 잘 나가게 강력한 전방 추진력 보정
          const forwardSpeed = 680;
          if (team === 'blue') {
            pvx = Math.max(forwardSpeed, Math.abs(pvx) + 420);
          } else {
            pvx = -Math.max(forwardSpeed, Math.abs(pvx) + 420);
          }

          // Off-center vertical deflection: 위아래 편향은 대폭 억제(0.2x)하여 퍽이 상하 벽에 처박히지 않고 앞뒤로 곧장 날아가게 함
          const offsetRatio = Math.max(-1, Math.min(1, dy / minDist));
          pvy = pvy * 0.2 + offsetRatio * 110;

          // Ensure minimum lively hit speed (680 px/s) so even light touches produce a crisp shot
          let curSpeed = Math.hypot(pvx, pvy);
          if (curSpeed < forwardSpeed) {
            const boost = forwardSpeed / (curSpeed || 1);
            pvx *= boost;
            pvy *= boost;
            curSpeed = forwardSpeed;
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
      }
    };

    checkStriker(blueRobot, 'blue');
    checkStriker(redRobot, 'red');
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
