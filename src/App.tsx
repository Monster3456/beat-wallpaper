import { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { WallpaperCanvas } from './components/WallpaperCanvas';
import { SettingsPanel } from './components/SettingsPanel';
import { Onboarding } from './components/Onboarding';
import { getTheme, getDefaultSettings } from './themes';
import {
  startAudioPolling,
  stopAudioPolling,
  saveSettings,
  loadSettings,
  onWallpaperChanged,
  onSettingsUpdated,
  getCurrentWallpaper,
  activateWallpaperMode,
  selectWallpaper,
} from './audioBridge';
import type { AudioData, Theme, Settings } from './types';

/**
 * 双窗口架构：
 * - wallpaper 窗口：全屏渲染壁纸 + 音频驱动效果（后台静默运行）
 * - settings 窗口：设置界面（主题/壁纸/性能），设置变更实时广播给壁纸窗口
 */
export default function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    setWindowLabel(getCurrentWindow().label);
  }, []);

  if (!windowLabel) return null;
  const isWallpaperWin = windowLabel === 'wallpaper' || windowLabel.startsWith('wallpaper');
  return isWallpaperWin ? <WallpaperApp /> : <SettingsApp />;
}

/** 壁纸窗口：渲染壁纸 + 音频驱动 + 跟随系统壁纸 + 实时接收设置 */
function WallpaperApp() {
  const [audioData, setAudioData] = useState<AudioData | null>(null);
  const [currentTheme, setCurrentTheme] = useState<Theme>(getTheme('dreamscape'));
  const [wallpaperPath, setWallpaperPath] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [perfMode, setPerfMode] = useState<Settings['performanceMode']>('high');
  const [embedDesktop, setEmbedDesktop] = useState(false);

  // 加载设置（主题 + 性能模式）
  useEffect(() => {
    loadSettings().then((saved) => {
      if (saved && Object.keys(saved).length > 1) {
        const merged = { ...getDefaultSettings(), ...saved } as Settings;
        setCurrentTheme(getTheme(merged.theme));
        setPerfMode(merged.performanceMode);
      }
    });
  }, []);

  // 实时接收设置窗口的变更（主题切换立即生效）
  useEffect(() => {
    const unlisten = onSettingsUpdated((saved) => {
      const merged = { ...getDefaultSettings(), ...saved } as Settings;
      invoke('log_frontend', { msg: 'SETTINGS SYNC: theme=' + merged.theme }).catch(() => {});
      setCurrentTheme(getTheme(merged.theme));
      setPerfMode(merged.performanceMode);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Rust 端 eval 注入的全局主题应用函数（绕过事件节流，保证所有屏幕同步）
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__applyTheme = (themeId: string) => {
      setCurrentTheme(getTheme(themeId));
      invoke('log_frontend', { msg: 'EVAL THEME: ' + themeId }).catch(() => {});
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__applyTheme;
    };
  }, []);

  // 获取当前系统壁纸并跟随变化
  useEffect(() => {
    getCurrentWallpaper().then((wp) => {
      setEmbedDesktop(!!wp.desktopEmbed);
      if (wp.path) {
        setWallpaperPath(wp.path);
        setIsVideo(wp.isVideo);
      }
    });

    const unlisten = onWallpaperChanged((path, isVideo) => {
      setWallpaperPath(path);
      setIsVideo(isVideo);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // 渲染就绪后切换到壁纸层
  useEffect(() => {
    const timer = setTimeout(() => {
      activateWallpaperMode().catch((e) => console.error('激活壁纸模式失败:', e));
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // 音频轮询（30fps 足够驱动视觉平滑，降低 IPC 开销）
  useEffect(() => {
    startAudioPolling((data) => setAudioData(data), 33);
    return () => stopAudioPolling(() => {});
  }, []);

  // 诊断：每 2 秒记录音频状态（确认数据到达壁纸窗口）
  useEffect(() => {
    if (!audioData) return;
    const timer = setInterval(() => {
      const spec = audioData.spectrum ?? [];
      const logMsg = `AUDIO-FE: vol=${audioData.volume.toFixed(2)} bass=${audioData.bass.toFixed(2)} spec0=${(spec[0] ?? 0).toFixed(2)} spec32=${(spec[32] ?? 0).toFixed(2)} spec64=${(spec[64] ?? 0).toFixed(2)} len=${spec.length}`;
      invoke('log_frontend', { msg: logMsg }).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [audioData]);

  return (
    <WallpaperCanvas
      audioData={audioData}
      currentTheme={currentTheme}
      wallpaperPath={wallpaperPath}
      isVideo={isVideo}
      performanceMode={perfMode}
      embedDesktop={embedDesktop}
    />
  );
}

/** 设置窗口：所有更改先暂存，统一「确认更改」后应用并广播给壁纸窗口 */
function SettingsApp() {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [settings, setSettings] = useState<Settings>(getDefaultSettings());
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [level, setLevel] = useState(0);
  const [embedDesktop, setEmbedDesktop] = useState(false);

  // 加载已保存的设置
  useEffect(() => {
    loadSettings().then((saved) => {
      if (saved && Object.keys(saved).length > 1) {
        const merged = { ...getDefaultSettings(), ...saved } as Settings;
        setSettings(merged);
        setShowOnboarding(false);
      }
    });

    // 显示当前系统壁纸路径
    getCurrentWallpaper().then((wp) => {
      setEmbedDesktop(!!wp.desktopEmbed);
      if (wp.path) {
        setSettings((prev) => ({ ...prev, wallpaperPath: wp.path, isVideo: wp.isVideo }));
      }
    });
  }, []);

  // 电平指示（设置窗口内实时音量条，10fps 足够）
  useEffect(() => {
    startAudioPolling((data) => setLevel(data.volume), 100);
    return () => stopAudioPolling(() => {});
  }, []);

  /** 应用设置：保存（Rust 端会自动广播给所有窗口） */
  const applySettings = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  /** 暂存更改 */
  const stage = useCallback((patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  /** 统一确认：合并暂存并应用 */
  const handleConfirm = useCallback(() => {
    const next = { ...settings, ...draft } as Settings;
    applySettings(next);
    setDraft({});
  }, [settings, draft, applySettings]);

  // 选择壁纸（暂存，确认后生效）
  const handleSelectWallpaper = useCallback(async () => {
    const path = await selectWallpaper();
    if (path) {
      stage({ wallpaperPath: path, isVideo: /\.(mp4|mov|webm)$/i.test(path) });
    }
  }, [stage]);

  // 视图 = 已应用 + 暂存
  const view = { ...settings, ...draft } as Settings;
  const dirty = Object.keys(draft).length > 0;
  const pendingThemeId = draft.theme ?? null;

  // Onboarding 完成
  const handleOnboardingComplete = useCallback(
    (themeId: string) => {
      setShowOnboarding(false);
      applySettings({ ...settings, theme: themeId });
    },
    [settings, applySettings],
  );

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#14141f',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      overflowY: 'auto',
    }}>
      <SettingsPanel
        settings={view}
        pendingThemeId={pendingThemeId}
        dirty={dirty}
        level={level}
        desktopEmbed={embedDesktop}
        onThemeSelect={(id) => stage({ theme: id })}
        onConfirm={handleConfirm}
        onWallpaperChange={handleSelectWallpaper}
        onPerformanceModeChange={(mode) => stage({ performanceMode: mode })}
        onAudioSensitivityChange={(sensitivity) => stage({ audioSensitivity: sensitivity })}
      />
    </div>
  );
}