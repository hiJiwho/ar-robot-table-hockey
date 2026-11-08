const { app, BrowserWindow, screen, ipcMain, session, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let subWindow = null;
let consoleWindow = null;
let latestSyncState = null;
let localServerUrl = null;

// 포터블 .exe 바로 옆에 'ar-data' 폴더를 생성하여 모든 캘리브레이션·설정을 영구 저장합니다.
// - electron-builder 단일 포터블 실행 시: process.env.PORTABLE_EXECUTABLE_DIR 기준 ./ar-data
// - 폴더형 포터블(AR-Robot-air-hotkey.exe) 실행 시: 실행파일(process.execPath) 옆 ./ar-data
function resolvePortableExeDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  if (app.isPackaged || !process.execPath.includes('node_modules')) {
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname, '..');
}

const AR_DATA_DIR = path.join(resolvePortableExeDir(), 'ar-data');
try {
  fs.mkdirSync(AR_DATA_DIR, { recursive: true });
  // Chromium 프로필/캐시 데이터도 ar-data 내부에 격리하여 완전한 포터블 동작 보장
  const userDataDir = path.join(AR_DATA_DIR, 'user-profile');
  fs.mkdirSync(userDataDir, { recursive: true });
  app.setPath('userData', userDataDir);
} catch (err) {
  console.error('Failed to initialize ar-data directory:', err);
}

function getCalibrationConfigPath() {
  return path.join(AR_DATA_DIR, 'calibration-settings.json');
}

function getSlotConfigPath(slotKey) {
  const safeSlot = ['A', 'B', 'C'].includes(String(slotKey)) ? String(slotKey) : 'A';
  return path.join(AR_DATA_DIR, `calibration-slot-${safeSlot}.json`);
}

function readSavedConfig() {
  try {
    const filePath = getCalibrationConfigPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read saved calibration config from ar-data:', err);
  }
  return {};
}

