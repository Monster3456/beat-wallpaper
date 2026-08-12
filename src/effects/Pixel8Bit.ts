import * as THREE from 'three';
import type { AudioData, ThemeParams, ScreenInfo } from '../types';

/**
 * 8-bit 像素化效果
 * 将主场景渲染到低分辨率目标，再用最近邻插值放大到全屏，
 * 产生复古像素块效果，随音乐跳动
 */
export class Pixel8Bit {
  private renderTarget: THREE.WebGLRenderTarget;
  private quadScene: THREE.Scene;
  private quadCamera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private time: number = 0;

  constructor() {
    // 渲染目标：1/3 分辨率（640x360），细腻清晰
    this.renderTarget = new THREE.WebGLRenderTarget(640, 360, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.quadCamera.position.z = 1;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.renderTarget.texture },
        uBeat: { value: 0.0 },
        uAudioBass: { value: 0.0 },
        uTime: { value: 0.0 },
        uPixelScale: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uBeat;
        uniform float uAudioBass;
        uniform float uTime;
        uniform float uPixelScale;

        varying vec2 vUv;

        void main() {
          // 像素块大小随节拍变化（基础 192 块，细腻清晰）
          float block = 192.0 * uPixelScale * (1.0 + uAudioBass * 0.2);
          vec2 pixelUv = floor(vUv * block) / block;

          vec4 color = texture2D(uTexture, pixelUv);

          // 8-bit 调色板量化（16 级，色彩更平滑美观）
          color.rgb = floor(color.rgb * 16.0 + 0.5) / 16.0;
          color.a = ceil(color.a * 4.0 + 0.5) / 4.0; // alpha 也量化避免闪烁

          // 整体提亮，避免暗黑压抑
          color.rgb = color.rgb * 1.12 + 0.06;

          // 节拍闪烁
          float flash = 1.0 + uBeat * 0.35;
          color.rgb *= flash;

          // 复古扫描线（亮色线，不压暗画面）
          float scanline = sin(vUv.y * block * 2.0) * 0.5 + 0.5;
          color.rgb += scanline * 0.05;

          gl_FragColor = vec4(color.rgb, color.a);
        }
      `,
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quadGeo, this.material);
    this.quad.visible = false;
    this.quadScene.add(this.quad);
  }

  /** 每帧更新参数 */
  update(audio: AudioData, params: ThemeParams, screen: ScreenInfo) {
    if (params.pixelBlockSize <= 0) {
      this.quad.visible = false;
      return;
    }

    this.quad.visible = true;
    this.time += 0.016;

    this.material.uniforms.uBeat.value = audio.beat ? audio.beat_strength : 0;
    this.material.uniforms.uAudioBass.value = audio.bass;
    this.material.uniforms.uTime.value = this.time;
    // 像素块尺寸：pixelBlockSize 越大块越大（8 → 1 倍，16 → 0.5 倍）
    this.material.uniforms.uPixelScale.value = 8.0 / Math.max(params.pixelBlockSize, 1);

    // 随音频微调渲染分辨率（轻幅变化）
    const resScale = 1.0 / (1.0 + audio.bass * 0.1);
    this.renderTarget.setSize(
      Math.max(560, Math.floor(640 * resScale)),
      Math.max(315, Math.floor(360 * resScale)),
    );
  }

  isVisible(): boolean {
    return this.quad.visible;
  }

  /** 切换主题时控制启用状态（防止残留马赛克） */
  setEnabled(enabled: boolean) {
    this.quad.visible = enabled;
    if (!enabled) {
      // 复位渲染目标尺寸
      this.renderTarget.setSize(80, 45);
    }
  }

  /** 渲染主场景到低分辨率再放大显示（由 EffectComposer 调用） */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.renderTarget.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}