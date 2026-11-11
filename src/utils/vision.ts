import { CalibrationCorners, ColorFilter, ColorSettings, EightPoints, FourCorners, Point2D, VisionEngineType } from '../types/hockey';

export interface DetectedBlob {
  x: number; // In processing canvas pixel coordinates
  y: number;
  radius: number;
  pixelCount: number;
  confidence: number;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

export const DEFAULT_COLOR_SETTINGS: ColorSettings = {
  magenta: {
    // Magenta / Violet-Pink (wrap-around 275 to 20 deg) - 1P & 2P Players (2 fixed)
    hMin: 275,
    hMax: 20,
    sMin: 0.16,
    sMax: 1.0,
    vMin: 0.14,
    vMax: 1.0,
  },
  cyan: {
    // Cyan / Sky-Aqua (165 to 215 deg) - Obstacle Robots (default 2, configurable 0..10)
    hMin: 165,
    hMax: 215,
    sMin: 0.16,
    sMax: 1.0,
    vMin: 0.14,
    vMax: 1.0,
  },
  obstacleCount: 2, // Default: 2 Cyan obstacle robots (+ 2 Magenta players = 4 total)
  minBlobSize: 8, // Support small physical Lego blocks (>= 8 pixels)
  maxBlobSize: 15000,
  visionEngine: 'OPENCV', // Default to OpenCV (opencv.js WASM); falls back to JS Chromatic engine while loading
  sensitivity: 3, // 1 to 5 (3 is optimal standard)
  lowLightMode: false,
  customSample: null,
  obstacleCustomSample: null,
};

/**
 * Fast RGB to HSV conversion
 */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;

  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rf) {
      h = ((gf - bf) / delta) % 6;
    } else if (max === gf) {
      h = (bf - rf) / delta + 2;
    } else {
      h = (rf - gf) / delta + 4;
    }
    h = h * 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

/**
 * Fast RGB to OpenCV-standard YCrCb conversion
 * Luminance Y is completely separated from Chroma Cr and Cb.
 */
export function rgbToYCrCb(r: number, g: number, b: number): { y: number; cr: number; cb: number } {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cr = (r - y) * 0.713 + 128;
  const cb = (b - y) * 0.564 + 128;
  return { y, cr, cb };
}

export function matchesFilter(h: number, s: number, v: number, filter: ColorFilter): boolean {
  if (s < filter.sMin || s > filter.sMax) return false;
  if (v < filter.vMin || v > filter.vMax) return false;

  if (filter.hMin <= filter.hMax) {
    return h >= filter.hMin && h <= filter.hMax;
  } else {
    return h >= filter.hMin || h <= filter.hMax;
  }
}

/**
 * ENGINE 1: Smart Invariant Chromatic Index (OpenCV-Grade Projector-Proof Engine)
 * For Player Markers (Default: Magenta, or Camera-Sampled customSample)
 */
