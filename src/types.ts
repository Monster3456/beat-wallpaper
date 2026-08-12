/** 音频数据帧 */
export interface AudioData {
  volume: number;
  bass: number;
  mid: number;
  high: number;
  beat: boolean;
  beat_strength: number;
  spectrum: number[];
}

/** 氛围主题 */
export interface Theme {
  id: string;
  name: string;
  description: string;
  /** 主题主色（光晕/粒子/招牌效果共用的色彩骨架） */
  accentColor: string;
  effects: {
    pulse: boolean;
    colorShift: boolean;
    parallax: boolean;
    particles: boolean;
    borderGlow: boolean;
    pixel8bit: boolean;
    waveform: boolean;
  };
  params: ThemeParams;
}

/** 主题参数 */
export interface ThemeParams {
  pulseIntensity: number;     // 缩放脉冲强度 (0-1)
  pulseSpeed: number;         // 脉冲速度 (0-1)
  colorShiftSpeed: number;    // 色彩偏移速度 (0-1)
  colorShiftAmount: number;   // 色彩偏移幅度 (0-1)
  parallaxAmount: number;     // 视差幅度 (0-1)
  particleCount: number;      // 粒子数量 (0=关闭)
  borderGlowIntensity: number; // 边框光晕强度 (0-1)
  pixelBlockSize: number;     // 像素块大小 (0=关闭)
  waveformOpacity: number;    // 音波条透明度 (0-1)
  brightness: number;         // 壁纸亮度 (0-2)
  saturation: number;         // 色彩饱和度 (0-2)
  warmth: number;             // 色温暖度 (0.5-1.5)
  haloIntensity: number;      // 背景光晕强度 (0-1)
  vignetteAmount: number;     // 暗角强度 (0-1)
  flashAmount: number;        // 节拍闪光强度 (0-1)
  haloTop: number;            // 顶部幕帘光晕占比 (0-1，极光用)
  haloFlicker: number;        // 光晕火焰闪烁强度 (0-1，烈焰用)
  particleRise: number;       // 粒子上升浮力 (0-1，烈焰火星/深海气泡)
  particleShape: 'dot' | 'snow' | 'heart' | 'flame' | 'bubble'; // 粒子形态
  signatureMode: 'none' | 'aurora' | 'neon' | 'wave'; // 招牌效果
  signatureAmount: number;    // 招牌效果强度 (0-1)
  particleEnabled: boolean;   // 无粒子主题的基础粒子（8bit 关闭）
  tintAmount: number;         // 壁纸色调滤镜强度 (0-0.25，勿过强)
}

/** 应用设置 */
export interface Settings {
  theme: string;
  performanceMode: 'high' | 'balanced' | 'energy';
  autoStart: boolean;
  pauseOnFullscreen: boolean;
  audioSensitivity: number;
  wallpaperPath: string | null;
  isVideo: boolean;
}

/** 颜色值 */
export interface HSLColor {
  h: number; s: number; l: number;
}

/** 屏幕信息 */
export interface ScreenInfo {
  width: number;
  height: number;
  dpr: number;
}