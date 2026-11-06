import { FourCorners, EightPoints, CalibrationCorners, Point2D, TABLE_WIDTH, TABLE_HEIGHT, toEightPoints } from '../types/hockey';

export type Matrix3x3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

/**
 * Solves an 8x8 linear system for 4 point correspondences to find Homography matrix H.
 * Maps src points to dst points: dst = H * src
 */
export function getHomographyMatrix(src: FourCorners, dst: FourCorners): Matrix3x3 | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const xs = src[i].x;
    const ys = src[i].y;
    const xd = dst[i].x;
    const yd = dst[i].y;

    A.push([xs, ys, 1, 0, 0, 0, -xd * xs, -xd * ys]);
    b.push(xd);

    A.push([0, 0, 0, xs, ys, 1, -yd * xs, -yd * ys]);
    b.push(yd);
  }

  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    const tempA = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tempA;

    const tempB = b[i];
    b[i] = b[maxRow];
    b[maxRow] = tempB;

    if (Math.abs(A[i][i]) < 1e-9) {
      return null;
    }

    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      b[k] -= factor * b[i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
    }
  }

  const h = new Array(8);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * h[j];
    }
    h[i] = sum / A[i][i];
  }

  return [
    h[0], h[1], h[2],
    h[3], h[4], h[5],
    h[6], h[7], 1
  ];
}

export function applyHomography(x: number, y: number, H: Matrix3x3): Point2D {
  const w = H[6] * x + H[7] * y + H[8];
  const denom = Math.abs(w) < 1e-7 ? 1e-7 : w;
  return {
    x: (H[0] * x + H[1] * y + H[2]) / denom,
    y: (H[3] * x + H[4] * y + H[5]) / denom,
  };
}

export const TABLE_CORNERS: FourCorners = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH, y: 0 },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
  { x: 0, y: TABLE_HEIGHT }
];

function isPointInQuad(px: number, py: number, quad: FourCorners): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = quad[i];
    const p2 = quad[(i + 1) % 4];
    const cross = (p2.x - p1.x) * (py - p1.y) - (p2.y - p1.y) * (px - p1.x);
    if (Math.abs(cross) < 1e-5) continue;
    if (sign === 0) {
      sign = cross > 0 ? 1 : -1;
    } else if ((cross > 0 ? 1 : -1) !== sign) {
      return false;
    }
  }
  return true;
}

interface SubQuadWarp {
  tableQuad: FourCorners;
  screenQuad: FourCorners;
  tableToScreen: Matrix3x3;
  screenToTable: Matrix3x3;
}

/**
 * PerspectiveTransformer
 * - For Screen / Court Display: Uses pure 4-point Planar Homography, guaranteeing perfectly straight lines and round circles without mesh seams!
 * - For Camera Vision: Supports 8-point Mesh Homography to counteract wide-angle camera barrel/cushion distortion.
 */
export class PerspectiveTransformer {
  private isEightPointMode = false;
  private fourCorners: FourCorners;
  private eightPoints: EightPoints | null = null;
  private globalT2S: Matrix3x3 | null = null;
  private globalS2T: Matrix3x3 | null = null;
  private subQuads: SubQuadWarp[] = [];
  private centerPt: Point2D = { x: 0, y: 0 };

  constructor(corners: CalibrationCorners) {
    if (corners.length === 8) {
      this.fourCorners = [corners[0], corners[2], corners[4], corners[6]];
      this.eightPoints = corners as EightPoints;
      this.isEightPointMode = true;
    } else {
      this.fourCorners = corners as FourCorners;
      this.isEightPointMode = false;
    }
    this.updateCorners(corners);
  }

