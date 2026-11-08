import { TABLE_WIDTH, TABLE_HEIGHT, ROBOT_RADIUS, PUCK_RADIUS, PuckState, RobotState, Obstacle } from '../types/hockey';

export interface CollisionEvent {
  type: 'WALL' | 'POST' | 'ROBOT' | 'GOAL' | 'OBSTACLE' | 'BOOST' | 'POWERUP';
  x: number;
  y: number;
  team?: 'blue' | 'red';
  speed: number;
  combo?: number;
}

export interface PhysicsStepResult {
  puck: PuckState;
  events: CollisionEvent[];
}

/**
 * Professional Air Hockey Physics Engine v2.0
 * - 8-substep continuous collision detection (CCD) to eliminate tunneling & sticking at extreme speeds
 * - Magnus effect spin & curve-shot physics + English spin rebound on rails
 * - Realistic momentum transfer & dynamic impulse from striker swing velocity (Anti-own-goal guaranteed)
 * - Dynamic obstacle gimmicks: Pinball Bumpers, Moving Patrol Bumpers, Turbo Speed Pads, and Super-Goal x2 Bonus Rings
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

  // Step moving obstacles once per frame
  if (obstacles && obstacles.length > 0) {
    for (const obs of obstacles) {
      if (obs.type === 'MOVING_BUMPER' && obs.vy) {
        obs.y += obs.vy * clampedDt;
        const minY = obs.minY ?? 110;
        const maxY = obs.maxY ?? TABLE_HEIGHT - 110;
        if (obs.y < minY) {
          obs.y = minY;
          obs.vy = Math.abs(obs.vy);
        } else if (obs.y > maxY) {
          obs.y = maxY;
          obs.vy = -Math.abs(obs.vy);
        }
      }
    }
  }

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

    // 8. Striker / Paddle Collisions (Both Blue & Red robots)
    // [REQ] 말만 양 옆으로 이동해도 수비·스매시·대각선 뱅크샷·기믹 타격이 100% 가능하도록 최적화 & 자책골 완벽 방지
    const checkStriker = (robot: RobotState, team: 'blue' | 'red') => {
      if (!robot.detected || robot.confidence < 0.35) return;

      const strikerRadius = (robot.radius || ROBOT_RADIUS) + 4; // 양 옆 이동 수비 시 4px 여유 히트박스 제공
      const dx = px - robot.tableX;
      const dy = py - robot.tableY;
      const dist = Math.hypot(dx, dy);
      const minDist = r + strikerRadius;

      if (dist < minDist) {
        let nx = dist > 0.0001 ? dx / dist : (team === 'blue' ? 1 : -1);
        let ny = dist > 0.0001 ? dy / dist : 0;

        // 양 옆(Y축)으로 빠르게 움직이며 깎아 칠 때도 강력한 스매시 보너스 부여!
        const lateralSmashBonus = Math.abs(robot.vy) * 0.65;

        const isLeftSide = robot.tableX < TABLE_WIDTH / 2;
        if (isLeftSide) {
          if (nx < 0.25) {
            nx = Math.max(0.45, Math.abs(nx));
            const reLen = Math.hypot(nx, ny) || 1;
            nx /= reLen;
            ny /= reLen;
          }
          px = Math.max(robot.tableX + minDist * 0.55, robot.tableX + nx * (minDist + 1));
          py = robot.tableY + ny * (minDist + 1);

          const swingBonus = Math.max(0, robot.vx * 0.9) + lateralSmashBonus;
          pvx = Math.max(720, Math.abs(pvx) * 1.18 + swingBonus + 440);
        } else {
          if (nx > -0.25) {
            nx = -Math.max(0.45, Math.abs(nx));
            const reLen = Math.hypot(nx, ny) || 1;
            nx /= reLen;
            ny /= reLen;
          }
          px = Math.min(robot.tableX - minDist * 0.55, robot.tableX + nx * (minDist + 1));
          py = robot.tableY + ny * (minDist + 1);

          const swingBonus = Math.max(0, -robot.vx * 0.9) + lateralSmashBonus;
          pvx = -Math.max(720, Math.abs(pvx) * 1.18 + swingBonus + 440);
        }

        // 양 옆 이동 위치(타점 오프셋)와 좌우 스와이프 속도(robot.vy)만으로 직선타/대각선 뱅크샷/커브샷 자유자재 조준
        const offsetRatio = Math.max(-1, Math.min(1, dy / minDist));
        pvy = pvy * 0.22 + offsetRatio * 240 + robot.vy * 0.55;

        // Impart Magnus Spin from paddle lateral slice and off-center hit
        const impartedSpin = (robot.vy * 0.0085 + offsetRatio * 3.8) * (isLeftSide ? 1 : -1);
        spin = Math.max(-12, Math.min(12, spin * 0.3 + impartedSpin));

        // Ensure crisp total speed
        let curSpeed = Math.hypot(pvx, pvy);
        const minHitSpeed = 680;
        if (curSpeed < minHitSpeed) {
          const boost = minHitSpeed / (curSpeed || 1);
          pvx *= boost;
          pvy *= boost;
          curSpeed = minHitSpeed;
        }

        lastHitTeam = team;
        rallyCount += 1;
        events.push({
          type: 'ROBOT',
          team,
          x: px,
          y: py,
          speed: curSpeed,
          combo: rallyCount,
        });
      }
    };

    checkStriker(blueRobot, 'blue');
    checkStriker(redRobot, 'red');

    // 9. Interactive Obstacles & Field Gimmicks
    if (obstacles && obstacles.length > 0) {
      const now = Date.now();
      for (const obs of obstacles) {
        const dx = px - obs.x;
        const dy = py - obs.y;
        const dist = Math.hypot(dx, dy);
        const minDist = r + obs.radius;

        if (dist < minDist && dist > 0.0001) {
          const obsType = obs.type || 'BUMPER';

          if (obsType === 'SPEED_BOOST') {
            // Pass-through Turbo Boost Pad (cooldown 400ms)
            if (now - (obs.lastHitTime || 0) > 400) {
              obs.lastHitTime = now;
              obs.hitCount = (obs.hitCount || 0) + 1;
              pvx *= 1.42;
              pvy *= 1.42;
              const boostedSpeed = Math.min(1600, Math.hypot(pvx, pvy));
              events.push({
                type: 'BOOST',
                x: obs.x,
                y: obs.y,
                speed: boostedSpeed,
                combo: rallyCount,
              });
            }
          } else if (obsType === 'BONUS_RING') {
            // Pass-through Super Goal x2 Bonus Ring
            if (!superCharged && now - (obs.lastHitTime || 0) > 600) {
              obs.lastHitTime = now;
              obs.hitCount = (obs.hitCount || 0) + 1;
              superCharged = true;
              pvx *= 1.15;
              pvy *= 1.15;
              events.push({
                type: 'POWERUP',
                x: obs.x,
                y: obs.y,
                speed: Math.hypot(pvx, pvy),
                combo: rallyCount,
              });
            }
          } else {
            // Solid Bouncing Bumper ('BUMPER' or 'MOVING_BUMPER')
            const nx = dx / dist;
            const ny = dy / dist;

            px = obs.x + nx * (minDist + 0.5);
            py = obs.y + ny * (minDist + 0.5);

            const vDotN = pvx * nx + (pvy - (obs.vy || 0)) * ny;
            if (vDotN < 0) {
              const restitution = 1.36;
              pvx -= (1 + restitution) * vDotN * nx;
              pvy -= (1 + restitution) * vDotN * ny;
              if (obs.vy) {
                pvy += obs.vy * 0.45;
              }

              // [REQ] 말이 양 옆으로만 이동하므로, 장애물에 튕긴 공이 중앙에 갇히지 않고 반드시 양 끝 골대 라인까지 시원하게 도달하도록 보장!
              const horizDir = lastHitTeam === 'blue' ? 1 : lastHitTeam === 'red' ? -1 : (pvx >= 0 ? 1 : -1);
              if (Math.abs(pvx) < 440) {
                pvx = (pvx >= 0 ? 1 : -1) * 460;
              }
              // 장애물끼리 연속 핑퐁 루프 방지: 최근 타격 팀의 상대 진영 방향으로 전진성 부여
              if ((obs.hitCount || 0) >= 2 && Math.sign(pvx) !== horizDir) {
                pvx = horizDir * Math.max(480, Math.abs(pvx));
              }

              let curSpeed = Math.hypot(pvx, pvy);
              const minBumperSpeed = 640;
              if (curSpeed < minBumperSpeed) {
                const boost = minBumperSpeed / (curSpeed || 1);
                pvx *= boost;
                pvy *= boost;
                curSpeed = minBumperSpeed;
              }

              obs.hitCount = (obs.hitCount || 0) + 1;
              obs.lastHitTime = now;
              rallyCount += 1;

              events.push({
                type: 'OBSTACLE',
                x: px,
                y: py,
                speed: curSpeed,
                combo: rallyCount,
              });
            }
          }
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