function writeSavedConfig(patch) {
  if (!patch || typeof patch !== 'object') return;
  try {
    fs.mkdirSync(AR_DATA_DIR, { recursive: true });
    const current = readSavedConfig();
    const next = { ...current };
    let changed = false;
    const keys = [
      'screenCorners',
      'cameraCorners',
      'goalSize',
      'isCameraMirrored',
      'colorSettings',
      'lowLightMode',
      'theme',
      'obstaclesEnabled',
      'cameraDeviceId',
    ];
    for (const k of keys) {
      if (patch[k] !== undefined) {
        next[k] = patch[k];
        changed = true;
      }
    }
    if (changed) {
      next.updatedAt = new Date().toISOString();
      fs.writeFileSync(getCalibrationConfigPath(), JSON.stringify(next, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Failed to write saved calibration config to ar-data:', err);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

function startLocalStaticServer() {
  return new Promise((resolve, reject) => {
    if (process.env.ELECTRON_START_URL) {
      resolve(process.env.ELECTRON_START_URL);
      return;
    }

    const distDir = path.join(__dirname, '..', 'dist');
    const createHttpHandler = (req, res) => {
      try {
        const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let pathname = decodeURIComponent(parsedUrl.pathname);
        if (pathname === '/' || pathname === '/scoreboard' || pathname === '/console') {
          pathname = '/index.html';
        }

        let filePath = path.join(distDir, pathname);
        if (!filePath.startsWith(distDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        });
        res.end(content);
      } catch (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    };

    // Use a fixed local port (38470) so Chromium's localStorage origin remains identical across app restarts
    const candidatePorts = [38470, 38471, 38472, 0];
    let portIdx = 0;

    const tryListen = () => {
      const server = http.createServer(createHttpHandler);
      const port = candidatePorts[portIdx];

      server.once('error', (err) => {
        if (portIdx < candidatePorts.length - 1) {
          portIdx++;
          tryListen();
        } else {
          reject(err);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        const url = `http://127.0.0.1:${address.port}`;
        resolve(url);
      });
    };

    tryListen();
  });
}

function getWindowBounds() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const margin = 16;
  const gap = 12;

  // Layout for 3 windows:
  // Left 55%: Main Window (Projector View)
  // Right 45%: Sub Window (Top 50%) + Console Window (Bottom 50%)
  const leftWidth = Math.max(600, Math.floor((workArea.width - margin * 2 - gap) * 0.54));
  const rightWidth = Math.max(480, workArea.width - margin * 2 - gap - leftWidth);
  const totalHeight = workArea.height - margin * 2;
  const rightHalfHeight = Math.floor((totalHeight - gap) / 2);

  return {
    main: {
      x: workArea.x + margin,
      y: workArea.y + margin,
      width: leftWidth,
      height: totalHeight,
    },
    sub: {
      x: workArea.x + margin + leftWidth + gap,
      y: workArea.y + margin,
      width: rightWidth,
      height: rightHalfHeight,
    },
    console: {
      x: workArea.x + margin + leftWidth + gap,
      y: workArea.y + margin + rightHalfHeight + gap,
      width: rightWidth,
      height: rightHalfHeight,
    },
  };
}

function attachWindowFullscreenEvents(win) {
  win.on('enter-full-screen', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('airhockey:fullscreen-changed', true);
    }
  });
  win.on('leave-full-screen', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('airhockey:fullscreen-changed', false);
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F11') {
        event.preventDefault();
        win.setFullScreen(!win.isFullScreen());
      } else if (input.key === 'Escape' && win.isFullScreen()) {
        win.setFullScreen(false);
      }
    }
  });
}

function loadAppUrl(win, screenType = 'main') {
  if (localServerUrl) {
    const targetUrl =
      screenType === 'scoreboard'
        ? `${localServerUrl}/?screen=scoreboard`
        : screenType === 'console'
        ? `${localServerUrl}/?screen=console`
        : `${localServerUrl}/`;
    win.loadURL(targetUrl);
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (screenType === 'scoreboard') {
      win.loadFile(indexPath, { query: { screen: 'scoreboard' } });
    } else if (screenType === 'console') {
      win.loadFile(indexPath, { query: { screen: 'console' } });
    } else {
      win.loadFile(indexPath);
    }
  }
}

function createSubWindow(bounds) {
  if (subWindow && !subWindow.isDestroyed()) {
    if (bounds) {
      if (subWindow.isFullScreen()) subWindow.setFullScreen(false);
      if (subWindow.isMaximized()) subWindow.unmaximize();
      subWindow.setBounds(bounds);
    }
    if (subWindow.isMinimized()) subWindow.restore();
    subWindow.show();
    subWindow.focus();
    return subWindow;
  }

  const targetBounds = bounds || getWindowBounds().sub;

  subWindow = new BrowserWindow({
    x: targetBounds.x,
    y: targetBounds.y,
    width: targetBounds.width,
    height: targetBounds.height,
    minWidth: 420,
    minHeight: 300,
    show: true,
    frame: true,
    fullscreenable: true,
    title: '[서브 전광판] AR Robot air hotkey',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachWindowFullscreenEvents(subWindow);
  loadAppUrl(subWindow, 'scoreboard');

  subWindow.webContents.on('did-finish-load', () => {
    if (subWindow && !subWindow.isDestroyed()) {
      subWindow.setTitle('[서브 전광판] AR Robot air hotkey');
      if (latestSyncState) {
        subWindow.webContents.send('airhockey:sync-state', latestSyncState);
      }
    }
  });

  subWindow.on('closed', () => {
    subWindow = null;
  });

  return subWindow;
}

function createConsoleWindow(bounds) {
  if (consoleWindow && !consoleWindow.isDestroyed()) {
    if (bounds) {
      if (consoleWindow.isFullScreen()) consoleWindow.setFullScreen(false);
      if (consoleWindow.isMaximized()) consoleWindow.unmaximize();
      consoleWindow.setBounds(bounds);
    }
    if (consoleWindow.isMinimized()) consoleWindow.restore();
    consoleWindow.show();
    consoleWindow.focus();
    return consoleWindow;
  }

  const targetBounds = bounds || getWindowBounds().console;

  consoleWindow = new BrowserWindow({
    x: targetBounds.x,
    y: targetBounds.y,
    width: targetBounds.width,
    height: targetBounds.height,
    minWidth: 460,
    minHeight: 340,
    show: true,
    frame: true,
    fullscreenable: true,
    title: '[관리 콘솔] AR Robot air hotkey',
    backgroundColor: '#090d16',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachWindowFullscreenEvents(consoleWindow);
  loadAppUrl(consoleWindow, 'console');

  consoleWindow.webContents.on('did-finish-load', () => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.setTitle('[관리 콘솔] AR Robot air hotkey');
      if (latestSyncState) {
        consoleWindow.webContents.send('airhockey:sync-state', latestSyncState);
      }
    }
  });

  consoleWindow.on('closed', () => {
    consoleWindow = null;
  });

  return consoleWindow;
}

function createWindows() {
  const bounds = getWindowBounds();

  // 1. Create Independent Main Window (Game Table & Vision Screen)
  mainWindow = new BrowserWindow({
    x: bounds.main.x,
    y: bounds.main.y,
    width: bounds.main.width,
    height: bounds.main.height,
    minWidth: 540,
    minHeight: 400,
    show: true,
    frame: true,
    fullscreenable: true,
    title: '[메인 경기장] AR Robot air hotkey',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachWindowFullscreenEvents(mainWindow);
  loadAppUrl(mainWindow, 'main');

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle('[메인 경기장] AR Robot air hotkey');
    }
  });

  // Intercept window.open
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('screen=scoreboard') || url.includes('/scoreboard')) {
      createSubWindow();
      return { action: 'deny' };
    }
    if (url.includes('screen=console') || url.includes('/console')) {
      createConsoleWindow();
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (subWindow && !subWindow.isDestroyed()) subWindow.close();
    if (consoleWindow && !consoleWindow.isDestroyed()) consoleWindow.close();
  });

  // 2. Create Sub Window (Scoreboard)
  createSubWindow(bounds.sub);

  // 3. Create Admin Console Window
  createConsoleWindow(bounds.console);

  // Show all windows
  mainWindow.show();
  if (subWindow && !subWindow.isDestroyed()) subWindow.show();
  if (consoleWindow && !consoleWindow.isDestroyed()) consoleWindow.show();
  mainWindow.focus();

  if (process.env.ELECTRON_SELF_TEST === '1') {
    setTimeout(async () => {
      try {
        const mainHtml = await mainWindow.webContents.executeJavaScript(
          'document.getElementById("root")?.innerHTML?.length || 0'
        );
        const subHtml = await subWindow.webContents.executeJavaScript(
          'document.getElementById("root")?.innerHTML?.length || 0'
        );
        const consoleHtml = await consoleWindow.webContents.executeJavaScript(
          'document.getElementById("root")?.innerHTML?.length || 0'
        );
        console.log(`SELF_TEST_RESULT: mainLen=${mainHtml}, subLen=${subHtml}, consoleLen=${consoleHtml}, url=${localServerUrl}`);
        app.exit(mainHtml > 100 && subHtml > 100 && consoleHtml > 100 ? 0 : 1);
      } catch (e) {
        console.error('SELF_TEST_ERROR:', e);
        app.exit(1);
      }
    }, 2500);
  }
}

