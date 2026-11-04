import { FourCorners, Point2D, TABLE_WIDTH, TABLE_HEIGHT } from '../types/hockey';

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
  // src[i] -> (xs_i, ys_i), dst[i] -> (xd_i, yd_i)
  // [xs, ys, 1, 0, 0, 0, -xd*xs, -xd*ys] [h0..h7]^T = xd
  // [0, 0, 0, xs, ys, 1, -yd*xs, -yd*ys] [h0..h7]^T = yd
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

  // Gaussian elimination with partial pivoting to solve A * h = b
  const n = 8;
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    const tempA = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tempA;

    const tempB = b[i];
    b[i] = b[maxRow];
    b[maxRow] = tempB;

    if (Math.abs(A[i][i]) < 1e-9) {
      return null; // Singular or degenerate points
    }

    // Eliminate below
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      b[k] -= factor * b[i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
    }
  }

  // Back substitution
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

/**
 * Transforms point (x, y) with a 3x3 homography matrix.
 */
export function applyHomography(x: number, y: number, H: Matrix3x3): Point2D {
  const w = H[6] * x + H[7] * y + H[8];
  const denom = Math.abs(w) < 1e-7 ? 1e-7 : w;
  return {
    x: (H[0] * x + H[1] * y + H[2]) / denom,
    y: (H[3] * x + H[4] * y + H[5]) / denom,
  };
}

/**
 * Standard table corners in virtual table space:
 * [TopLeft(0,0), TopRight(W,0), BottomRight(W,H), BottomLeft(0,H)]
 */
export const TABLE_CORNERS: FourCorners = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH, y: 0 },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
  { x: 0, y: TABLE_HEIGHT }
];

export class PerspectiveTransformer {
  private screenCorners: FourCorners;
  private tableToScreenMatrix: Matrix3x3 | null = null;
  private screenToTableMatrix: Matrix3x3 | null = null;

  constructor(screenCorners: FourCorners) {
    this.screenCorners = screenCorners;
    this.updateCorners(screenCorners);
  }

  public updateCorners(screenCorners: FourCorners) {
    this.screenCorners = screenCorners;
    this.tableToScreenMatrix = getHomographyMatrix(TABLE_CORNERS, screenCorners);
    this.screenToTableMatrix = getHomographyMatrix(screenCorners, TABLE_CORNERS);
  }

  public tableToScreen(tableX: number, tableY: number): Point2D {
    if (this.tableToScreenMatrix) {
      return applyHomography(tableX, tableY, this.tableToScreenMatrix);
    }
    // Fallback: Bilinear interpolation
    const u = tableX / TABLE_WIDTH;
    const v = tableY / TABLE_HEIGHT;
    const c = this.screenCorners;
    const x = (1 - u) * (1 - v) * c[0].x + u * (1 - v) * c[1].x + u * v * c[2].x + (1 - u) * v * c[3].x;
    const y = (1 - u) * (1 - v) * c[0].y + u * (1 - v) * c[1].y + u * v * c[2].y + (1 - u) * v * c[3].y;
    return { x, y };
  }

  public screenToTable(screenX: number, screenY: number): Point2D {
    if (this.screenToTableMatrix) {
      return applyHomography(screenX, screenY, this.screenToTableMatrix);
    }
    // Fallback: rough bounding box mapping
    const c = this.screenCorners;
    const minX = Math.min(c[0].x, c[1].x, c[2].x, c[3].x);
    const maxX = Math.max(c[0].x, c[1].x, c[2].x, c[3].x);
    const minY = Math.min(c[0].y, c[1].y, c[2].y, c[3].y);
    const maxY = Math.max(c[0].y, c[1].y, c[2].y, c[3].y);

    const normX = Math.max(0, Math.min(1, (screenX - minX) / (maxX - minX || 1)));
    const normY = Math.max(0, Math.min(1, (screenY - minY) / (maxY - minY || 1)));
    return {
      x: normX * TABLE_WIDTH,
      y: normY * TABLE_HEIGHT,
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
    return this.screenCorners;
  }
}
