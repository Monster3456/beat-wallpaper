import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import type { AudioData } from './types';

let polling = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let listeners: Array<(data: AudioData) => void> = [];

/** 广播设置变更（设置窗口 → 壁纸窗口） */
export async function emitSettingsUpdated(settings: object): Promise<void> {
  await emit('settings-updated', settings);
}

/** 订阅设置变更（壁纸窗口监听） */
export function onSettingsUpdated(cb: (settings: object) => void) {
  return listen<object>('settings-updated', (event) => {
    cb(event.payload);
  });
}

/** 获取最新音频数据 */
export async function fetchAudioData(): Promise<AudioData> {
  return invoke<AudioData>('get_audio_data');
}

/** 选择壁纸文件 */
export async function selectWallpaper(): Promise<string | null> {
  try {
    return await invoke<string>('select_wallpaper');
  } catch {
    return null;
  }
}

/** 前端就绪后切换到壁纸层模式 */
export async function activateWallpaperMode(): Promise<void> {
  await invoke('activate_wallpaper_mode');
}

/** 获取当前壁纸文件 */
export async function getCurrentWallpaper(): Promise<{ path: string | null; isVideo: boolean }> {
  return invoke('get_current_wallpaper');
}

/** 获取深度图数据 */
export async function getDepthMap(): Promise<number[]> {
  return invoke<number[]>('get_depth_map');
}

/** 保存设置 */
export async function saveSettings(settings: object): Promise<void> {
  await invoke('save_settings', { settings: JSON.stringify(settings) });
}

/** 加载设置 */
export async function loadSettings(): Promise<object> {
  try {
    const raw = await invoke<string>('load_settings');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** 获取内置壁纸 */
export async function getBuiltinWallpapers(): Promise<string[]> {
  return invoke<string[]>('get_builtin_wallpapers');
}

/** 订阅壁纸变更事件 */
export function onWallpaperChanged(cb: (path: string, isVideo: boolean) => void) {
  return listen<{ path: string; isVideo: boolean }>('wallpaper-changed', (event) => {
    cb(event.payload.path, event.payload.isVideo);
  });
}

/** 开始轮询音频数据 */
export function startAudioPolling(cb: (data: AudioData) => void) {
  listeners.push(cb);
  if (!polling) {
    polling = true;
    let pollCount = 0;
    pollInterval = setInterval(async () => {
      try {
        const data = await fetchAudioData();
        pollCount++;
        if (pollCount === 1) {
          invoke('log_frontend', { msg: 'POLL first data vol=' + data.volume.toFixed(2) }).catch(() => {});
        }
        listeners.forEach((l) => l(data));
      } catch (e) {
        pollCount++;
        if (pollCount === 1 || pollCount % 120 === 0) {
          invoke('log_frontend', { msg: 'POLL ERROR #' + pollCount + ': ' + String(e) }).catch(() => {});
        }
      }
    }, 1000 / 60); // 60fps
  }
}

/** 停止音频轮询 */
export function stopAudioPolling(cb: (data: AudioData) => void) {
  listeners = listeners.filter((l) => l !== cb);
  if (listeners.length === 0 && pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    polling = false;
  }
}