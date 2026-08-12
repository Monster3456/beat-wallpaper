import { useEffect, useRef, useState } from 'react';
import type { Theme, Settings } from '../types';
import { THEMES } from '../themes';
import { selectWallpaper } from '../audioBridge';

interface Props {
  /** 当前展示的设置（已确认 + 未确认暂存合并后的视图） */
  settings: Settings;
  /** 暂存中的主题（高亮用） */
  pendingThemeId: string | null;
  /** 是否有未确认的更改 */
  dirty: boolean;
  /** 实时音频电平 0-1（电平指示） */
  level: number;
  onThemeSelect: (themeId: string) => void;
  onConfirm: () => void;
  onWallpaperChange: () => void;
  onPerformanceModeChange: (mode: Settings['performanceMode']) => void;
  onAudioSensitivityChange: (sensitivity: number) => void;
}

export function SettingsPanel({
  settings,
  pendingThemeId,
  dirty,
  level,
  onThemeSelect,
  onConfirm,
  onWallpaperChange,
  onPerformanceModeChange,
  onAudioSensitivityChange,
}: Props) {
  const handleSelectWallpaper = async () => {
    const path = await selectWallpaper();
    if (path) {
      onWallpaperChange();
    }
  };

  const activeThemeId = pendingThemeId ?? settings.theme;

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      background: 'rgba(10, 10, 20, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: 12,
      padding: '32px 40px 96px',
      color: '#fff',
      overflowY: 'auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
      boxSizing: 'border-box',
    }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>
        设置
      </h2>
      <p style={{ margin: '0 0 24px', fontSize: 12, opacity: 0.45 }}>
        更改会暂存，点击底部「确认更改」后统一生效
      </p>

      {/* 壁纸 */}
      <Section title="壁纸">
        <button onClick={handleSelectWallpaper} style={btnStyle}>
          选择壁纸
        </button>
        {settings.wallpaperPath && (
          <p style={{ fontSize: 12, opacity: 0.5, margin: '6px 0 0', wordBreak: 'break-all' }}>
            {settings.wallpaperPath}
          </p>
        )}
      </Section>

      {/* 氛围主题 */}
      <Section title="氛围主题">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              active={activeThemeId === theme.id}
              pending={pendingThemeId === theme.id}
              onClick={() => onThemeSelect(theme.id)}
            />
          ))}
        </div>
      </Section>

      {/* 音频 */}
      <Section title="音频">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.6, whiteSpace: 'nowrap' }}>灵敏度</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.audioSensitivity}
            onChange={(e) => onAudioSensitivityChange(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: '#8888ff' }}
          />
          <span style={{ fontSize: 12, opacity: 0.6, width: 32, textAlign: 'right' }}>
            {Math.round(settings.audioSensitivity * 100)}%
          </span>
        </div>
        <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 8 }}>
          实时音量（调灵敏度时观察反应强度）
        </div>
        <LevelMeter level={level} />
      </Section>

      {/* 系统 */}
      <Section title="系统">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['high', 'balanced', 'energy'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onPerformanceModeChange(mode)}
              style={{
                ...btnStyle,
                background: settings.performanceMode === mode
                  ? 'rgba(255,255,255,0.2)'
                  : 'rgba(255,255,255,0.06)',
                border: settings.performanceMode === mode
                  ? '1px solid rgba(255,255,255,0.3)'
                  : '1px solid transparent',
              }}
            >
              {mode === 'high' ? '高画质' : mode === 'balanced' ? '均衡' : '节能'}
            </button>
          ))}
        </div>
      </Section>

      {/* 统一确认栏 */}
      {dirty && (
        <div style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '14px 40px',
          background: 'rgba(15, 15, 30, 0.92)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>
            有未确认的更改
            {pendingThemeId && (
              <span style={{ marginLeft: 6 }}>
                · 主题「{THEMES.find((t) => t.id === pendingThemeId)?.name}」
              </span>
            )}
          </span>
          <button
            onClick={onConfirm}
            style={{
              ...btnStyle,
              background: 'linear-gradient(135deg, #6666ff, #8888ff)',
              border: 'none',
              fontWeight: 700,
              padding: '12px 28px',
            }}
          >
            确认更改
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, opacity: 0.6 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ThemeCard({
  theme,
  active,
  pending,
  onClick,
}: {
  theme: Theme;
  active: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const icon: Record<string, string> = {
    heartbeat: '❤', aurora: '🌀', neon: '⚡', deepsea: '🌊',
    blaze: '🔥', pure: '❄', rhythm: '🎵', dreamscape: '✨', '8bit': '👾',
  };

  return (
    <button
      onClick={onClick}
      style={{
        padding: 0,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        border: pending
          ? '2px solid #8ad4ff'
          : active
            ? '2px solid rgba(136, 136, 255, 0.9)'
            : '2px solid rgba(255,255,255,0.08)',
        boxShadow: active || pending ? '0 0 18px rgba(136,136,255,0.35)' : 'none',
        transition: 'all 0.2s',
        textAlign: 'left',
        background: '#1a1a2e',
      }}
    >
      <div style={{ position: 'relative' }}>
        <ThemePreview theme={theme} />
        <span style={{
          position: 'absolute',
          top: 6,
          left: 8,
          fontSize: 18,
          filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))',
        }}>
          {icon[theme.id] ?? '•'}
        </span>
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
          {theme.name}
          {pending && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 6 }}>待确认</span>}
        </div>
        <div style={{ fontSize: 11, opacity: 0.78, color: 'rgba(255,255,255,0.85)', marginTop: 2, lineHeight: 1.4, minHeight: 26 }}>
          {theme.description}
        </div>
      </div>
    </button>
  );
}

