import { ColorSettings, FourCorners, Point2D } from '../types/hockey';
import { DetectedBlob, assignBlobs } from './vision';

/**
 * OpenCV (opencv.js / WebAssembly) vision engine.
 *
 * opencv.js is the official OpenCV compiled to WASM, so it runs inside Electron
 * (renderer = Chromium, main = Node.js) and in plain Node.js without any native build step
 * (unlike opencv4nodejs, which needs a local CMake/OpenCV compile on Windows).
 *
 * Pipeline: RGBA -> RGB -> HSV -> GaussianBlur -> inRange (hue wrap-around aware)
 *           -> court ROI mask -> morphology open/close -> findContours -> moments -> blobs
 */

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

/** Lazily loads the opencv.js WASM runtime (only once, ~10MB, loaded in the background). */
export function loadOpenCV(): Promise<CV | null> {
  if (cvInstance) return Promise.resolve(cvInstance);
  if (cvPromise) return cvPromise;

  cvPromise = import('@techstark/opencv-js')
    .then(async (mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cv: any = (mod as any).default ?? mod;
      // Newer builds export a Promise / thenable that resolves once WASM is initialised
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
 * Detects the two magenta blocks using OpenCV. Returns null if OpenCV is not loaded yet
 * (caller should fall back to the JS engine for that frame).
 */
export function detectTwoMagentaBlobsOpenCV(
  imageData: ImageData,
  settings: ColorSettings,
  deskQuadPixels?: FourCorners | null,
  debugMaskData?: ImageData | null,
  lastBluePos?: Point2D | null,
  lastRedPos?: Point2D | null
): OpenCVDetectResult | null {
  const cv = cvInstance;
  if (!cv) return null;

  const { width, height } = imageData;

  // Without a user-picked sample the stock filter spans 275..20deg (includes skin / orange-red),
  // so use a tight pure magenta/fuchsia band instead. A picked sample (eyedropper) is respected as-is.
  const f = settings.customSample
    ? settings.magenta
    : { ...settings.magenta, hMin: 270, hMax: 350, sMin: Math.max(settings.magenta.sMin, 0.3) };

  // Sensitivity (1..5) loosens / tightens saturation & value floors
  const sens = settings.sensitivity || 3;
  const sFloor = Math.max(0, f.sMin - (sens - 3) * 0.06);
  const vFloor = Math.max(0, f.vMin - (sens - 3) * 0.05);

  // OpenCV HSV ranges: H 0..179 (deg/2), S/V 0..255
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
    const rgb = track(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);

    const blurred = track(new cv.Mat());
    cv.GaussianBlur(rgb, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    const hsv = track(new cv.Mat());
    cv.cvtColor(blurred, hsv, cv.COLOR_RGB2HSV);

    const mask = track(new cv.Mat());
    const makeBounds = (h0: number, h1: number) => ({
      lo: track(new cv.Mat(height, width, cv.CV_8UC3, new cv.Scalar(h0, s0, v0))),
      hi: track(new cv.Mat(height, width, cv.CV_8UC3, new cv.Scalar(h1, s1, v1))),
    });

    if (hMin <= hMax) {
      const b = makeBounds(hMin, hMax);
      cv.inRange(hsv, b.lo, b.hi, mask);
    } else {
      // Hue wrap-around (e.g. 275deg .. 20deg): union of two ranges
      const a = makeBounds(hMin, 179);
      const b = makeBounds(0, hMax);
      const m1 = track(new cv.Mat());
      const m2 = track(new cv.Mat());
      cv.inRange(hsv, a.lo, a.hi, m1);
      cv.inRange(hsv, b.lo, b.hi, m2);
      cv.bitwise_or(m1, m2, mask);
    }

    // Restrict to calibrated court polygon
    if (deskQuadPixels) {
      const roi = track(cv.Mat.zeros(height, width, cv.CV_8UC1));
      const pts = track(
        cv.matFromArray(
          4,
          1,
          cv.CV_32SC2,
          deskQuadPixels.flatMap((p) => [Math.round(p.x), Math.round(p.y)])
        )
      );
      const vec = track(new cv.MatVector());
      vec.push_back(pts);
      cv.fillPoly(roi, vec, new cv.Scalar(255));
      cv.bitwise_and(mask, roi, mask);
    }

    // Remove noise, then close small holes inside the block
    const kernel = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);

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

    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = Math.max(3, settings.minBlobSize / 3);
    const maxArea = settings.maxBlobSize;
    const scored: Array<{ blob: DetectedBlob; score: number }> = [];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area >= minArea && area <= maxArea) {
        const r = cv.boundingRect(cnt);
        // Discard giant light washes / table-wide artefacts
        if (r.width <= 180 && r.height <= 180) {
          const m = cv.moments(cnt, false);
          const cx = m.m00 > 0 ? m.m10 / m.m00 : r.x + r.width / 2;
          const cy = m.m00 > 0 ? m.m01 / m.m00 : r.y + r.height / 2;
          const aspect = Math.min(r.width, r.height) / Math.max(r.width, r.height || 1);
          scored.push({
            score: area * (1 + aspect * 1.5),
            blob: {
              x: cx,
              y: cy,
              radius: Math.max(14, (r.width + r.height) / 4),
              pixelCount: Math.round(area),
              confidence: Math.min(1.0, Math.max(0.45, (area / 24) * 0.95)),
              bbox: { minX: r.x, maxX: r.x + r.width, minY: r.y, maxY: r.y + r.height },
            },
          });
        }
      }
      cnt.delete();
    }

    scored.sort((a, b) => b.score - a.score);
    const allBlobs = scored.map((s) => s.blob);
    return assignBlobs(allBlobs, width, lastBluePos, lastRedPos);
  } catch (err) {
    console.warn('OpenCV detection error:', err);
    return null;
  } finally {
    for (const m of mats) {
      try {
        m.delete();
      } catch {
        // already freed
      }
    }
  }
}
