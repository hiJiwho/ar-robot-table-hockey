const { app, BrowserWindow, screen, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let subWindow = null;
let latestSyncState = null;
let localServerUrl = null;

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
    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let pathname = decodeURIComponent(parsedUrl.pathname);
        if (pathname === '/' || pathname === '/scoreboard') {
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
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}`;
      resolve(url);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

function getWindowBounds() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  // Separate windows clearly with padding so both windows look like distinct desktop windows
  const margin = 24;
  const gap = 20;
  const usableWidth = workArea.width - margin * 2 - gap;
  const mainWidth = Math.max(640, Math.floor(usableWidth * 0.56));
  const subWidth = Math.max(500, usableWidth - mainWidth);
  const winHeight = Math.max(540, Math.min(workArea.height - margin * 2, 860));
  const topY = workArea.y + Math.max(margin, Math.floor((workArea.height - winHeight) / 2));

  return {
    main: {
      x: workArea.x + margin,
      y: topY,
      width: mainWidth,
      height: winHeight,
    },
    sub: {
      x: workArea.x + margin + mainWidth + gap,
      y: topY,
      width: subWidth,
      height: winHeight,
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

  // Support F11 to toggle fullscreen and Escape to exit fullscreen
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

function loadAppUrl(win, isScoreboard = false) {
  if (localServerUrl) {
    const targetUrl = isScoreboard
      ? `${localServerUrl}/?screen=scoreboard`
      : `${localServerUrl}/`;
    win.loadURL(targetUrl);
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (isScoreboard) {
      win.loadFile(indexPath, { query: { screen: 'scoreboard' } });
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
    minWidth: 460,
    minHeight: 400,
    show: true,
    frame: true,
    fullscreenable: true,
    title: '[서브 창] AR 에어하키 전광판 (Sub Scoreboard)',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachWindowFullscreenEvents(subWindow);
  loadAppUrl(subWindow, true);

  subWindow.webContents.on('did-finish-load', () => {
    if (subWindow && !subWindow.isDestroyed()) {
      subWindow.setTitle('[서브 창] AR 에어하키 전광판 (Sub Scoreboard)');
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

function createWindows() {
  const bounds = getWindowBounds();

  // 1. Create Independent Main Window (Game Table & Vision Screen)
  mainWindow = new BrowserWindow({
    x: bounds.main.x,
    y: bounds.main.y,
    width: bounds.main.width,
    height: bounds.main.height,
    minWidth: 600,
    minHeight: 460,
    show: true,
    frame: true,
    fullscreenable: true,
    title: '[메인 창] AR 로봇 테이블 하키 경기장 (Main Arena)',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachWindowFullscreenEvents(mainWindow);
  loadAppUrl(mainWindow, false);

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle('[메인 창] AR 로봇 테이블 하키 경기장 (Main Arena)');
    }
  });

  // Intercept window.open for scoreboard so it focuses/reopens the separate Sub window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('screen=scoreboard') || url.includes('/scoreboard')) {
      createSubWindow();
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 2. Create Independent Sub Window (Scoreboard Screen) simultaneously
  createSubWindow(bounds.sub);

  // Show both independent windows clearly
  mainWindow.show();
  if (subWindow && !subWindow.isDestroyed()) {
    subWindow.show();
  }
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
        console.log(`SELF_TEST_RESULT: mainRootLen=${mainHtml}, subRootLen=${subHtml}, url=${localServerUrl}`);
        app.exit(mainHtml > 100 && subHtml > 100 ? 0 : 1);
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

  // Automatically allow camera/media permissions for AR vision tracking
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'fullscreen') {
      callback(true);
      return;
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);

  // IPC: Toggle fullscreen for whichever window clicked the button
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

  // IPC: Receive state from Main window and forward to Sub window
  ipcMain.on('airhockey:sync-state', (_event, payload) => {
    latestSyncState = payload;
    if (subWindow && !subWindow.isDestroyed()) {
      subWindow.webContents.send('airhockey:sync-state', payload);
    }
  });

  // IPC: Sub window requests initial state when ready
  ipcMain.on('airhockey:request-initial-state', (event) => {
    if (latestSyncState && !event.sender.isDestroyed()) {
      event.sender.send('airhockey:sync-state', latestSyncState);
    }
  });

  // IPC: Reopen or focus Sub window from Main window UI
  ipcMain.on('airhockey:open-sub-window', () => {
    createSubWindow();
  });

  // IPC: Arrange both windows side-by-side
  ipcMain.on('airhockey:arrange-windows', () => {
    const bounds = getWindowBounds();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      mainWindow.setBounds(bounds.main);
      mainWindow.show();
    }
    createSubWindow(bounds.sub);
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