/** 主题卡片动态预览：呼吸光晕 + 流动色带 + 底部音波小柱（纯 canvas，轻量） */
function ThemePreview({ theme }: { theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let frame = 0;
    const t0 = performance.now();
    const accent = theme.accentColor;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      // 30fps 足够预览动效，减半 CPU 占用
      if (++frame % 2 === 0) return;
      const t = (performance.now() - t0) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#0e0e18';
      ctx.fillRect(0, 0, w, h);

      // 呼吸光晕
      const pulse = 0.3 + 0.18 * Math.sin(t * 2);
      const g = ctx.createRadialGradient(w / 2, h * 0.72, 4, w / 2, h * 0.72, w * 0.62);
      g.addColorStop(0, hexToRgba(accent, pulse));
      g.addColorStop(1, hexToRgba(accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 流动色带
      for (let i = 0; i < 3; i++) {
        const x = ((t * 46 + i * 75) % (w + 90)) - 45;
        const grad = ctx.createLinearGradient(x, 0, x + 70, 0);
        grad.addColorStop(0, hexToRgba(accent, 0));
        grad.addColorStop(0.5, hexToRgba(accent, 0.45));
        grad.addColorStop(1, hexToRgba(accent, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(x, h * 0.3, 70, h * 0.55);
      }

      // 底部音波小柱
      const bars = 14;
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = 0.12 + 0.4 * Math.abs(Math.sin(t * 3.2 + i * 0.75));
        ctx.fillStyle = hexToRgba(accent, 0.75);
        ctx.fillRect(i * bw + 2, h - 13 - v * 26, bw - 4, v * 26);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  return (
    <canvas
      ref={ref}
      width={160}
      height={90}
      style={{ width: '100%', height: 90, display: 'block' }}
    />
  );
}

/** 实时电平指示（平滑显示） */
function LevelMeter({ level }: { level: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setDisplay((d) => d + (level - d) * 0.35);
    }, 50);
    return () => clearInterval(id);
  }, [level]);

  const pct = Math.max(2, Math.round(display * 100));

  return (
    <div style={{
      height: 12,
      borderRadius: 6,
      background: 'rgba(255,255,255,0.07)',
      overflow: 'hidden',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        width: pct + '%',
        height: '100%',
        borderRadius: 6,
        background: 'linear-gradient(90deg, #44ff88, #88ccff, #ff66aa)',
        transition: 'width 0.05s linear',
      }} />
    </div>
  );
}

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const btnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
  transition: 'all 0.15s',
};