app.whenReady().then(async () => {
  try {
    localServerUrl = await startLocalStaticServer();
  } catch (err) {
    console.error('Failed to start local static server, falling back to file://', err);
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'fullscreen') {
      callback(true);
      return;
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);

  // IPC: Toggle fullscreen
  ipcMain.handle('airhockey:toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    const nextState = !win.isFullScreen();
    win.setFullScreen(nextState);
    return nextState;
  });

  ipcMain.handle('airhockey:get-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    return win.isFullScreen();
  });

  // IPC: Load & Save persistent calibration config in ./ar-data folder next to portable exe
  ipcMain.handle('airhockey:load-config', () => {
    return {
      ...readSavedConfig(),
      appDataDir: AR_DATA_DIR,
      appDataFile: getCalibrationConfigPath(),
    };
  });

  ipcMain.on('airhockey:save-config', (_event, cfg) => {
    writeSavedConfig(cfg);
  });

  ipcMain.handle('airhockey:save-slot', (_event, { slot, data }) => {
    try {
      fs.mkdirSync(AR_DATA_DIR, { recursive: true });
      const slotPath = getSlotConfigPath(slot);
      fs.writeFileSync(slotPath, JSON.stringify(data, null, 2), 'utf-8');
      writeSavedConfig(data);
      return { ok: true, path: slotPath };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('airhockey:load-slot', (_event, slot) => {
    try {
      const slotPath = getSlotConfigPath(slot);
      if (!fs.existsSync(slotPath)) return null;
      const data = JSON.parse(fs.readFileSync(slotPath, 'utf-8'));
      writeSavedConfig(data);
      return data;
    } catch {
      return null;
    }
  });

  ipcMain.handle('airhockey:open-appdata-folder', () => {
    try {
      fs.mkdirSync(AR_DATA_DIR, { recursive: true });
      const cfgFile = getCalibrationConfigPath();
      if (fs.existsSync(cfgFile)) {
        shell.showItemInFolder(cfgFile);
      } else {
        shell.openPath(AR_DATA_DIR);
      }
      return AR_DATA_DIR;
    } catch {
      return AR_DATA_DIR;
    }
  });

  // IPC: Forward sync-state to Sub Window and Console Window
  ipcMain.on('airhockey:sync-state', (_event, payload) => {
    latestSyncState = payload;
    writeSavedConfig(payload);
    if (subWindow && !subWindow.isDestroyed()) {
      subWindow.webContents.send('airhockey:sync-state', payload);
    }
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.webContents.send('airhockey:sync-state', payload);
    }
  });

  // IPC: Forward action from Console/Sub to Main window
  ipcMain.on('airhockey:send-action', (_event, action) => {
    writeSavedConfig(action);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('airhockey:action', action);
    }
  });

  ipcMain.on('airhockey:request-initial-state', (event) => {
    if (latestSyncState && !event.sender.isDestroyed()) {
      event.sender.send('airhockey:sync-state', latestSyncState);
    }
  });

  ipcMain.on('airhockey:open-sub-window', () => {
    createSubWindow();
  });

  ipcMain.on('airhockey:open-console-window', () => {
    createConsoleWindow();
  });

  ipcMain.on('airhockey:arrange-windows', () => {
    const bounds = getWindowBounds();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      mainWindow.setBounds(bounds.main);
      mainWindow.show();
    }
    createSubWindow(bounds.sub);
    createConsoleWindow(bounds.console);
  });

  createWindows();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindows();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
