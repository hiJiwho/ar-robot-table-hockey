import QRCode from 'qrcode';
import { MatchScore, MatchStats } from '../types/hockey';

export interface AIPlayerReport {
  player: 'blue' | 'red';
  name: string;
  result: 'WIN' | 'LOSE' | 'DRAW';
  score: number;
  opponentScore: number;
  hits: number;
  maxSpeed: number;
  speakerHits: number;
  title: string;
  badge: string;
  grade: 'S+' | 'S' | 'A' | 'B+';
  radar: {
    attack: number;
    defense: number;
    speed: number;
    precision: number;
    tactics: number;
  };
  summary: string;
  reportUrl: string;
}

// Default GitHub Pages URL base for user repo
const DEFAULT_GITHUB_PAGES_BASE = 'https://hijiwho.github.io/ar-robot-table-hockey/report.html';

/**
 * 100% Local Lightweight AI Analytics Engine
 * - Zero cost, 0 API calls (Runs directly inside user's local browser/Electron)
 * - Evaluates multi-dimensional stats: Attack, Defense, Speed, Precision, Tactics
 * - Classifies player archetypes (Supersonic Striker, Iron Wall, Sonic Trickster, etc.)
 */
export function generateAIPlayerReport(
  player: 'blue' | 'red',
  score: MatchScore,
  stats: MatchStats,
  customBaseUrl?: string
): AIPlayerReport {
  const isBlue = player === 'blue';
  const myScore = isBlue ? score.blue : score.red;
  const oppScore = isBlue ? score.red : score.blue;
  const myHits = isBlue ? stats.blueHits : stats.redHits;
  const oppHits = isBlue ? stats.redHits : stats.blueHits;
  const totalHits = myHits + oppHits;
  const maxPuckSpeed = stats.maxPuckSpeed || 0;
  const speakerHits = stats.speakerHits || 0;

  const result: 'WIN' | 'LOSE' | 'DRAW' =
    myScore > oppScore ? 'WIN' : myScore < oppScore ? 'LOSE' : 'DRAW';

  // 1. Attack score (0..100): based on goals scored, hit proportion, aggressive push
  const hitRatio = totalHits > 0 ? myHits / totalHits : 0.5;
  const attack = Math.min(
    99,
    Math.round(45 + myScore * 10 + hitRatio * 25)
  );

  // 2. Defense score (0..100): based on low opponent goals, rally resilience
  const defense = Math.min(
    99,
    Math.round(Math.max(30, 95 - oppScore * 12 + (result === 'WIN' ? 10 : 0)))
  );

  // 3. Speed score (0..100): based on maximum recorded puck velocity
  // Air hockey max speed typically 300 ~ 950 px/s
  const speed = Math.min(
    99,
    Math.max(40, Math.round((maxPuckSpeed / 900) * 100))
  );

  // 4. Precision score (0..100): conversion rate from hits to goals
  const conversionRate = myHits > 0 ? myScore / myHits : 0;
  const precision = Math.min(
    98,
    Math.max(45, Math.round(55 + conversionRate * 80))
  );

  // 5. Tactics score (0..100): speaker obstacle bounce play & counter-attacks
  const tactics = Math.min(
    99,
    Math.max(50, Math.round(52 + speakerHits * 8 + (result === 'WIN' ? 8 : 0)))
  );

  // Classify AI Archetype Title
  let title = '올라운드 마에스트로';
  let badge = '👑';
  if (speed >= 82) {
    title = '초음속 스트라이커';
    badge = '⚡';
  } else if (defense >= 80 && oppScore <= 1) {
    title = '철벽의 가디언';
    badge = '🛡️';
  } else if (speakerHits >= 2) {
    title = '소닉 트릭마스터';
    badge = '🔊';
  } else if (attack >= 78) {
    title = '저격형 스나이퍼';
    badge = '🎯';
  }

  // Calculate Overall Grade
  const avgStat = (attack + defense + speed + precision + tactics) / 5;
  let grade: 'S+' | 'S' | 'A' | 'B+' = 'B+';
  if (avgStat >= 85 && result === 'WIN') grade = 'S+';
  else if (avgStat >= 76) grade = 'S';
  else if (avgStat >= 65) grade = 'A';

  // Construct Personalized AI Scout Commentary
  const commentaries: string[] = [];
  if (result === 'WIN') {
    commentaries.push(`${isBlue ? 'Cyan' : 'Yellow'} 팀의 완벽한 템포 조율이 돋보인 경기였습니다.`);
  } else if (result === 'DRAW') {
    commentaries.push('끝까지 승부를 예측할 수 없었던 팽팽한 명승부였습니다.');
  } else {
    commentaries.push('아쉬운 실점이 있었으나 뛰어난 순간 속도와 반사 신경을 보여주었습니다.');
  }

  if (maxPuckSpeed > 600) {
    commentaries.push(`최고 시속 ${Math.round(maxPuckSpeed)} px/s의 폭발적인 스매시가 상대 진영을 압도했습니다.`);
  }

  if (speakerHits > 0) {
    commentaries.push(`정가운데 물리 스피커를 활용한 굴절 궤적 공격(${speakerHits}회)이 결정적이었습니다.`);
  }

  const summary = commentaries.join(' ');

  // Build GitHub Pages Mobile Report URL with query string parameters
  const baseUrl = customBaseUrl || DEFAULT_GITHUB_PAGES_BASE;
  const params = new URLSearchParams({
    p: isBlue ? '1' : '2',
    team: isBlue ? 'Cyan' : 'Yellow',
    res: result,
    s1: String(score.blue),
    s2: String(score.red),
    hits: String(myHits),
    spd: String(Math.round(maxPuckSpeed)),
    spk: String(speakerHits),
    ttl: title,
    bdg: badge,
    grd: grade,
    atk: String(attack),
    def: String(defense),
    vel: String(speed),
    prc: String(precision),
    tac: String(tactics),
    cmm: summary,
  });

  const reportUrl = `${baseUrl}?${params.toString()}`;

  return {
    player,
    name: isBlue ? '1P Cyan' : '2P Yellow',
    result,
    score: myScore,
    opponentScore: oppScore,
    hits: myHits,
    maxSpeed: Math.round(maxPuckSpeed),
    speakerHits,
    title,
    badge,
    grade,
    radar: { attack, defense, speed, precision, tactics },
    summary,
    reportUrl,
  };
}

/**
 * Generate Clean QR Code Data URL (Base64)
 */
export async function generateQRCode(
  url: string,
  color = '#000000',
  bgColor = '#ffffff'
): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      margin: 1,
      width: 256,
      color: {
        dark: color,
        light: bgColor,
      },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.warn('Failed to generate QR code:', err);
    return '';
  }
}
