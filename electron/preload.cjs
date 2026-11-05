const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  sendSyncState: (payload) => {
    ipcRenderer.send('airhockey:sync-state', payload);
  },
  onSyncState: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('airhockey:sync-state', listener);
    ipcRenderer.send('airhockey:request-initial-state');
    return () => {
      ipcRenderer.removeListener('airhockey:sync-state', listener);
    };
  },
  sendAction: (action) => {
    ipcRenderer.send('airhockey:send-action', action);
  },
  onAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('airhockey:action', listener);
    return () => {
      ipcRenderer.removeListener('airhockey:action', listener);
    };
  },
  openOrFocusSubWindow: () => {
    ipcRenderer.send('airhockey:open-sub-window');
  },
  openOrFocusConsoleWindow: () => {
    ipcRenderer.send('airhockey:open-console-window');
  },
  arrangeSideBySide: () => {
    ipcRenderer.send('airhockey:arrange-windows');
  },
  toggleFullscreen: () => {
    return ipcRenderer.invoke('airhockey:toggle-fullscreen');
  },
  getFullscreenState: () => {
    return ipcRenderer.invoke('airhockey:get-fullscreen');
  },
  onFullscreenChange: (callback) => {
    const listener = (_event, isFullscreen) => callback(isFullscreen);
    ipcRenderer.on('airhockey:fullscreen-changed', listener);
    return () => {
      ipcRenderer.removeListener('airhockey:fullscreen-changed', listener);
    };
  },
});
