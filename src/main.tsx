import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { invoke } from '@tauri-apps/api/core';

// 诊断：前端日志通过 Tauri IPC 转发到 Rust 日志
let logSeq = 0;
function logToFile(msg: string) {
  const line = `[FE#${++logSeq}] ${msg}`;
  invoke('log_frontend', { msg: line }).catch(() => {});
}

window.addEventListener('error', (e) => {
  logToFile('GLOBAL ERROR: ' + e.message + ' @' + (e.filename || '') + ':' + (e.lineno || ''));
});
window.addEventListener('unhandledrejection', (e) => {
  logToFile('UNHANDLED REJECTION: ' + String((e as PromiseRejectionEvent).reason));
});
const origError = console.error;
console.error = (...args: unknown[]) => {
  origError(...args);
  logToFile('CONSOLE ERROR: ' + args.map(String).join(' '));
};

logToFile('FRONTEND BOOT window=' + window.location.href);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);