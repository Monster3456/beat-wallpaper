import type { Theme } from './types';

export const THEMES: Theme[] = [
  {
    id: 'heartbeat',
    name: '心跳',
    description: '壁纸随节拍缩放脉冲，适合任何壁纸',
    effects: {
      pulse: true, colorShift: false, parallax: false,
      particles: false, borderGlow: false, pixel8bit: false, waveform: false,
    },
    params: {
      pulseIntensity: 1.0, pulseSpeed: 1.0,
      colorShiftSpeed: 0, colorShiftAmount: 0,
      parallaxAmount: 0, particleCount: 0,
      borderGlowIntensity: 0, pixelBlockSize: 0,
      waveformOpacity: 0, brightness: 1.05, saturation: 1.15, warmth: 1.0,
    },
  },
  {
    id: 'aurora',
    name: '极光',
    description: '色彩缓慢流动 + 光影粒子，适合风景/星空壁纸',
    effects: {
      pulse: false, colorShift: true, parallax: true,
      particles: true, borderGlow: false, pixel8bit: false, waveform: false,
    },
    params: {
      pulseIntensity: 0, pulseSpeed: 0,
      colorShiftSpeed: 0.5, colorShiftAmount: 0.35,
      parallaxAmount: 0.6, particleCount: 150,
      borderGlowIntensity: 0, pixelBlockSize: 0,
      waveformOpacity: 0, brightness: 1.05, saturation: 1.35, warmth: 1.0,
    },
  },
  {
    id: 'neon',
    name: '霓虹',
    description: '屏幕边框流光 + 色彩偏移，适合城市夜景/赛博风壁纸',
    effects: {
      pulse: false, colorShift: true, parallax: false,
      particles: true, borderGlow: false, pixel8bit: false, waveform: false,
    },
    params: {
      pulseIntensity: 0, pulseSpeed: 0,
      colorShiftSpeed: 0.7, colorShiftAmount: 0.4,
      parallaxAmount: 0.5, particleCount: 200,
      borderGlowIntensity: 0, pixelBlockSize: 0,
      waveformOpacity: 0, brightness: 1.05, saturation: 1.3, warmth: 0.8,
    },
  },
  {
    id: 'deepsea',
    name: '深海',
    description: '低频鼓点放大 + 蓝色调偏移 + 光影流动，适合海洋/蓝色系壁纸',
    effects: {
      pulse: true, colorShift: true, parallax: true,
      particles: true, borderGlow: false, pixel8bit: false, waveform: false,
    },
    params: {
      pulseIntensity: 0.8, pulseSpeed: 0.8,
      colorShiftSpeed: 0.25, colorShiftAmount: 0.18,
      parallaxAmount: 0.5, particleCount: 150,
      borderGlowIntensity: 0, pixelBlockSize: 0,
      waveformOpacity: 0, brightness: 1.0, saturation: 1.0, warmth: 0.8,
    },
  },
  {
    id: 'blaze',
    name: '烈焰',
    description: '低频脉冲幅度大 + 暖色调偏移 + 光影流动，适合日落/红色系壁纸',
    effects: {
      pulse: true, colorShift: true, parallax: true,
      particles: true, borderGlow: false, pixel8bit: false, waveform: false,
    },
    params: {
      pulseIntensity: 0.9, pulseSpeed: 1.0,
      colorShiftSpeed: 0.4, colorShiftAmount: 0.25,
      parallaxAmount: 0.55, particleCount: 300,
      borderGlowIntensity: 0, pixelBlockSize: 0,
      waveformOpacity: 0, brightness: 1.1, saturation: 1.4, warmth: 1.3,
    },
  },
  {
    id: 'pure',
    name: '纯净',
    description: '只有微弱的呼吸效果，壁纸基本保持原样，适合极简风格',
    effects: {
      pulse: true, colorShift: false, parallax: false,
      particles: false, borderGlow: false, pixel8bit: false, waveform: false,
    },
    params: {
      pulseIntensity: 0.15, pulseSpeed: 0.5,
      colorShiftSpeed: 0, colorShiftAmount: 0,
      parallaxAmount: 0, particleCount: 0,
      borderGlowIntensity: 0, pixelBlockSize: 0,
      waveformOpacity: 0, brightness: 1.05, saturation: 1.15, warmth: 1.0,
    },
  },
  {
    id: 'rhythm',
    name: '律动',
    description: '底部音波条 + 壁纸缩放，最经典的音乐跳动感',
    effects: {
      pulse: true, colorShift: false, parallax: false,
      particles: false, borderGlow: false, pixel8bit: false, waveform: true,
    },
    params: {
      pulseIntensity: 0.4, pulseSpeed: 1.0,
      colorShiftSpeed: 0, colorShiftAmount: 0,
      parallaxAmount: 0, particleCount: 0,
      borderGlowIntensity: 0, pixelBlockSize: 0,
      waveformOpacity: 0.8, brightness: 1.05, saturation: 1.15, warmth: 1.0,
    },
  },
  {
    id: 'dreamscape',
    name: '幻境',
    description: '全部效果全开：缩放+色彩偏移+光影粒子+音波条，派对模式',
    effects: {
      pulse: true, colorShift: true, parallax: true,
      particles: true, borderGlow: false, pixel8bit: false, waveform: true,
    },
    params: {
      pulseIntensity: 1.0, pulseSpeed: 1.0,
      colorShiftSpeed: 0.6, colorShiftAmount: 0.3,
      parallaxAmount: 0.5, particleCount: 350,
      borderGlowIntensity: 0, pixelBlockSize: 0,
      waveformOpacity: 0.7, brightness: 1.1, saturation: 1.35, warmth: 1.0,
    },
  },
  {
    id: '8bit',
    name: '8-bit',
    description: '像素化风格，壁纸像素粒子随节拍爆炸/重组，复古游戏氛围',
    effects: {
      pulse: true, colorShift: false, parallax: false,
      particles: false, borderGlow: false, pixel8bit: true, waveform: true,
    },
    params: {
      pulseIntensity: 0.5, pulseSpeed: 1.0,
      colorShiftSpeed: 0, colorShiftAmount: 0,
      parallaxAmount: 0, particleCount: 0,
      borderGlowIntensity: 0, pixelBlockSize: 8,
      waveformOpacity: 0.75, brightness: 1.05, saturation: 1.35, warmth: 1.0,
    },
  },
];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function getDefaultSettings() {
  return {
    theme: 'dreamscape',
    performanceMode: 'high' as const,
    autoStart: true,
    pauseOnFullscreen: true,
    audioSensitivity: 0.5,
    wallpaperPath: null as string | null,
    isVideo: false,
  };
}