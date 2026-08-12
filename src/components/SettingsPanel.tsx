import type { Theme, Settings } from '../types';
import { THEMES } from '../themes';
import { selectWallpaper } from '../audioBridge';

interface Props {
  settings: Settings;
  /** 待应用的主题（用户已选但未确认） */
  pendingThemeId: string | null;
  onThemeSelect: (themeId: string) => void;
  onApplyTheme: () => void;
  onWallpaperChange: () => void;
  onPerformanceModeChange: (mode: Settings['performanceMode']) => void;
  onAudioSensitivityChange: (sensitivity: number) => void;
}

export function SettingsPanel({
  settings,
  pendingThemeId,
  onThemeSelect,
  onApplyTheme,
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

  // 当前高亮的主题：待应用 > 已生效
  const activeThemeId = pendingThemeId ?? settings.theme;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'rgba(10, 10, 20, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: 12,
      padding: '32px 40px',
      color: '#fff',
      overflowY: 'auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
      boxSizing: 'border-box',
    }}>
      <h2 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700 }}>
        设置
      </h2>

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

        {/* 确认按钮：有未应用的主题时显示 */}
        {pendingThemeId && (
          <button
            onClick={onApplyTheme}
            style={{
              ...btnStyle,
              marginTop: 12,
              width: '100%',
              background: 'linear-gradient(135deg, #6666ff, #8888ff)',
              border: 'none',
              fontWeight: 600,
              padding: '12px 20px',
            }}
          >
            应用主题「{THEMES.find((t) => t.id === pendingThemeId)?.name}」
          </button>
        )}
      </Section>

      {/* 性能模式 */}
      <Section title="性能模式">
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

      {/* 音频灵敏度 */}
      <Section title="音频灵敏度">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.audioSensitivity}
          onChange={(e) => onAudioSensitivityChange(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: '#8888ff' }}
        />
      </Section>
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
  // 每个主题的符号与渐变
  const style: Record<string, { icon: string; gradient: string }> = {
    heartbeat: { icon: '❤', gradient: 'linear-gradient(135deg, #ff4466, #ff8899)' },
    aurora: { icon: '🌀', gradient: 'linear-gradient(135deg, #00ff88, #00ccff)' },
    neon: { icon: '⚡', gradient: 'linear-gradient(135deg, #ff00cc, #6600ff)' },
    deepsea: { icon: '🌊', gradient: 'linear-gradient(135deg, #0044cc, #00aaff)' },
    blaze: { icon: '🔥', gradient: 'linear-gradient(135deg, #ff6600, #ffcc00)' },
    pure: { icon: '❄', gradient: 'linear-gradient(135deg, #888888, #ffffff)' },
    rhythm: { icon: '🎵', gradient: 'linear-gradient(135deg, #4466ff, #ff44ff)' },
    dreamscape: { icon: '✨', gradient: 'linear-gradient(135deg, #ff4466, #ffcc00, #44ffcc)' },
    '8bit': { icon: '👾', gradient: 'linear-gradient(135deg, #ff3366, #33ff66)' },
  };
  const s = style[theme.id] ?? style.heartbeat;

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
      <div style={{ height: 56, background: s.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
        {s.icon}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
          {theme.name}
          {pending && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 6 }}>待应用</span>}
        </div>
        <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2, lineHeight: 1.4, minHeight: 26 }}>
          {theme.description}
        </div>
      </div>
    </button>
  );
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