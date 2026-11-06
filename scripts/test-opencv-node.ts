// Runs the OpenCV (opencv.js WASM) engine under plain Node.js: `npx tsx scripts/test-opencv-node.ts`
import { loadOpenCV, detectTwoMagentaBlobsOpenCV } from '../src/utils/opencvVision';
import { DEFAULT_COLOR_SETTINGS } from '../src/utils/vision';

const W = 640;
const H = 360;
const data = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) {
  data[i * 4] = 120; // gray table
  data[i * 4 + 1] = 120;
  data[i * 4 + 2] = 120;
  data[i * 4 + 3] = 255;
}
const box = (x0: number, y0: number, size: number, rgb: [number, number, number]) => {
  for (let y = y0; y < y0 + size; y++)
    for (let x = x0; x < x0 + size; x++) {
      const o = (y * W + x) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
    }
};
box(150, 160, 24, [220, 40, 190]); // magenta block (left)
box(470, 150, 24, [230, 50, 200]); // magenta block (right)
box(300, 100, 30, [235, 190, 150]); // skin-like patch (must be ignored)

const t0 = Date.now();
const cv = await loadOpenCV();
console.log('OpenCV loaded:', !!cv, `${Date.now() - t0}ms`);

const image = { data, width: W, height: H } as unknown as ImageData;
const t1 = performance.now();
const res = detectTwoMagentaBlobsOpenCV(image, DEFAULT_COLOR_SETTINGS);
console.log(`detect: ${(performance.now() - t1).toFixed(1)}ms`);
console.log('blue :', res?.blueBlob && { x: res.blueBlob.x.toFixed(1), y: res.blueBlob.y.toFixed(1) });
console.log('red  :', res?.redBlob && { x: res.redBlob.x.toFixed(1), y: res.redBlob.y.toFixed(1) });
console.log('blobs:', res?.allBlobs.length);
process.exit(res && res.allBlobs.length === 2 ? 0 : 1);