  public updateCorners(corners: CalibrationCorners) {
    if (corners.length === 8) {
      this.isEightPointMode = true;
      this.eightPoints = corners as EightPoints;
      this.fourCorners = [corners[0], corners[2], corners[4], corners[6]];
    } else {
      this.isEightPointMode = false;
      this.fourCorners = corners as FourCorners;
      this.eightPoints = null;
    }

    // Always compute Global Homography: TABLE_CORNERS <-> fourCorners
    this.globalT2S = getHomographyMatrix(TABLE_CORNERS, this.fourCorners);
    this.globalS2T = getHomographyMatrix(this.fourCorners, TABLE_CORNERS);

    // If 4-point mode (Screen/Projector), do NOT use subquads (prevents seam tearing and line warping)
    if (!this.isEightPointMode || !this.eightPoints) {
      this.subQuads = [];
      return;
    }

    // 8-Point Mode (Camera Wide-Angle Distortion Correction):
    const pts = this.eightPoints;
    const p1 = pts[1];
    const p5 = pts[5];
    const p7 = pts[7];
    const p3 = pts[3];

    const dx1 = p5.x - p1.x;
    const dy1 = p5.y - p1.y;
    const dx2 = p3.x - p7.x;
    const dy2 = p3.y - p7.y;

    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) > 1e-5) {
      const t = ((p7.x - p1.x) * dy2 - (p7.y - p1.y) * dx2) / denom;
      this.centerPt = {
        x: p1.x + t * dx1,
        y: p1.y + t * dy1,
      };
    } else {
      this.centerPt = {
        x: (p1.x + p3.x + p5.x + p7.x) / 4,
        y: (p1.y + p3.y + p5.y + p7.y) / 4,
      };
    }

    const c = this.centerPt;
    const midX = TABLE_WIDTH / 2;
    const midY = TABLE_HEIGHT / 2;

    const defs: Array<{ table: FourCorners; screen: FourCorners }> = [
      // Q0: Top-Left
      {
        table: [{ x: 0, y: 0 }, { x: midX, y: 0 }, { x: midX, y: midY }, { x: 0, y: midY }],
        screen: [pts[0], pts[1], c, pts[7]],
      },
      // Q1: Top-Right
      {
        table: [{ x: midX, y: 0 }, { x: TABLE_WIDTH, y: 0 }, { x: TABLE_WIDTH, y: midY }, { x: midX, y: midY }],
        screen: [pts[1], pts[2], pts[3], c],
      },
      // Q2: Bottom-Right
      {
        table: [{ x: midX, y: midY }, { x: TABLE_WIDTH, y: midY }, { x: TABLE_WIDTH, y: TABLE_HEIGHT }, { x: midX, y: TABLE_HEIGHT }],
        screen: [c, pts[3], pts[4], pts[5]],
      },
      // Q3: Bottom-Left
      {
        table: [{ x: 0, y: midY }, { x: midX, y: midY }, { x: midX, y: TABLE_HEIGHT }, { x: 0, y: TABLE_HEIGHT }],
        screen: [pts[7], c, pts[5], pts[6]],
      },
    ];

    this.subQuads = [];
    for (const d of defs) {
      const t2s = getHomographyMatrix(d.table, d.screen);
      const s2t = getHomographyMatrix(d.screen, d.table);
      if (t2s && s2t) {
        this.subQuads.push({
          tableQuad: d.table,
          screenQuad: d.screen,
          tableToScreen: t2s,
          screenToTable: s2t,
        });
      }
    }
  }

  public tableToScreen(tableX: number, tableY: number): Point2D {
    // Pure 4-point mode: 100% clean planar projection
    if (!this.isEightPointMode || this.subQuads.length === 0) {
      if (this.globalT2S) {
        return applyHomography(tableX, tableY, this.globalT2S);
      }
      return {
        x: (tableX / TABLE_WIDTH) * (this.fourCorners[1].x - this.fourCorners[0].x) + this.fourCorners[0].x,
        y: (tableY / TABLE_HEIGHT) * (this.fourCorners[3].y - this.fourCorners[0].y) + this.fourCorners[0].y,
      };
    }

    // 8-point camera mesh mode
    const midX = TABLE_WIDTH / 2;
    const midY = TABLE_HEIGHT / 2;

    let qIdx = 0;
    if (tableX < midX && tableY < midY) qIdx = 0;
    else if (tableX >= midX && tableY < midY) qIdx = 1;
    else if (tableX >= midX && tableY >= midY) qIdx = 2;
    else qIdx = 3;

    const quad = this.subQuads[qIdx];
    if (quad) {
      return applyHomography(tableX, tableY, quad.tableToScreen);
    }

    if (this.globalT2S) {
      return applyHomography(tableX, tableY, this.globalT2S);
    }

    return { x: tableX, y: tableY };
  }

  public screenToTable(screenX: number, screenY: number): Point2D {
    // Pure 4-point mode: 100% clean planar inverse projection
    if (!this.isEightPointMode || this.subQuads.length === 0) {
      if (this.globalS2T) {
        return applyHomography(screenX, screenY, this.globalS2T);
      }
      return {
        x: (screenX / 1200) * TABLE_WIDTH,
        y: (screenY / 680) * TABLE_HEIGHT,
      };
    }

    // 8-point camera mesh mode
    for (let i = 0; i < this.subQuads.length; i++) {
      const quad = this.subQuads[i];
      if (isPointInQuad(screenX, screenY, quad.screenQuad)) {
        return applyHomography(screenX, screenY, quad.screenToTable);
      }
    }

    if (this.subQuads.length > 0) {
      let bestDist = Infinity;
      let bestQuad = this.subQuads[0];
      for (const quad of this.subQuads) {
        const sq = quad.screenQuad;
        const avgX = (sq[0].x + sq[1].x + sq[2].x + sq[3].x) / 4;
        const avgY = (sq[0].y + sq[1].y + sq[2].y + sq[3].y) / 4;
        const d = Math.hypot(screenX - avgX, screenY - avgY);
        if (d < bestDist) {
          bestDist = d;
          bestQuad = quad;
        }
      }
      return applyHomography(screenX, screenY, bestQuad.screenToTable);
    }

    if (this.globalS2T) {
      return applyHomography(screenX, screenY, this.globalS2T);
    }

    return {
      x: (screenX / 1200) * TABLE_WIDTH,
      y: (screenY / 680) * TABLE_HEIGHT,
    };
  }

  public isPointInsideScreenTable(screenX: number, screenY: number, margin = 40): boolean {
    const tablePoint = this.screenToTable(screenX, screenY);
    return (
      tablePoint.x >= -margin &&
      tablePoint.x <= TABLE_WIDTH + margin &&
      tablePoint.y >= -margin &&
      tablePoint.y <= TABLE_HEIGHT + margin
    );
  }

  public getCorners(): FourCorners {
    return this.fourCorners;
  }

  public getEightPoints(): EightPoints {
    return this.eightPoints || toEightPoints(this.fourCorners);
  }
}