function isMagentaChromatic(
  r: number,
  g: number,
  b: number,
  sensitivity: number,
  customSample?: { r: number; g: number; b: number } | null,
  lowLightMode = false
): boolean {
  // [REQ] Digital & physical hot-pink / magenta 100% instant detection:
  // Pure Magenta (#FF00FF), Fuchsia, Hot-Pink (#FF1493), Neon Pink:
  if (r > 120 && b > 75 && r > g * 1.10) {
    return true;
  }

  const sum = r + g + b;
  const minSum = lowLightMode ? 10 : 22;
  if (sum < minSum) return false;

  const rc = r / sum;
  const gc = g / sum;
  const bc = b / sum;

  // If user calibrated a specific physical sample from the camera feed for Player:
  if (customSample) {
    const sSum = customSample.r + customSample.g + customSample.b;
    if (sSum > 16) {
      const src = customSample.r / sSum;
      const sgc = customSample.g / sSum;
      const sbc = customSample.b / sSum;

      const dist = Math.hypot(rc - src, gc - sgc, bc - sbc);
      const tolerance = (0.13 + sensitivity * 0.04) * (lowLightMode ? 1.3 : 1.0);
      return dist < tolerance;
    }
  }

  // 1. Red must clearly exceed Green (magenta/pink characteristic)
  if (r <= g + (lowLightMode ? 2 : 4)) {
    return false;
  }

  // 2. Reject skin tone / warm hands (hands have high R but very low B: B << G)
  if (b < g - 30) {
    return false;
  }

  // Base threshold adjusted by sensitivity (1=strict, 5=lenient)
  let thresh = Math.max(0.04, 0.20 - sensitivity * 0.035);
  if (lowLightMode) {
    thresh *= 0.65;
  }

  // Normalized Excess Magenta (NEM): (rc + bc) - 2*gc
  const nem = (rc + bc) - 2 * gc;

  const maxGc = lowLightMode ? 0.38 : 0.35;
  const minRc = lowLightMode ? 0.26 : 0.29;

  if (nem > thresh && gc < maxGc && rc > minRc) {
    return true;
  }

  // Shadowed / deep purple or hot-pink Lego blocks
  if (rc > (lowLightMode ? 0.30 : 0.34) && gc < (lowLightMode ? 0.34 : 0.31)) {
    return true;
  }

  return false;
}

/**
 * ENGINE 1-B: Smart Invariant Chromatic Index for Obstacle Robot Markers
 * (Default: Cyan / Aqua, or Camera-Sampled obstacleCustomSample)
 */
function isCyanChromatic(
  r: number,
  g: number,
  b: number,
  sensitivity: number,
  obstacleCustomSample?: { r: number; g: number; b: number } | null,
  lowLightMode = false
): boolean {
  // [REQ] Digital & physical Cyan instant detection:
  if (b > 100 && g > 90 && b > r * 1.10 && g > r * 1.05) {
    return true;
  }

  const sum = r + g + b;
  const minSum = lowLightMode ? 10 : 22;
  if (sum < minSum) return false;

  const rc = r / sum;
  const gc = g / sum;
  const bc = b / sum;

  // If user calibrated a specific physical sample from the camera feed for Obstacle Robot:
  if (obstacleCustomSample) {
    const sSum = obstacleCustomSample.r + obstacleCustomSample.g + obstacleCustomSample.b;
    if (sSum > 16) {
      const src = obstacleCustomSample.r / sSum;
      const sgc = obstacleCustomSample.g / sSum;
      const sbc = obstacleCustomSample.b / sSum;

      const dist = Math.hypot(rc - src, gc - sgc, bc - sbc);
      const tolerance = (0.13 + sensitivity * 0.04) * (lowLightMode ? 1.3 : 1.0);
      return dist < tolerance;
    }
  }

  // Default Cyan characteristic: Blue and Green both clearly exceed Red
  if (b <= r + (lowLightMode ? 3 : 6) || g <= r + (lowLightMode ? 2 : 5)) {
    return false;
  }

  let thresh = Math.max(0.05, 0.22 - sensitivity * 0.035);
  if (lowLightMode) {
    thresh *= 0.65;
  }

  // Normalized Excess Cyan (NEC): (gc + bc) - 2*rc
  const nec = (gc + bc) - 2 * rc;
  const maxRc = lowLightMode ? 0.30 : 0.27;
  const minBc = lowLightMode ? 0.32 : 0.35;

  if (nec > thresh && rc < maxRc && bc > minBc && gc > 0.28) {
    return true;
  }

  return false;
}

/**
 * ENGINE 2: OpenCV YCrCb Chrominance Separation Engine
 */
