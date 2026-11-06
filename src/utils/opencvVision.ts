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
 * [REQ] Enhanced OpenCV Vision Engine with:
 * 1. Dark Room / Low-Light Optimization (Auto brightness & contrast boost for lights-off play)
 * 2. Excess-Magenta Chromatic Verification (Eliminates skin-tone, projector white glare & color jitter)
 * 3. 8-Point Perimeter ROI masking (Works seamlessly with 8-point distortion calibration)
 */
export function detectTwoMagentaBlobsOpenCV(
  imageData: ImageData,
  settings: ColorSettings,
  courtPoints?: CalibrationCorners | null,
  debugMaskData?: ImageData | null,
  lastBluePos?: Point2D | null,
  lastRedPos?: Point2D | null
): OpenCVDetectResult | null {
  const cv = cvInstance;
  if (!cv) return null;

  const { width, height } = imageData;
  const isLowLight = Boolean(settings.lowLightMode);
  const sens = settings.sensitivity || 3;

  // HSV Filter parameters
  const f = settings.customSample
    ? settings.magenta
    : {
        hMin: 260, // Wrap-around magenta (260 deg to 20 deg)
        hMax: 20,
        sMin: isLowLight ? 0.12 : 0.22,
        sMax: 1.0,
        vMin: isLowLight ? 0.05 : 0.14,
        vMax: 1.0,
      };

  // Adjust thresholds by sensitivity level (1..5)
  const sFloor = isLowLight
    ? Math.max(0.08, f.sMin - (sens - 3) * 0.04)
    : Math.max(0.14, f.sMin - (sens - 3) * 0.05);

  const vFloor = isLowLight
    ? Math.max(0.04, f.vMin - (sens - 3) * 0.03)
    : Math.max(0.10, f.vMin - (sens - 3) * 0.04);

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

    // [REQ] Low-Light / Dark Room Mode: Auto-gain & gamma stretch to illuminate dark blocks
    if (isLowLight) {
      const brightened = track(new cv.Mat());
      // alpha = 1.45 (contrast), beta = 22 (brightness boost)
      cv.convertScaleAbs(rgb, brightened, 1.45, 22);
      rgb = brightened;
    }

    // 1. Noise reduction via gentle Gaussian Blur
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(rgb, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // 2. Convert to HSV
    const hsv = track(new cv.Mat());
    cv.cvtColor(blurred, hsv, cv.COLOR_RGB2HSV);

    // 3. Color thresholding inRange (supporting 360/0 degree hue wrap-around)
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

    // 4. [REQ] Anti-Jitter Chromatic Filter: reject skin-tone (hands) and projector white reflections
    // For every magenta pixel, verify that Red and Blue are significantly stronger than Green!
    if (!settings.customSample) {
      const rgbPlanes = track(new cv.MatVector());
      cv.split(rgb, rgbPlanes);
      const rPlane = rgbPlanes.get(0);
      const gPlane = rgbPlanes.get(1);
      const bPlane = rgbPlanes.get(2);

      // Chroma conditions: (R > G * 1.25) and (B > G * 1.15)
      const diffRG = track(new cv.Mat());
      const diffBG = track(new cv.Mat());
      cv.subtract(rPlane, gPlane, diffRG);
      cv.subtract(bPlane, gPlane, diffBG);

      const threshRG = track(new cv.Mat());
      const threshBG = track(new cv.Mat());
      const minDiff = isLowLight ? 8 : 14;
      cv.threshold(diffRG, threshRG, minDiff, 255, cv.THRESH_BINARY);
      cv.threshold(diffBG, threshBG, Math.max(5, minDiff - 4), 255, cv.THRESH_BINARY);

      const chromaMask = track(new cv.Mat());
      cv.bitwise_and(threshRG, threshBG, chromaMask);
      cv.bitwise_and(mask, chromaMask, mask);

      rPlane.delete();
      gPlane.delete();
      bPlane.delete();
    }

    // 5. [REQ] 8-Point or 4-Point Perimeter Court Masking
    if (courtPoints && courtPoints.length >= 4) {
      const roi = track(cv.Mat.zeros(height, width, cv.CV_8UC1));
      const polyPts = courtPoints.map((p) => [Math.round(p.x), Math.round(p.y)]).flat();
      const ptsMat = track(
        cv.matFromArray(courtPoints.length, 1, cv.CV_32SC2, polyPts)
      );
      const vec = track(new cv.MatVector());
      vec.push_back(ptsMat);
      cv.fillPoly(roi, vec, new cv.Scalar(255));
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

    const minArea = Math.max(4, Math.floor(settings.minBlobSize / 3));
    const maxArea = settings.maxBlobSize || 12000;
    const scored: Array<{ blob: DetectedBlob; score: number }> = [];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area >= minArea && area <= maxArea) {
        const r = cv.boundingRect(cnt);
        // Reject table-wide glare washes
        if (r.width <= 140 && r.height <= 140) {
          const m = cv.moments(cnt, false);
          const cx = m.m00 > 0 ? m.m10 / m.m00 : r.x + r.width / 2;
          const cy = m.m00 > 0 ? m.m01 / m.m00 : r.y + r.height / 2;
          const aspect = Math.min(r.width, r.height) / Math.max(r.width, r.height || 1);
          // High compactness score preferred for rectangular/square Lego blocks
          scored.push({
            score: area * (1 + aspect * 1.8),
            blob: {
              x: cx,
              y: cy,
              radius: Math.max(14, (r.width + r.height) / 4),
              pixelCount: Math.round(area),
              confidence: Math.min(1.0, Math.max(0.45, (area / 20) * 0.95)),
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
        // already cleaned
      }
    }
  }
}
