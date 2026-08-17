import type { AudioData, Theme, ThemeParams, ScreenInfo } from '../types';
import { BeatPulse } from './BeatPulse';
import { ColorShift } from './ColorShift';
import { Particles } from './Particles';
import { BorderGlow } from './BorderGlow';
import { WaveformBars } from './WaveformBars';
import { Pixel8Bit } from './Pixel8Bit';
import { AtmosphereLayer } from './AtmosphereLayer';
import { SignatureLayer } from './SignatureLayer';
import * as THREE from 'three';

/**
 * 效果编排器 - 管理所有视觉效果的开/关和参数传递
 */
export class EffectComposer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private bgMesh: THREE.Mesh;
  private screen: ScreenInfo;
  private perfCap: number = 1.5;
  private currentTheme: Theme | null = null;
  /** macOS 嵌入桌面模式：只叠加效果，不渲染壁纸图像（系统桌面/图标/小组件透出） */
  private embedDesktop: boolean = false;

  private beatPulse: BeatPulse;
  private colorShift: ColorShift;
  private particles: Particles;
  private borderGlow: BorderGlow;
  private waveformBars: WaveformBars;
  private pixel8Bit: Pixel8Bit;
  private atmosphere: AtmosphereLayer;
  private signature: SignatureLayer;

  constructor(container: HTMLElement) {
    this.screen = {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio, 1.5),
    };

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.renderer.setPixelRatio(this.screen.dpr);
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    // 关键：相机必须远离 z=0 平面，否则与壁纸共面不可见
    this.camera.position.z = 1;

    // 默认背景：深色渐变纹理（无壁纸时也不是白屏；注意 color 需为白色否则纹理变黑）
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#0d0d18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: new THREE.CanvasTexture(canvas),
    });
    this.bgMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.bgMesh);

    // 初始化所有效果
    this.beatPulse = new BeatPulse(this.bgMesh);
    this.colorShift = new ColorShift(
      (this.bgMesh.material as THREE.MeshBasicMaterial).map as unknown as THREE.Texture,
    );
    this.particles = new Particles(this.scene);
    this.borderGlow = new BorderGlow(this.scene);
    this.waveformBars = new WaveformBars();
    this.pixel8Bit = new Pixel8Bit();
    this.atmosphere = new AtmosphereLayer();
    this.signature = new SignatureLayer();
    // this.lightFlow = new LightFlow(); 已移除（用户反馈不够美观）

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  /** 切换嵌入桌面模式：默认隐藏壁纸图像层；8bit 主题例外（需像素化壁纸） */
  setEmbedDesktop(flag: boolean) {
    this.embedDesktop = flag;
    this.bgMesh.visible = !flag || (this.currentTheme?.effects.pixel8bit ?? false);
  }

  /** 性能模式：像素比上限 + 粒子上限 */
  setPerformanceMode(mode: 'high' | 'balanced' | 'energy') {
    this.perfCap = mode === 'high' ? 1.5 : mode === 'balanced' ? 1.25 : 1.0;
    this.screen.dpr = Math.min(window.devicePixelRatio, this.perfCap);
    this.renderer.setPixelRatio(this.screen.dpr);
    this.particles.setMaxParticles(mode === 'high' ? 350 : mode === 'balanced' ? 220 : 140);
  }

  setTexture(texture: THREE.Texture) {
    // 嵌入模式也保存壁纸纹理：8bit 主题需要像素化壁纸图像
    // 只替换材质，不能 remove mesh（否则网格移出场景导致空白）
    const newMat = new THREE.MeshBasicMaterial({ map: texture });
    (this.bgMesh.material as THREE.Material).dispose();
    this.bgMesh.material = newMat;

    // 先做 cover 宽高比适配，再让脉冲基于适配后的比例缩放
    this.applyCoverFit(texture);
    this.beatPulse.setMesh(this.bgMesh);
  }

  /** 根据纹理与窗口的宽高比做 cover 缩放（放大填满+裁切，不变形） */
  private applyCoverFit(texture: THREE.Texture) {
    const img = texture.image;
    if (!img || !img.width || !img.height) return;

    const imgAspect = img.width / img.height;
    const winAspect = this.screen.width / this.screen.height;

    // cover：放大平面让纹理溢出窗口被裁切（绝不能缩小，否则露出空白）
    let scaleX = 1;
    let scaleY = 1;
    if (imgAspect > winAspect) {
      // 图片更宽：y 填满，x 放大裁切两侧
      scaleX = imgAspect / winAspect;
    } else {
      // 图片更高：x 填满，y 放大裁切上下
      scaleY = winAspect / imgAspect;
    }

    this.bgMesh.scale.set(scaleX, scaleY, 1);
  }

  applyTheme(theme: Theme) {
    this.currentTheme = theme;

    // 主题主色 → 粒子锚定色相 + 上升浮力 + 形态 + 氛围层光晕颜色
    // 必须先于 setCount：环境形态/点燃逻辑依赖 shape 与 rise
    const accent = new THREE.Color(theme.accentColor);
    const hsl = { h: 0, s: 0, l: 0 };
    accent.getHSL(hsl);
    this.particles.setAccentHue(hsl.h);
    this.particles.setRise(theme.params.particleRise);
    this.particles.setShape(theme.params.particleShape);
    this.atmosphere.setAccentColor(theme.accentColor);
    this.signature.setSignature(
      theme.params.signatureMode,
      theme.params.signatureAmount,
      theme.accentColor,
    );

    // 粒子常驻：无粒子主题保留 60 个基础粒子（8bit 等明确关闭的除外）
    const baseCount = theme.effects.particles ? 0 : theme.params.particleEnabled === false ? 0 : 60;
    this.particles.setCount(Math.max(theme.params.particleCount, baseCount));

    // 切换主题时重置效果状态，防止旧主题效果残留叠加（马赛克问题）
    this.pixel8Bit.setEnabled(theme.effects.pixel8bit);
    // 嵌入模式下默认隐藏壁纸图像层，但 8bit 主题需要显示它来做像素化
    this.bgMesh.visible = !this.embedDesktop || theme.effects.pixel8bit;
    this.waveformBars.setEnabled(true); // 音波条常驻所有主题
  }

  updateEffects(audio: AudioData, theme: Theme) {
    if (!theme) return;
    this.currentTheme = theme;
    const p = theme.params;

    if (!this.embedDesktop && theme.effects.pulse) this.beatPulse.update(audio, p, this.screen);
    if (!this.embedDesktop && theme.effects.colorShift) this.colorShift.update(audio, p, this.screen);
    // 粒子常驻所有主题
    this.particles.update(audio, p, this.screen);
    if (theme.effects.borderGlow) this.borderGlow.update(audio, p, this.screen);
    // 音波条常驻：始终更新（透明度由主题参数控制）
    this.waveformBars.update(audio, p, this.screen);
    // 氛围层：光晕 + 闪光 + 暗角
    this.atmosphere.update(audio, p);
    // 招牌效果：极光幕帘 / 霓虹网格
    this.signature.update(audio, p);
    // 光影流动已移除
    // this.lightFlow.update(audio, p);
    if (theme.effects.pixel8bit) this.pixel8Bit.update(audio, p, this.screen);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    if (this.pixel8Bit.isVisible()) {
      // 8-bit 模式：主场景 + 前景层 → 低分辨率 → 像素化放大（覆盖音波/光晕/招牌效果）
      this.pixel8Bit.render(this.renderer, this.scene, this.camera, (r) => {
        if (this.atmosphere.isVisible()) this.atmosphere.render(r);
        if (this.signature.isVisible()) this.signature.render(r);
        if (this.waveformBars.isVisible()) this.waveformBars.render(r);
      });
      return;
    }
    this.renderer.render(this.scene, this.camera);
    // 前景层：氛围光晕 → 招牌效果 → 音波条
    if (this.atmosphere.isVisible()) {
      this.atmosphere.render(this.renderer);
    }
    if (this.signature.isVisible()) {
      this.signature.render(this.renderer);
    }
    if (this.waveformBars.isVisible()) {
      this.waveformBars.render(this.renderer);
    }
  };

  private onResize() {
    this.screen.width = window.innerWidth;
    this.screen.height = window.innerHeight;
    this.screen.dpr = Math.min(window.devicePixelRatio, this.perfCap);
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.renderer.setPixelRatio(this.screen.dpr);
    const tex = (this.bgMesh.material as THREE.MeshBasicMaterial).map;
    if (tex && !this.embedDesktop) {
      this.applyCoverFit(tex);
      this.beatPulse.setMesh(this.bgMesh);
    }
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.pixel8Bit.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    window.removeEventListener('resize', () => this.onResize());
  }
}