function isMagentaYCrCb(
  r: number,
  g: number,
  b: number,
  sensitivity: number,
  customSample?: { r: number; g: number; b: number } | null,
  lowLightMode = false
): boolean {
  const { cr, cb } = rgbToYCrCb(r, g, b);

  if (customSample) {
    const s = rgbToYCrCb(customSample.r, customSample.g, customSample.b);
    const dCr = cr - s.cr;
    const dCb = cb - s.cb;
    const dist = Math.hypot(dCr, dCb);
    const maxDist = (18 + sensitivity * 7) * (lowLightMode ? 1.25 : 1.0);
    return dist < maxDist;
  }

  const baseOffset = lowLightMode ? 10 : 0;
  const crMin = 138 - sensitivity * 2.5 - baseOffset;
  const cbMin = 132 - sensitivity * 2.5 - baseOffset;
  const sumMin = 275 - (lowLightMode ? 20 : 0);

  return cr >= crMin && cb >= cbMin && (cr + cb) > sumMin;
}

function isCyanYCrCb(
  r: number,
  g: number,
  b: number,
  sensitivity: number,
  obstacleCustomSample?: { r: number; g: number; b: number } | null,
  lowLightMode = false
): boolean {
  const { cr, cb } = rgbToYCrCb(r, g, b);

  if (obstacleCustomSample) {
    const s = rgbToYCrCb(obstacleCustomSample.r, obstacleCustomSample.g, obstacleCustomSample.b);
    const dCr = cr - s.cr;
    const dCb = cb - s.cb;
    const dist = Math.hypot(dCr, dCb);
    const maxDist = (18 + sensitivity * 7) * (lowLightMode ? 1.25 : 1.0);
    return dist < maxDist;
  }

  const baseOffset = lowLightMode ? 8 : 0;
  const crMax = 115 + sensitivity * 2.5 + baseOffset;
  const cbMin = 136 - sensitivity * 2.5 - baseOffset;

  return cr <= crMax && cb >= cbMin;
}

/**
 * ENGINE 3: Adaptive Wide-Spectrum HSV Engine
 */
function isColorHsv(
  r: number,
  g: number,
  b: number,
  filter: ColorFilter,
  sensitivity: number,
  lowLightMode = false
): boolean {
  const { h, s, v } = rgbToHsv(r, g, b);

  let sTolerance = Math.max(0.08, filter.sMin - (sensitivity - 3) * 0.03);
  let vTolerance = Math.max(0.06, filter.vMin - (sensitivity - 3) * 0.03);

  if (lowLightMode) {
    sTolerance *= 0.65;
    vTolerance *= 0.50;
  }

  if (s < sTolerance || v < vTolerance) return false;

  if (filter.hMin <= filter.hMax) {
    return h >= filter.hMin && h <= filter.hMax;
  } else {
    return h >= filter.hMin || h <= filter.hMax;
  }
}

/**
 * Master Pixel Classifier for 1P/2P Player Markers (Default: Magenta)
 */
export function isMagentaPixelByEngine(
  r: number,
  g: number,
  b: number,
  settings: ColorSettings
): boolean {
  const engine = settings.visionEngine || 'CHROMATIC';
  const sensitivity = settings.sensitivity || 3;
  const lowLight = !!settings.lowLightMode;

  switch (engine) {
    case 'CHROMATIC':
      return isMagentaChromatic(r, g, b, sensitivity, settings.customSample, lowLight);
    case 'YCRCB':
      return isMagentaYCrCb(r, g, b, sensitivity, settings.customSample, lowLight);
    case 'HSV':
    case 'ADAPTIVE_HSV':
      return isColorHsv(r, g, b, settings.magenta, sensitivity, lowLight);
    default:
      return isMagentaChromatic(r, g, b, sensitivity, settings.customSample, lowLight);
  }
}

/**
 * Master Pixel Classifier for Obstacle Robot Markers (Default: Cyan)
 */
