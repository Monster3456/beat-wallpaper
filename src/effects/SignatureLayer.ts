import * as THREE from 'three';
import type { AudioData, ThemeParams } from '../types';

export type SignatureMode = 'none' | 'aurora' | 'neon' | 'wave';

/**
 * 招牌效果层（每主题专属动态）
 * - aurora（极光）：顶部流动极光幕帘，随中频波动
 * - neon（霓虹）：透视赛博网格，beat 脉冲发光
 */
export class SignatureLayer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private mode: SignatureMode = 'none';
  private amount: number = 0;
  private time: number = 0;
  private accent: THREE.Color = new THREE.Color(0x2ee6a8);
  private accentTarget: THREE.Color = new THREE.Color(0x2ee6a8);

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.camera.position.z = 1;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMode: { value: 0 },
        uAmount: { value: 0 },
        uTime: { value: 0 },
        uColor: { value: this.accent.clone() },
        uBeat: { value: 0 },
        uMid: { value: 0 },
        uBass: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform int uMode;
        uniform float uAmount;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uBeat;
        uniform float uMid;
        uniform float uBass;
        varying vec2 vUv;

        // 极光幕帘：多层流动正弦在顶部区域起伏
        float aurora(vec2 uv) {
          float band = smoothstep(0.6, 0.02, uv.y);
          float n1 = sin(uv.x * 6.0 + uTime * 0.8 + sin(uv.x * 3.0 + uTime * 0.3) * 2.0);
          float n2 = sin(uv.x * 11.0 - uTime * 1.1 + 2.0);
          float n3 = sin(uv.x * 17.0 + uTime * 0.5 + 4.0) * 0.5;
          float curtain = pow(0.5 + 0.5 * (n1 * 0.55 + n2 * 0.3 + n3 * 0.15), 2.0);
          return band * curtain;
        }

        // 霓虹网格：全屏赛博网格（缓慢旋转 + 透视汇聚）+ 双层辉光 + 交点节点光点
        float neonGrid(vec2 uv) {
          // 绕屏幕中心缓慢旋转，节拍时轻微缩放脉冲
          vec2 p = uv - 0.5;
          float ang = uTime * 0.08;
          float ca = cos(ang);
          float sa = sin(ang);
          p = mat2(ca, -sa, sa, ca) * p;
          p *= 1.0 + uBeat * 0.03;
          vec2 ruv = p + 0.5;
          // 透视：y 越大线越密（横向线向上收拢、纵向线向视平线汇聚）
          float rows = 5.0 + 22.0 * ruv.y;
          float cols = 8.0 + 20.0 * ruv.y;
          float ly = abs(fract(ruv.y * rows + uTime * 0.06) - 0.5) * 2.0;
          float lx = abs(fract(ruv.x * cols - uTime * 0.04) - 0.5) * 2.0;
          float line = min(lx, ly);
          // 亮核 + 宽泛光
          float core = smoothstep(0.92, 0.55, line);
          float glow = pow(1.0 - line, 4.0) * 0.4;
          // 交点节点光点：随机闪烁（噪声网格）
          vec2 cell = floor(vec2(ruv.x * cols, ruv.y * rows));
          float nodeN = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float node = step(0.86, nodeN) * smoothstep(0.06, 0.0, line) * 0.65;
          // 高度衰减：底部亮、向上渐隐（距离感）
          float fade = 0.4 + 0.6 * (1.0 - ruv.y);
          return (core + glow + node) * fade;
        }

        // 海浪（深海）：海平面在下 1/3，海水体 + 海天交界线 + 波峰泡沫 + 光点
        // 返回 (alpha, 波峰度, 深度因子)
        vec3 seaWaves(vec2 uv) {
          // 海平面：下 1/4 处，随低音抬升，双层正弦起伏
          float surge = uBass * 0.07;
          float surface = 0.28 + surge
            + sin(uv.x * 3.0 + uTime * 0.6) * 0.024
            + sin(uv.x * 7.2 - uTime * 0.9 + 1.7) * 0.014;
          // 海水体：波面下渐深，覆盖屏幕下方 ~35%
          float depthF = smoothstep(surface, surface - 0.35, uv.y);
          float body = depthF * 0.38;
          // 海天交界亮线（地平线）
          float horizonLine = smoothstep(0.007, 0.0, abs(uv.y - surface)) * 0.55;
          // 主波峰亮线：沿海面轻微错位起伏
          float crest = smoothstep(
            0.014, 0.0,
            abs(uv.y - surface - sin(uv.x * 5.0 + uTime * 1.2) * 0.01)
          );
          // 泡沫次浪：细节波浪沿海面下方游走
          float foamY = surface - 0.018
            + sin(uv.x * 14.0 + uTime * 1.4 + sin(uv.x * 5.0 + uTime * 0.6) * 2.2) * 0.01;
          float foam = smoothstep(0.009, 0.0, abs(uv.y - foamY)) * 0.4;
          // 波峰泡沫光点：细碎闪烁（噪声网格）
          vec2 g = floor(uv * vec2(90.0, 900.0));
          float n = fract(sin(dot(g, vec2(12.9898, 78.233)) + uTime * 2.0) * 43758.5453);
          float sparkle = step(0.93, n) * smoothstep(0.03, 0.0, abs(uv.y - surface)) * 0.6;

          float alpha = body + horizonLine * 0.6 + crest + foam + sparkle;
          float crestiness = clamp(crest + foam * 0.6, 0.0, 1.0);
          return vec3(alpha, crestiness, depthF);
        }

        void main() {
          vec3 color = uColor;
          float alpha = 0.0;
          if (uMode == 1) {
            alpha = aurora(vUv) * uAmount * (0.4 + 0.6 * uMid);
            color *= (1.0 + uBeat * 0.6);
          } else if (uMode == 2) {
            alpha = neonGrid(vUv) * uAmount * (0.5 + uBeat * 0.7);
            color *= (1.0 + uBeat * 0.3);
          } else if (uMode == 3) {
            // 海浪：海洋青蓝 → 波峰泡沫青白，低音驱动涌起（低亮度，不刺眼）
            vec3 w = seaWaves(vUv);
            vec3 shallow = vec3(0.32, 0.68, 0.95);
            vec3 abyss = vec3(0.10, 0.36, 0.72);
            vec3 crestC = vec3(0.65, 0.82, 0.95);
            color = mix(mix(shallow, abyss, w.z), crestC, w.y);
            alpha = w.x * uAmount * (0.25 + uBass * 0.8);
            color *= (1.0 + uBeat * 0.5);
          }
          gl_FragColor = vec4(color * alpha, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  setSignature(mode: SignatureMode, amount: number, accentHex: string) {
    this.mode = mode;
    this.amount = amount;
    this.accentTarget.set(accentHex);
    this.mat.uniforms.uMode.value = mode === 'aurora' ? 1 : mode === 'neon' ? 2 : mode === 'wave' ? 3 : 0;
    this.mat.uniforms.uAmount.value = amount;
    this.mesh.visible = mode !== 'none' && amount > 0;
  }

  isVisible(): boolean {
    return this.mesh.visible;
  }

  update(audio: AudioData, params: ThemeParams) {
    if (!this.mesh.visible) return;
    this.time += 0.016;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uBeat.value = audio.beat ? audio.beat_strength : 0;
    this.mat.uniforms.uMid.value = audio.mid;
    this.mat.uniforms.uBass.value = audio.bass;
    (this.mat.uniforms.uColor.value as THREE.Color).lerp(this.accentTarget, 0.06);
  }

  render(renderer: THREE.WebGLRenderer) {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
  }
}
