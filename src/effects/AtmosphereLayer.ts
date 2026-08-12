import * as THREE from 'three';
import type { AudioData, ThemeParams } from '../types';

/**
 * 氛围层：背景光晕 + 节拍闪光 + 暗角呼吸
 * - 光晕：底部弥散光 + 中心光晕，随低音/音量呼吸；静音时转为缓慢正弦呼吸（待机不熄）
 * - 闪光：节拍瞬间全屏提亮后快速衰减
 * - 暗角：四角压暗并随音量轻微呼吸，电影感
 */
export class AtmosphereLayer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private haloMat: THREE.ShaderMaterial;
  private flashMat: THREE.ShaderMaterial;
  private vignetteMat: THREE.ShaderMaterial;
  private tintMat: THREE.ShaderMaterial;
  private haloMesh: THREE.Mesh;
  private flashMesh: THREE.Mesh;
  private vignetteMesh: THREE.Mesh;
  private tintMesh: THREE.Mesh;
  private time: number = 0;
  private intensity: number = 0;
  private flashEnergy: number = 0;
  private accent: THREE.Color = new THREE.Color(0x2ee6a8);
  private accentTarget: THREE.Color = new THREE.Color(0x2ee6a8);

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.camera.position.z = 1;

    const quadGeo = new THREE.PlaneGeometry(2, 2);

    // 壁纸色调滤镜：低强度主题色叠加（海蓝/粉/极光绿等），不遮盖壁纸细节
    this.tintMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.accent.clone() },
        uAlpha: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uAlpha;
        varying vec2 vUv;

        void main() {
          gl_FragColor = vec4(uColor * uAlpha, uAlpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.tintMesh = new THREE.Mesh(quadGeo, this.tintMat);
    this.tintMesh.visible = false;
    this.tintMesh.renderOrder = 0;
    this.scene.add(this.tintMesh);

    this.haloMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.accent.clone() },
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uTopGlow: { value: 0 },
        uFlicker: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        uniform float uTopGlow;
        uniform float uFlicker;
        varying vec2 vUv;

        void main() {
          // 底部弥散光（火焰从下方升腾）与顶部幕帘光（极光）按权重混合
          float bottom = pow(max(0.0, 1.0 - vUv.y), 2.0);
          float top = pow(vUv.y, 2.2);
          float directional = mix(bottom, top, uTopGlow);
          // 火焰闪烁：hash 噪声随时间抖动，仅烈焰主题明显
          float n = fract(sin(dot(vUv * 30.0 + uTime * 8.0, vec2(12.9898, 78.233))) * 43758.5453);
          directional *= 1.0 - uFlicker * 0.45 * n;
          // 中心光晕：径向高斯，悬浮在画面中部偏下
          vec2 c = vec2(0.5, 0.45);
          float d = distance(vUv, c);
          float center = exp(-d * d * 5.0);
          float glow = directional * 0.75 + center * 0.4;
          gl_FragColor = vec4(uColor * glow * uIntensity, glow * uIntensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.haloMesh = new THREE.Mesh(quadGeo, this.haloMat);
    this.haloMesh.visible = false;
    this.haloMesh.renderOrder = 1;
    this.scene.add(this.haloMesh);

    this.flashMat = new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        varying vec2 vUv;

        void main() {
          gl_FragColor = vec4(vec3(1.0), uAlpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flashMesh = new THREE.Mesh(quadGeo, this.flashMat);
    this.flashMesh.visible = false;
    this.flashMesh.renderOrder = 2;
    this.scene.add(this.flashMesh);

    this.vignetteMat = new THREE.ShaderMaterial({
      uniforms: {
        uAmount: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAmount;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p * vec2(1.15, 1.0));
          float v = smoothstep(0.35, 0.9, r) * uAmount;
          gl_FragColor = vec4(0.0, 0.0, 0.0, v);
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    this.vignetteMesh = new THREE.Mesh(quadGeo, this.vignetteMat);
    this.vignetteMesh.visible = false;
    this.vignetteMesh.renderOrder = 3;
    this.scene.add(this.vignetteMesh);
  }

  setAccentColor(hex: string) {
    this.accentTarget.set(hex);
  }

  isVisible(): boolean {
    return (
      this.haloMesh.visible ||
      this.flashMesh.visible ||
      this.vignetteMesh.visible ||
      this.tintMesh.visible
    );
  }

  update(audio: AudioData, params: ThemeParams) {
    this.time += 0.016;

    const haloP = params.haloIntensity;
    const vigP = params.vignetteAmount;
    const flashP = params.flashAmount;
    const active = haloP > 0 || vigP > 0 || flashP > 0 || params.tintAmount > 0;
    this.haloMesh.visible = active;
    this.flashMesh.visible = active;
    this.vignetteMesh.visible = active;
    this.tintMesh.visible = params.tintAmount > 0;
    if (!active) return;

    // 壁纸色调滤镜（低强度，不遮盖壁纸）
    (this.tintMat.uniforms.uAlpha.value as number) = params.tintAmount;
    (this.tintMat.uniforms.uColor.value as THREE.Color).lerp(this.accentTarget, 0.06);

    // 光晕：低音/音量驱动；静音时待机呼吸（正弦慢波，画面不熄）
    let target: number;
    if (audio.volume < 0.05) {
      target = (0.22 + 0.12 * Math.sin(this.time * 0.6)) * haloP;
    } else {
      target = Math.min(0.18 + audio.bass * 0.55 + audio.volume * 0.3, 1.0) * haloP;
    }
    this.intensity += (target - this.intensity) * 0.08;
    (this.haloMat.uniforms.uIntensity.value as number) = this.intensity;
    (this.haloMat.uniforms.uTime.value as number) = this.time;
    (this.haloMat.uniforms.uTopGlow.value as number) = params.haloTop;
    (this.haloMat.uniforms.uFlicker.value as number) = params.haloFlicker;
    (this.haloMat.uniforms.uColor.value as THREE.Color).lerp(this.accentTarget, 0.06);

    // 节拍闪光：能量注入后指数衰减
    this.flashEnergy *= 0.86;
    if (audio.beat) {
      this.flashEnergy = Math.min(this.flashEnergy + audio.beat_strength * 0.5, 1.0);
    }
    (this.flashMat.uniforms.uAlpha.value as number) = this.flashEnergy * flashP * 0.35;

    // 暗角：随音量轻微呼吸
    (this.vignetteMat.uniforms.uAmount.value as number) = Math.min(
      (0.25 + audio.volume * 0.15) * vigP,
      1.0,
    );
  }

  render(renderer: THREE.WebGLRenderer) {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
  }
}