export function isCyanPixelByEngine(
  r: number,
  g: number,
  b: number,
  settings: ColorSettings
): boolean {
  const engine = settings.visionEngine || 'CHROMATIC';
  const sensitivity = settings.sensitivity || 3;
  const lowLight = !!settings.lowLightMode;
  const cyanFilter = settings.cyan || DEFAULT_COLOR_SETTINGS.cyan!;

  switch (engine) {
    case 'CHROMATIC':
      return isCyanChromatic(r, g, b, sensitivity, settings.obstacleCustomSample, lowLight);
    case 'YCRCB':
      return isCyanYCrCb(r, g, b, sensitivity, settings.obstacleCustomSample, lowLight);
    case 'HSV':
    case 'ADAPTIVE_HSV':
      return isColorHsv(r, g, b, cyanFilter, sensitivity, lowLight);
    default:
      return isCyanChromatic(r, g, b, sensitivity, settings.obstacleCustomSample, lowLight);
  }
}

/**
 * Backward compatibility alias
 */
export function isMagentaPixel(r: number, g: number, b: number, filter?: ColorFilter): boolean {
  if (filter) {
    const { h, s, v } = rgbToHsv(r, g, b);
    return matchesFilter(h, s, v, filter);
  }
  return isMagentaChromatic(r, g, b, 3, null, false);
}

export const isPinkPixel = isMagentaPixel;

/**
 * Point-in-Polygon test (Ray-Casting Algorithm)
 * Accurately supports both 4-point quadrilateral and 8-point mesh polygon calibration!
 */
export function isPointInPolygon(px: number, py: number, polygon: Point2D[], margin = 45): boolean {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (px < minX - margin || px > maxX + margin || py < minY - margin || py > maxY + margin) {
    return false;
  }

  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside || (px >= minX - 15 && px <= maxX + 15 && py >= minY - 15 && py <= maxY + 15);
}

/**
 * Checks if point is within quadrilateral / 8-point polygon with margin buffer
 */
export function isPointInConvexQuad(
  px: number,
  py: number,
  poly: CalibrationCorners | Point2D[],
  margin = 8
): boolean {
  const pts = poly as Point2D[];
  if (pts.length === 4) {
    let pos = 0;
    let neg = 0;
    for (let i = 0; i < 4; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % 4];
      const cross = (px - p1.x) * (p2.y - p1.y) - (py - p1.y) * (p2.x - p1.x);
      if (cross > margin) pos++;
      else if (cross < -margin) neg++;
      if (pos > 0 && neg > 0) return false;
    }
    return true;
  }

  // 8-point polygon or arbitrary polygon: use ray casting
  return isPointInPolygon(px, py, pts);
}

export const isPointInQuadWithMargin = isPointInConvexQuad;

interface ClusterInternal {
  points: Array<[number, number]>;
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  count: number;
  score: number;
}

function clusterCandidatePoints(
  candidatePoints: Array<[number, number]>,
  effectiveMinPixels: number,
  width: number,
  height: number,
  maxCount: number
): DetectedBlob[] {
  if (candidatePoints.length < effectiveMinPixels || maxCount <= 0) {
    return [];
  }

  const cellSize = 14;
  const grid = new Map<string, Array<[number, number]>>();

  for (const [px, py] of candidatePoints) {
    const gx = Math.floor(px / cellSize);
    const gy = Math.floor(py / cellSize);
    const key = `${gx},${gy}`;
    let cell = grid.get(key);
    if (!cell) {
      cell = [];
      grid.set(key, cell);
    }
    cell.push([px, py]);
  }

  const visitedCells = new Set<string>();
  const rawClusters: ClusterInternal[] = [];

  for (const [key] of grid.entries()) {
    if (visitedCells.has(key)) continue;

    const clusterPoints: Array<[number, number]> = [];
    const queue = [key];
    visitedCells.add(key);

    while (queue.length > 0) {
      const currentKey = queue.pop()!;
      const cellPts = grid.get(currentKey);
      if (cellPts) {
        for (const pt of cellPts) {
          clusterPoints.push(pt);
        }
      }

      const [cgx, cgy] = currentKey.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nKey = `${cgx + dx},${cgy + dy}`;
          if (grid.has(nKey) && !visitedCells.has(nKey)) {
            visitedCells.add(nKey);
            queue.push(nKey);
          }
        }
      }
    }

    if (clusterPoints.length >= effectiveMinPixels) {
      let sumX = 0;
      let sumY = 0;
      let minX = width;
      let maxX = 0;
      let minY = height;
      let maxY = 0;

      for (const [px, py] of clusterPoints) {
        sumX += px;
        sumY += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;

      if (bw > 180 || bh > 180) continue;

      const aspect = Math.min(bw, bh) / Math.max(bw, bh || 1);
      const score = clusterPoints.length * (1 + aspect * 1.5);

      rawClusters.push({
        points: clusterPoints,
        cx: sumX / clusterPoints.length,
        cy: sumY / clusterPoints.length,
        minX,
        maxX,
        minY,
        maxY,
        count: clusterPoints.length,
        score,
      });
    }
  }

  rawClusters.sort((a, b) => b.score - a.score);

  return rawClusters.slice(0, maxCount).map((c) => {
    const radius = Math.max(14, (c.maxX - c.minX + c.maxY - c.minY) / 4);
    return {
      x: c.cx,
      y: c.cy,
      radius,
      pixelCount: c.count,
      confidence: Math.min(1.0, Math.max(0.45, (c.count / 24) * 0.95)),
      bbox: {
        minX: c.minX,
        maxX: c.maxX,
        minY: c.minY,
        maxY: c.maxY,
      },
    };
  });
}

