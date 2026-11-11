import { ColorSettings, FourCorners, EightPoints, CalibrationCorners, Point2D } from '../types/hockey';
import { DetectedBlob, assignBlobs } from './vision';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

let cvInstance: CV | null = null;
let cvPromise: Promise<CV | null> | null = null;
let cvFailed = false;

export function isOpenCVReady(): boolean {
  return cvInstance !== null;
}

export function hasOpenCVFailed(): boolean {
  return cvFailed;
}

export function loadOpenCV(): Promise<CV | null> {
  if (cvInstance) return Promise.resolve(cvInstance);
  if (cvPromise) return cvPromise;

  cvPromise = import('@techstark/opencv-js')
    .then(async (mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cv: any = (mod as any).default ?? mod;
      if (typeof cv?.then === 'function') {
        cv = await cv;
      }
      if (!cv?.Mat) {
        await new Promise<void>((resolve) => {
          cv.onRuntimeInitialized = () => resolve();
        });
      }
      cvInstance = cv;
      return cv;
    })
    .catch((err) => {
      console.warn('OpenCV load failed, falling back to JS engine:', err);
      cvFailed = true;
      return null;
    });

  return cvPromise;
}

export interface OpenCVDetectResult {
  blueBlob: DetectedBlob | null;
  redBlob: DetectedBlob | null;
  obstacleBlobs: DetectedBlob[];
  allBlobs: DetectedBlob[];
}

/**
 * Robust OpenCV Vision Engine:
 * - Pass A: Detects 2 Player Markers (Default: Magenta, or Camera-Sampled customSample) -> 1P & 2P (2 fixed)
 * - Pass B: Detects up to N Obstacle Robot Markers (Default: Cyan, or Camera-Sampled obstacleCustomSample, 0..10) -> Obstacle Robots
 */
