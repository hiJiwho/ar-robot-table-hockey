import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

// Serve static build assets
app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint for Cloud Run container monitoring
app.get('/healthz', (_req, res) => {
  res.status(200).send('OK');
});

// SPA fallback: any other route sends dist/index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on http://0.0.0.0:${port}`);
});