/**
 * High-performance OpenCV-style Blob Detection:
 * - Detects 2 Player Blobs (Default: Magenta, 2 fixed for 1P & 2P)
 * - Simultaneously detects up to N Obstacle Robot Blobs (Default: Cyan, default 2, configurable 0..10)
 */
export function detectTwoMagentaBlobs(
  imageData: ImageData,
  colorSettingsOrFilter: ColorSettings | ColorFilter,
  minPixels: number,
  maxPixels: number,
  deskPolyPixels?: CalibrationCorners | Point2D[] | null,
  debugMaskData?: ImageData | null,
  lastBluePos?: Point2D | null,
  lastRedPos?: Point2D | null
): {
  blueBlob: DetectedBlob | null;
  redBlob: DetectedBlob | null;
  obstacleBlobs: DetectedBlob[];
  allBlobs: DetectedBlob[];
} {
  const { data, width, height } = imageData;
  const maskData = debugMaskData?.data;

  // Normalize settings
  const settings: ColorSettings =
    'visionEngine' in colorSettingsOrFilter
      ? (colorSettingsOrFilter as ColorSettings)
      : {
          magenta: colorSettingsOrFilter as ColorFilter,
          cyan: DEFAULT_COLOR_SETTINGS.cyan,
          obstacleCount: 2,
          minBlobSize: minPixels,
          maxBlobSize: maxPixels,
          visionEngine: 'CHROMATIC',
          sensitivity: 3,
          lowLightMode: false,
        };

  const maxObstacles = Math.max(0, Math.min(10, settings.obstacleCount ?? 2));
  const magentaPoints: Array<[number, number]> = [];
  const cyanPoints: Array<[number, number]> = [];

  // Calculate Bounding Box of deskPolyPixels to avoid scanning outside areas
  let startX = 0;
  let endX = width;
  let startY = 0;
  let endY = height;
  if (deskPolyPixels && deskPolyPixels.length >= 4) {
    const xs = deskPolyPixels.map((p) => p.x);
    const ys = deskPolyPixels.map((p) => p.y);
    startX = Math.max(0, Math.floor(Math.min(...xs)) - 4);
    endX = Math.min(width, Math.ceil(Math.max(...xs)) + 4);
    startY = Math.max(0, Math.floor(Math.min(...ys)) - 4);
    endY = Math.min(height, Math.ceil(Math.max(...ys)) + 4);
  }

  const step = 2;
  const effectiveMinPixels = Math.max(3, Math.floor(minPixels / 3));

  // Pass 1: Ultra-fast pixel classification strictly inside calibrated court ROI
  for (let y = startY; y < endY; y += step) {
    const rowOffset = y * width;
    for (let x = startX; x < endX; x += step) {
      if (deskPolyPixels && !isPointInConvexQuad(x, y, deskPolyPixels, 6)) {
        continue;
      }

      const idx = (rowOffset + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (isMagentaPixelByEngine(r, g, b, settings)) {
        magentaPoints.push([x, y]);
        if (maskData) {
          for (let my = 0; my < step && y + my < height; my++) {
            for (let mx = 0; mx < step && x + mx < width; mx++) {
              const mIdx = ((y + my) * width + (x + mx)) * 4;
              maskData[mIdx] = 244;
              maskData[mIdx + 1] = 63;
              maskData[mIdx + 2] = 142;
              maskData[mIdx + 3] = 255;
            }
          }
        }
      } else if (maxObstacles > 0 && isCyanPixelByEngine(r, g, b, settings)) {
        cyanPoints.push([x, y]);
        if (maskData) {
          for (let my = 0; my < step && y + my < height; my++) {
            for (let mx = 0; mx < step && x + mx < width; mx++) {
              const mIdx = ((y + my) * width + (x + mx)) * 4;
              maskData[mIdx] = 6;
              maskData[mIdx + 1] = 182;
              maskData[mIdx + 2] = 212;
              maskData[mIdx + 3] = 255;
            }
          }
        }
      }
    }
  }

  const magentaBlobs = clusterCandidatePoints(magentaPoints, effectiveMinPixels, width, height, 2 + maxObstacles);
  const cyanBlobs = clusterCandidatePoints(cyanPoints, effectiveMinPixels, width, height, maxObstacles);

  const playerAssigned = assignBlobs(magentaBlobs, width, lastBluePos, lastRedPos);
  const { blueBlob, redBlob } = playerAssigned;

  // Collect Cyan obstacle blobs (excluding any accidental overlap with 1P/2P)
  const obstacleBlobs: DetectedBlob[] = [];
  for (const cb of cyanBlobs) {
    if (obstacleBlobs.length >= maxObstacles) break;
    const tooCloseBlue = blueBlob && Math.hypot(cb.x - blueBlob.x, cb.y - blueBlob.y) < 22;
    const tooCloseRed = redBlob && Math.hypot(cb.x - redBlob.x, cb.y - redBlob.y) < 22;
    if (!tooCloseBlue && !tooCloseRed) {
      obstacleBlobs.push(cb);
    }
  }

  // Fallback: if extra Magenta blobs (> 2) exist and obstacleBlobs < maxObstacles, include them too
  for (const mb of magentaBlobs) {
    if (obstacleBlobs.length >= maxObstacles) break;
    if (mb !== blueBlob && mb !== redBlob) {
      obstacleBlobs.push(mb);
    }
  }

  const allBlobs: DetectedBlob[] = [
    ...(blueBlob ? [blueBlob] : []),
    ...(redBlob ? [redBlob] : []),
    ...obstacleBlobs,
  ];

  return { blueBlob, redBlob, obstacleBlobs, allBlobs };
}

/**
 * Pairs detected player blobs with Blue (1P) and Red (2P) robots (2 fixed).
 */
export function assignBlobs(
  blobsInput: DetectedBlob[],
  width: number,
  lastBluePos?: Point2D | null,
  lastRedPos?: Point2D | null
): {
  blueBlob: DetectedBlob | null;
  redBlob: DetectedBlob | null;
  allBlobs: DetectedBlob[];
} {
  const allBlobs = blobsInput.slice(0, 10);
  if (allBlobs.length === 0) {
    return { blueBlob: null, redBlob: null, allBlobs: [] };
  }

  const MAX_TELEPORT_DIST = 260;
  const midX = width / 2;

  // 1 blob detected:
  if (allBlobs.length === 1) {
    const single = allBlobs[0];
    if (lastBluePos && !lastRedPos) {
      return { blueBlob: single, redBlob: null, allBlobs };
    }
    if (lastRedPos && !lastBluePos) {
      return { blueBlob: null, redBlob: single, allBlobs };
    }
    if (lastBluePos && lastRedPos) {
      const dBlue = Math.hypot(single.x - lastBluePos.x, single.y - lastBluePos.y);
      const dRed = Math.hypot(single.x - lastRedPos.x, single.y - lastRedPos.y);
      return dBlue <= dRed
        ? { blueBlob: single, redBlob: null, allBlobs }
        : { blueBlob: null, redBlob: single, allBlobs };
    }
    return single.x < midX
      ? { blueBlob: single, redBlob: null, allBlobs }
      : { blueBlob: null, redBlob: single, allBlobs };
  }

  // 2 or more blobs detected:
  let blueBlob: DetectedBlob | null = null;
  let redBlob: DetectedBlob | null = null;

  if (lastBluePos && lastRedPos) {
    let bestDist = Infinity;
    let bestPair: [number, number] = [0, 1];

    for (let i = 0; i < allBlobs.length; i++) {
      for (let j = 0; j < allBlobs.length; j++) {
        if (i === j) continue;
        const dB = Math.hypot(allBlobs[i].x - lastBluePos.x, allBlobs[i].y - lastBluePos.y);
        const dR = Math.hypot(allBlobs[j].x - lastRedPos.x, allBlobs[j].y - lastRedPos.y);
        const total = dB + dR;
        if (total < bestDist) {
          bestDist = total;
          bestPair = [i, j];
        }
      }
    }

    if (bestDist < MAX_TELEPORT_DIST * 2) {
      blueBlob = allBlobs[bestPair[0]];
      redBlob = allBlobs[bestPair[1]];
    }
  }

  // Fallback / spatial prior: leftmost is Blue (1P), rightmost is Red (2P)
  if (!blueBlob || !redBlob) {
    const sortedByX = [...allBlobs].sort((a, b) => a.x - b.x);
    blueBlob = sortedByX[0];
    redBlob = sortedByX[sortedByX.length - 1];
  }

  return { blueBlob, redBlob, allBlobs };
}

/**
 * Samples average color at clicked pixel point (Eyedropper tool)
 */
export function sampleColorAtPoint(
  imageData: ImageData,
  centerX: number,
  centerY: number,
  radius = 5
): { r: number; g: number; b: number; h: number; s: number; v: number; rgb: string; hex: string } | null {
  const { data, width, height } = imageData;
  const cx = Math.floor(centerX);
  const cy = Math.floor(centerY);

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sampledCount = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= width) continue;

      const idx = (y * width + x) * 4;
      sumR += data[idx];
      sumG += data[idx + 1];
      sumB += data[idx + 2];
      sampledCount++;
    }
  }

  if (sampledCount === 0) return null;

  const avgR = Math.round(sumR / sampledCount);
  const avgG = Math.round(sumG / sampledCount);
  const avgB = Math.round(sumB / sampledCount);

  const hsv = rgbToHsv(avgR, avgG, avgB);
  const hex = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;

  return {
    r: avgR,
    g: avgG,
    b: avgB,
    ...hsv,
    rgb: `rgb(${avgR}, ${avgG}, ${avgB})`,
    hex,
  };
}

export function createFilterFromSample(hsv: { h: number; s: number; v: number }, hueTolerance = 35): ColorFilter {
  let hMin = Math.round(hsv.h - hueTolerance);
  let hMax = Math.round(hsv.h + hueTolerance);

  if (hMin < 0) hMin += 360;
  if (hMax >= 360) hMax -= 360;

  return {
    hMin,
    hMax,
    sMin: Math.max(0.14, Number((hsv.s - 0.28).toFixed(2))),
    sMax: 1.0,
    vMin: Math.max(0.14, Number((hsv.v - 0.32).toFixed(2))),
    vMax: 1.0,
  };
}