export function detectTwoMagentaBlobsOpenCV(
  imageData: ImageData,
  settings: ColorSettings,
  courtPoints?: CalibrationCorners | Point2D[] | null,
  debugMaskData?: ImageData | null,
  lastBluePos?: Point2D | null,
  lastRedPos?: Point2D | null
): OpenCVDetectResult | null {
  const cv = cvInstance;
  if (!cv) return null;

  const { width, height } = imageData;
  const isLowLight = Boolean(settings.lowLightMode);
  const sens = settings.sensitivity || 3;
  const maxObstacles = Math.max(0, Math.min(10, settings.obstacleCount ?? 2));

  // 1. Player Filter (Default: Magenta 255~25 deg)
  const playerFilter = settings.customSample
    ? settings.magenta
    : {
        hMin: 255,
        hMax: 25,
        sMin: isLowLight ? 0.08 : 0.12,
        sMax: 1.0,
        vMin: isLowLight ? 0.04 : 0.08,
        vMax: 1.0,
      };

  // 2. Obstacle Robot Filter (Default: Cyan 165~215 deg)
  const obstacleFilter = settings.obstacleCustomSample && settings.cyan
    ? settings.cyan
    : settings.cyan || {
        hMin: 165,
        hMax: 215,
        sMin: isLowLight ? 0.10 : 0.15,
        sMax: 1.0,
        vMin: isLowLight ? 0.06 : 0.10,
        vMax: 1.0,
      };

  const toH = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 2);

  const mats: Array<{ delete: () => void }> = [];
  const track = <T extends { delete: () => void }>(m: T): T => {
    mats.push(m);
    return m;
  };

  try {
    const rgba = track(cv.matFromImageData(imageData));
    let rgb = track(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);

    if (isLowLight) {
      const brightened = track(new cv.Mat());
      cv.convertScaleAbs(rgb, brightened, 1.40, 20);
      rgb = brightened;
    }

    const blurred = track(new cv.Mat());
    cv.GaussianBlur(rgb, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    const hsv = track(new cv.Mat());
    cv.cvtColor(blurred, hsv, cv.COLOR_RGB2HSV);

    // Prepare ROI polygon mask if courtPoints are provided
    let roiMask: any = null;
    if (courtPoints && courtPoints.length >= 4) {
      roiMask = track(cv.Mat.zeros(height, width, cv.CV_8UC1));
      const polyPts = courtPoints.map((p) => [Math.round(p.x), Math.round(p.y)]).flat();
      const ptsMat = track(cv.matFromArray(courtPoints.length, 1, cv.CV_32SC2, polyPts));
      const vec = track(new cv.MatVector());
      vec.push_back(ptsMat);
      cv.fillPoly(roiMask, vec, new cv.Scalar(255));
    }

    const kernel = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
    const minArea = Math.max(3, Math.floor(settings.minBlobSize / 4));
    const maxArea = settings.maxBlobSize || 15000;

    // Helper to build HSV mask and extract contours
    const extractBlobsForFilter = (
      f: { hMin: number; hMax: number; sMin: number; sMax: number; vMin: number; vMax: number },
      mode: 'PLAYER' | 'OBSTACLE',
      maxLimit: number
    ): DetectedBlob[] => {
      if (maxLimit <= 0) return [];

      const sFloor = Math.max(0.06, f.sMin - (sens - 3) * 0.03);
      const vFloor = Math.max(0.04, f.vMin - (sens - 3) * 0.025);
      const s0 = Math.round(Math.min(1, sFloor) * 255);
      const s1 = Math.round(Math.min(1, f.sMax) * 255);
      const v0 = Math.round(Math.min(1, vFloor) * 255);
      const v1 = Math.round(Math.min(1, f.vMax) * 255);
      const hMin = toH(f.hMin);
      const hMax = toH(f.hMax);

      const mask = track(new cv.Mat());
      const makeBounds = (h0: number, h1: number) => ({
        lo: track(new cv.Mat(height, width, cv.CV_8UC3, new cv.Scalar(h0, s0, v0))),
        hi: track(new cv.Mat(height, width, cv.CV_8UC3, new cv.Scalar(h1, s1, v1))),
      });

      if (hMin <= hMax) {
        const b = makeBounds(hMin, hMax);
        cv.inRange(hsv, b.lo, b.hi, mask);
      } else {
        const a = makeBounds(hMin, 179);
        const b = makeBounds(0, hMax);
        const m1 = track(new cv.Mat());
        const m2 = track(new cv.Mat());
        cv.inRange(hsv, a.lo, a.hi, m1);
        cv.inRange(hsv, b.lo, b.hi, m2);
        cv.bitwise_or(m1, m2, mask);
      }

      // Chromatic verification when using default Magenta or default Cyan
      if (mode === 'PLAYER' && !settings.customSample) {
        const rgbPlanes = track(new cv.MatVector());
        cv.split(rgb, rgbPlanes);
        const rPlane = rgbPlanes.get(0);
        const gPlane = rgbPlanes.get(1);
        const diffRG = track(new cv.Mat());
        cv.subtract(rPlane, gPlane, diffRG);
        const threshRG = track(new cv.Mat());
        cv.threshold(diffRG, threshRG, isLowLight ? 6 : 10, 255, cv.THRESH_BINARY);
        cv.bitwise_and(mask, threshRG, mask);
        rPlane.delete();
        gPlane.delete();
        rgbPlanes.get(2).delete();
      } else if (mode === 'OBSTACLE' && !settings.obstacleCustomSample) {
        const rgbPlanes = track(new cv.MatVector());
        cv.split(rgb, rgbPlanes);
        const rPlane = rgbPlanes.get(0);
        const gPlane = rgbPlanes.get(1);
        const bPlane = rgbPlanes.get(2);
        const diffBR = track(new cv.Mat());
        cv.subtract(bPlane, rPlane, diffBR);
        const threshBR = track(new cv.Mat());
        cv.threshold(diffBR, threshBR, isLowLight ? 6 : 10, 255, cv.THRESH_BINARY);
        cv.bitwise_and(mask, threshBR, mask);
        rPlane.delete();
        gPlane.delete();
        bPlane.delete();
      }

      if (roiMask) {
        cv.bitwise_and(mask, roiMask, mask);
      }

      cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
      cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);

      if (debugMaskData) {
        const out = debugMaskData.data;
        const md = mask.data as Uint8Array;
        const colorR = mode === 'PLAYER' ? 244 : 6;
        const colorG = mode === 'PLAYER' ? 63 : 182;
        const colorB = mode === 'PLAYER' ? 142 : 212;
        for (let i = 0, n = width * height; i < n; i++) {
          if (md[i]) {
            const o = i * 4;
            out[o] = colorR;
            out[o + 1] = colorG;
            out[o + 2] = colorB;
            out[o + 3] = 255;
          }
        }
      }

      const contours = track(new cv.MatVector());
      const hierarchy = track(new cv.Mat());
      cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const scored: Array<{ blob: DetectedBlob; score: number }> = [];
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area >= minArea && area <= maxArea) {
          const r = cv.boundingRect(cnt);
          if (r.width <= 160 && r.height <= 160) {
            const m = cv.moments(cnt, false);
            const cx = m.m00 > 0 ? m.m10 / m.m00 : r.x + r.width / 2;
            const cy = m.m00 > 0 ? m.m01 / m.m00 : r.y + r.height / 2;
            const aspect = Math.min(r.width, r.height) / Math.max(r.width, r.height || 1);
            scored.push({
              score: area * (1 + aspect * 1.6),
              blob: {
                x: cx,
                y: cy,
                radius: Math.max(14, (r.width + r.height) / 4),
                pixelCount: Math.round(area),
                confidence: Math.min(1.0, Math.max(0.45, (area / 18) * 0.95)),
                bbox: { minX: r.x, maxX: r.x + r.width, minY: r.y, maxY: r.y + r.height },
              },
            });
          }
        }
        cnt.delete();
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, maxLimit).map((s) => s.blob);
    };

    const magentaBlobs = extractBlobsForFilter(playerFilter, 'PLAYER', 2 + maxObstacles);
    const cyanBlobs = extractBlobsForFilter(obstacleFilter, 'OBSTACLE', maxObstacles);

    const playerAssigned = assignBlobs(magentaBlobs, width, lastBluePos, lastRedPos);
    const { blueBlob, redBlob } = playerAssigned;

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
  } catch (err) {
    console.warn('OpenCV detection error:', err);
    return null;
  } finally {
    for (const m of mats) {
      try {
        m.delete();
      } catch {
        // cleaned
      }
    }
  }
}
