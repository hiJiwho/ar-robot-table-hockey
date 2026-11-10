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
  allBlobs: DetectedBlob[];
}

/**
 * Robust OpenCV Vision Engine:
 * - High-speed HSV dual-range segmentation (supporting 360/0 degree magenta wrap-around)
 * - Projector-proof & Skin-proof chromatic filtering
 * - 8-Point or 4-Point Table ROI confinement
 * - Morphological noise removal & contour moment centroiding
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

  // HSV Filter parameters:
  // Magenta spans 250 ~ 360 and 0 ~ 25 degrees.
  const f = settings.customSample
    ? settings.magenta
    : {
        hMin: 240, // [REQ] 240~360 & 0~35 광대역 마젠타/핫핑크/바이올렛 OBS 완벽 인식
        hMax: 35,
        sMin: isLowLight ? 0.04 : 0.07,
        sMax: 1.0,
        vMin: isLowLight ? 0.03 : 0.06,
        vMax: 1.0,
      };

  // Sensitivity level (1=strict, 5=ultra-wide)
  const sFloor = Math.max(0.06, f.sMin - (sens - 3) * 0.03);
  const vFloor = Math.max(0.04, f.vMin - (sens - 3) * 0.025);

  const toH = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 2);
  const s0 = Math.round(Math.min(1, sFloor) * 255);
  const s1 = Math.round(Math.min(1, f.sMax) * 255);
  const v0 = Math.round(Math.min(1, vFloor) * 255);
  const v1 = Math.round(Math.min(1, f.vMax) * 255);
  const hMin = toH(f.hMin);
  const hMax = toH(f.hMax);

  const mats: Array<{ delete: () => void }> = [];
  const track = <T extends { delete: () => void }>(m: T): T => {
    mats.push(m);
    return m;
  };

  try {
    const rgba = track(cv.matFromImageData(imageData));
    let rgb = track(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);

    // Dark Room Mode: Gamma & exposure boost
    if (isLowLight) {
      const brightened = track(new cv.Mat());
      cv.convertScaleAbs(rgb, brightened, 1.40, 20);
      rgb = brightened;
    }

    // 1. Noise reduction via gentle Gaussian Blur
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(rgb, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // 2. Convert to HSV
    const hsv = track(new cv.Mat());
    cv.cvtColor(blurred, hsv, cv.COLOR_RGB2HSV);

    // 3. Color thresholding inRange (supporting wrap-around)
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

    // 4. Smart Chromatic Verification (Eliminate skin tone and projector white reflection)
    // Real Lego Magenta: R > G (Red is dominant over Green by at least 8 units)
    if (!settings.customSample) {
      const rgbPlanes = track(new cv.MatVector());
      cv.split(rgb, rgbPlanes);
      const rPlane = rgbPlanes.get(0);
      const gPlane = rgbPlanes.get(1);

      const diffRG = track(new cv.Mat());
      cv.subtract(rPlane, gPlane, diffRG);

      const threshRG = track(new cv.Mat());
      const minDiff = isLowLight ? 6 : 10;
      cv.threshold(diffRG, threshRG, minDiff, 255, cv.THRESH_BINARY);

      cv.bitwise_and(mask, threshRG, mask);

      rPlane.delete();
      gPlane.delete();
      rgbPlanes.get(2).delete();
    }

    // 5. Perimeter Court ROI Masking (With 45px safety buffer to prevent paddle clipping)
    if (courtPoints && courtPoints.length >= 4) {
      const roi = track(cv.Mat.zeros(height, width, cv.CV_8UC1));
      const polyPts = courtPoints.map((p) => [Math.round(p.x), Math.round(p.y)]).flat();
      const ptsMat = track(
        cv.matFromArray(courtPoints.length, 1, cv.CV_32SC2, polyPts)
      );
      const vec = track(new cv.MatVector());
      vec.push_back(ptsMat);
      cv.fillPoly(roi, vec, new cv.Scalar(255));
      // 45px Dilate so paddles near goals/rails are never clipped out!
      const dilateKernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(45, 45)));
      cv.dilate(roi, roi, dilateKernel);
      cv.bitwise_and(mask, roi, mask);
    }

    // 6. Morphological cleanup: remove speckles, seal small gaps
    const kernel = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);

    // Render debug mask overlay if requested
    if (debugMaskData) {
      const out = debugMaskData.data;
      const md = mask.data as Uint8Array;
      for (let i = 0, n = width * height; i < n; i++) {
        if (md[i]) {
          const o = i * 4;
          out[o] = 244;
          out[o + 1] = 63;
          out[o + 2] = 142;
          out[o + 3] = 255;
        }
      }
    }

    // 7. Find contours and extract centroid blobs
    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = Math.max(3, Math.floor(settings.minBlobSize / 4));
    const maxArea = settings.maxBlobSize || 15000;
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
    // Keep up to 10 detected blobs (2 player paddles + up to 8 obstacle robots)
    const allBlobs = scored.slice(0, 10).map((s) => s.blob);

    return assignBlobs(allBlobs, width, lastBluePos, lastRedPos);
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
