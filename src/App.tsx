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
  getDepthMap,
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
  const [depthData, setDepthData] = useState<number[] | null>(null);

  // 加载设置（主题）
  useEffect(() => {
    loadSettings().then((saved) => {
      if (saved && Object.keys(saved).length > 1) {
        const merged = { ...getDefaultSettings(), ...saved } as Settings;
        setCurrentTheme(getTheme(merged.theme));
      }
    });
  }, []);

  // 实时接收设置窗口的变更（主题切换立即生效）
  useEffect(() => {
    const unlisten = onSettingsUpdated((saved) => {
      const merged = { ...getDefaultSettings(), ...saved } as Settings;
      invoke('log_frontend', { msg: 'SETTINGS SYNC: theme=' + merged.theme }).catch(() => {});
      setCurrentTheme(getTheme(merged.theme));
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

  // 获取深度图（AI 视差分层）
  useEffect(() => {
    if (!wallpaperPath || isVideo) return;
    getDepthMap()
      .then((data) => {
        if (data && data.length > 0) {
          setDepthData(data);
        }
      })
      .catch(() => {});
  }, [wallpaperPath, isVideo]);

  // 渲染就绪后切换到壁纸层
  useEffect(() => {
    const timer = setTimeout(() => {
      activateWallpaperMode().catch((e) => console.error('激活壁纸模式失败:', e));
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // 音频轮询（每 60fps）
  useEffect(() => {
    startAudioPolling((data) => setAudioData(data));
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
      depthData={depthData}
    />
  );
}

/** 设置窗口：主题选择需确认后应用，变更实时广播给壁纸窗口 */
function SettingsApp() {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [settings, setSettings] = useState<Settings>(getDefaultSettings());
  const [pendingThemeId, setPendingThemeId] = useState<string | null>(null);

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
      if (wp.path) {
        setSettings((prev) => ({ ...prev, wallpaperPath: wp.path, isVideo: wp.isVideo }));
      }
    });
  }, []);

  /** 应用设置：保存（Rust 端会自动广播给所有窗口） */
  const applySettings = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  // 主题选择（暂存，等待确认）
  const handleThemeSelect = useCallback((themeId: string) => {
    setPendingThemeId(themeId);
  }, []);

  // 确认应用主题
  const handleApplyTheme = useCallback(() => {
    if (!pendingThemeId) return;
    applySettings({ ...settings, theme: pendingThemeId });
    setPendingThemeId(null);
  }, [pendingThemeId, settings, applySettings]);

  // 选择壁纸（自定义壁纸）
  const handleSelectWallpaper = useCallback(async () => {
    const path = await selectWallpaper();
    if (path) {
      const next = {
        ...settings,
        wallpaperPath: path,
        isVideo: /\.(mp4|mov|webm)$/i.test(path),
      };
      applySettings(next);
    }
  }, [settings, applySettings]);

  // 性能模式（即时生效）
  const handlePerformanceModeChange = useCallback(
    (mode: Settings['performanceMode']) => {
      applySettings({ ...settings, performanceMode: mode });
    },
    [settings, applySettings],
  );

  // 音频灵敏度（即时生效）
  const handleAudioSensitivityChange = useCallback(
    (sensitivity: number) => {
      applySettings({ ...settings, audioSensitivity: sensitivity });
    },
    [settings, applySettings],
  );

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
        settings={settings}
        pendingThemeId={pendingThemeId}
        onThemeSelect={handleThemeSelect}
        onApplyTheme={handleApplyTheme}
        onWallpaperChange={handleSelectWallpaper}
        onPerformanceModeChange={handlePerformanceModeChange}
        onAudioSensitivityChange={handleAudioSensitivityChange}
      />
    </div>
  );
}