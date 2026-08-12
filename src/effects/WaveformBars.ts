import * as THREE from 'three';
import type { AudioData, ThemeParams, ScreenInfo } from '../types';

/**
 * 底部音波条（常驻所有主题）
 * 全屏宽度：发光渐变柱子 + 峰值保持亮线 + 整体呼吸变色
 */
export class WaveformBars {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private bars: THREE.Mesh[] = [];
  private peaks: THREE.Mesh[] = [];
  private peakValues: Float32Array;
  private barCount: number = 48;
  private barWidth: number = 0;
  private time: number = 0;
  private enabled: boolean = true;
  private opacity: number = 0.9;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.camera.position.z = 1;

    this.buildBars();
    this.peakValues = new Float32Array(this.barCount);
  }

  private buildBars() {
    this.barWidth = 2.0 / this.barCount;

    for (let i = 0; i < this.barCount; i++) {
      const geometry = new THREE.PlaneGeometry(this.barWidth * 0.85, 1.0);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0.9 },
          uBeat: { value: 0.0 },
          uColor: { value: new THREE.Color().setHSL(0.6, 0.9, 0.6) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          uniform float uBeat;
          uniform vec3 uColor;
          varying vec2 vUv;

          void main() {
            float glow = pow(1.0 - vUv.y, 1.6);
            float edge = smoothstep(0.75, 1.0, vUv.y);
            vec3 color = uColor * (1.0 + edge * 0.5 + uBeat * 0.6);
            float alpha = glow * uOpacity;
            gl_FragColor = vec4(color, min(alpha, 1.0));
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      const x = -1.0 + i * this.barWidth + this.barWidth / 2;
      mesh.position.set(x, -0.92, 0.01);
      mesh.visible = false;
      this.scene.add(mesh);
      this.bars.push(mesh);

      // 峰值保持亮线
      const peakGeo = new THREE.PlaneGeometry(this.barWidth * 0.55, 0.012);
      const peakMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const peak = new THREE.Mesh(peakGeo, peakMat);
      peak.position.set(x, -0.92, 0.02);
      peak.visible = false;
      this.scene.add(peak);
      this.peaks.push(peak);
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  isVisible(): boolean {
    return this.enabled && this.opacity > 0.01;
  }

  update(audio: AudioData, params: ThemeParams, _screen: ScreenInfo) {
    this.opacity = params.waveformOpacity > 0 ? params.waveformOpacity : 0.9;
    if (!this.enabled || this.opacity <= 0.01) {
      this.bars.forEach((b) => (b.visible = false));
      this.peaks.forEach((p) => (p.visible = false));
      return;
    }

    this.time += 0.016;
    const beatBoost = audio.beat ? audio.beat_strength : 0;

    // 呼吸灯：所有柱子整体循环变色（颜色丰富随时间变化）
    // 基础色由时间 + 低频推动，覆盖 0~1 全色环
    const globalHue = (this.time * 0.04 + audio.bass * 0.25) % 1.0;

    this.bars.forEach((bar, i) => {
      bar.visible = true;

      const spectrumIdx = Math.floor((i / this.barCount) * audio.spectrum.length);
      const value = audio.spectrum[spectrumIdx] ?? 0;

      const targetHeight = Math.max(value * 0.55, 0.03) * (1 + beatBoost * 0.2);
      const currentScale = bar.scale.y;
      const smoothScale = currentScale + (targetHeight - currentScale) * 0.45;

      bar.scale.y = smoothScale;
      bar.position.y = -0.92 + smoothScale / 2;

      const mat = bar.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = this.opacity;
      mat.uniforms.uBeat.value = beatBoost;

      // 所有柱子同色（globalHue），每根微偏移以保留层次感
      const hue = (globalHue + i * 0.008) % 1.0;
      const light = 0.65 + audio.bass * 0.3;
      (mat.uniforms.uColor.value as THREE.Color).setHSL(hue, 0.9, light);

      // 峰值保持
      this.peakValues[i] = Math.max(targetHeight, this.peakValues[i] * 0.90);
      const peak = this.peaks[i];
      peak.visible = true;
      peak.position.y = -0.92 + this.peakValues[i];
      (peak.material as THREE.MeshBasicMaterial).opacity = 0.7 + beatBoost * 0.3;
    });
  }

  render(renderer: THREE.WebGLRenderer) {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
  }

  setBarCount(count: number) {
    if (count === this.barCount) return;
    this.clear();
    this.barCount = count;
    this.buildBars();
    this.peakValues = new Float32Array(this.barCount);
  }

  clear() {
    this.bars.forEach((b) => {
      this.scene.remove(b);
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
    });
    this.peaks.forEach((p) => {
      this.scene.remove(p);
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    });
    this.bars = [];
    this.peaks = [];
  }
}