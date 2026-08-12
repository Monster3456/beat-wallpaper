import { useState } from 'react';
import { THEMES } from '../themes';

interface Props {
  onComplete: (themeId: string) => void;
}

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState('heartbeat');

  const steps = [
    {
      title: '欢迎使用 BeatWallpaper',
      desc: '一款随音乐律动的桌面壁纸软件。导入你的壁纸，播放音乐，感受桌面随着节拍跳动的氛围。',
    },
    {
      title: '选择氛围主题',
      desc: '选择一个你喜欢的氛围效果，后续随时可以切换。',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setSelectedTheme(theme.id)}
              style={{
                padding: '12px 8px',
                borderRadius: 10,
                background: selectedTheme === theme.id
                  ? 'rgba(136, 136, 255, 0.25)'
                  : 'rgba(255,255,255,0.05)',
                border: selectedTheme === theme.id
                  ? '1px solid rgba(136, 136, 255, 0.5)'
                  : '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                cursor: 'pointer',
                textAlign: 'center',
                fontSize: 13,
                fontWeight: selectedTheme === theme.id ? 600 : 400,
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
                {theme.description}
              </div>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: '准备好了！',
      desc: '点击"开始体验"后，你可以通过系统托盘图标随时切换主题和壁纸。现在去播放一首歌试试吧！',
    },
  ];

  const s = steps[step];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(30px)',
      zIndex: 99999,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{
        background: 'rgba(20, 20, 35, 0.95)',
        borderRadius: 24,
        padding: '40px 48px',
        maxWidth: 520,
        width: '90%',
        color: '#fff',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
      }}>
        {/* 步骤指示器 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i <= step ? 'rgba(136, 136, 255, 0.8)' : 'rgba(255,255,255,0.1)',
                transition: 'all 0.3s',
              }}
            />
          ))}
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700 }}>{s.title}</h2>
        <p style={{ margin: 0, fontSize: 15, opacity: 0.65, lineHeight: 1.6 }}>{s.desc}</p>

        {'content' in s && s.content}

        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              style={{
                padding: '12px 32px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6666ff, #8888ff)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              下一步
            </button>
          ) : (
            <button
              onClick={() => onComplete(selectedTheme)}
              style={{
                padding: '12px 32px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6666ff, #8888ff)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              开始体验
            </button>
          )}
        </div>
      </div>
    </div>
  );
}