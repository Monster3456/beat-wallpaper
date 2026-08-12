import type { AudioData, Theme, ThemeParams, ScreenInfo } from '../types';
import { BeatPulse } from './BeatPulse';
import { ColorShift } from './ColorShift';
import { ParallaxDepth } from './ParallaxDepth';
import { Particles } from './Particles';
import { BorderGlow } from './BorderGlow';
import { WaveformBars } from './WaveformBars';
import { Pixel8Bit } from './Pixel8Bit';
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
  private currentTheme: Theme | null = null;

  private beatPulse: BeatPulse;
  private colorShift: ColorShift;
  private parallaxDepth: ParallaxDepth;
  private particles: Particles;
  private borderGlow: BorderGlow;
  private waveformBars: WaveformBars;
  private pixel8Bit: Pixel8Bit;

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

    // 默认黑色背景
    // 注意：color 会与 map 相乘，必须用白色否则壁纸纹理显示为全黑
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.bgMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.bgMesh);

    // 初始化所有效果
    this.beatPulse = new BeatPulse(this.bgMesh);
    this.colorShift = new ColorShift(
      (this.bgMesh.material as THREE.MeshBasicMaterial).map as unknown as THREE.Texture,
    );
    this.parallaxDepth = new ParallaxDepth(this.scene);
    this.particles = new Particles(this.scene);
    this.borderGlow = new BorderGlow(this.scene);
    this.waveformBars = new WaveformBars();
    this.pixel8Bit = new Pixel8Bit();
    // this.lightFlow = new LightFlow(); 已移除（用户反馈不够美观）

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  setTexture(texture: THREE.Texture) {
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

  setDepthMap(_depthData: number[]) {
    // 深度视差已移除（build 网格会破坏壁纸显示）
  }

  applyTheme(theme: Theme) {
    this.currentTheme = theme;
    // 粒子常驻：无粒子主题也保留 60 个基础粒子
    const baseCount = theme.effects.particles ? 0 : 60;
    this.particles.setCount(Math.max(theme.params.particleCount, baseCount));

    // 切换主题时重置效果状态，防止旧主题效果残留叠加（马赛克问题）
    this.pixel8Bit.setEnabled(theme.effects.pixel8bit);
    this.waveformBars.setEnabled(true); // 音波条常驻所有主题
    if (!theme.effects.parallax) {
      this.parallaxDepth.clear();
    }
  }

  updateEffects(audio: AudioData, theme: Theme) {
    if (!theme) return;
    this.currentTheme = theme;
    const p = theme.params;

    if (theme.effects.pulse) this.beatPulse.update(audio, p, this.screen);
    if (theme.effects.colorShift) this.colorShift.update(audio, p, this.screen);
    // 粒子常驻所有主题
    this.particles.update(audio, p, this.screen);
    if (theme.effects.borderGlow) this.borderGlow.update(audio, p, this.screen);
    // 音波条常驻：始终更新（透明度由主题参数控制）
    this.waveformBars.update(audio, p, this.screen);
    // 光影流动已移除
    // this.lightFlow.update(audio, p);
    if (theme.effects.pixel8bit) this.pixel8Bit.update(audio, p, this.screen);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    if (this.pixel8Bit.isVisible()) {
      // 8-bit 模式：主场景 → 低分辨率 → 像素化放大
      this.pixel8Bit.render(this.renderer, this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    // 前景层：音波条
    // this.lightFlow.render(this.renderer); 已移除
    if (this.waveformBars.isVisible()) {
      this.waveformBars.render(this.renderer);
    }
  };

  private onResize() {
    this.screen.width = window.innerWidth;
    this.screen.height = window.innerHeight;
    this.screen.dpr = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.renderer.setPixelRatio(this.screen.dpr);
    const tex = (this.bgMesh.material as THREE.MeshBasicMaterial).map;
    if (tex) {
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