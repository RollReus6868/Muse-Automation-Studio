'use strict';
// Cầu nối giao diện ↔ tiến trình chính. Giao diện chỉ thấy window.app.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('app', {
  call: (lenh, duLieu) => ipcRenderer.invoke('app', lenh, duLieu),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onLog: (cb) => ipcRenderer.on('log', (_e, d) => cb(d)),
  // Kéo-thả file: lấy đường dẫn thật của File (Electron 32+ bỏ File.path).
  duongDan: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return ''; } }
});
