import * as THREE from 'three';
import type { AudioData, ThemeParams, ScreenInfo } from '../types';

/**
 * 色彩偏移效果
 * 随音乐频谱偏移壁纸的色调
 */
export class ColorShift {
  private material: THREE.ShaderMaterial;
  private time: number = 0;

  constructor(texture: THREE.Texture) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uHueShift: { value: 0.0 },
        uSaturation: { value: 1.0 },
        uBrightness: { value: 1.0 },
        uTime: { value: 0.0 },
        uAudioBass: { value: 0.0 },
        uAudioMid: { value: 0.0 },
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
        uniform float uHueShift;
        uniform float uSaturation;
        uniform float uBrightness;
        uniform float uTime;
        uniform float uAudioBass;
        uniform float uAudioMid;

        varying vec2 vUv;

        vec3 rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          float e = 1.0e-10;
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
          vec4 texColor = texture2D(uTexture, vUv);

          // 色调偏移
          vec3 hsv = rgb2hsv(texColor.rgb);
          hsv.x = mod(hsv.x + uHueShift, 1.0);
          hsv.y *= uSaturation;
          hsv.z *= uBrightness;

          vec3 finalColor = hsv2rgb(hsv);

          // 低频脉冲增加暖色
          finalColor.r += uAudioBass * 0.05;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }

  update(audio: AudioData, params: ThemeParams, _screen: ScreenInfo) {
    if (params.colorShiftAmount <= 0) return;

    this.time += 0.016;

    // 用中频驱动色彩偏移速度
    const audioDrivenSpeed = params.colorShiftSpeed * (0.5 + audio.mid * 0.5);
    const hueShift = Math.sin(this.time * audioDrivenSpeed * 0.5) * params.colorShiftAmount * 0.1;

    this.material.uniforms.uHueShift.value = hueShift;
    this.material.uniforms.uSaturation.value = params.saturation;
    this.material.uniforms.uBrightness.value = params.brightness;
    this.material.uniforms.uAudioBass.value = audio.bass;
    this.material.uniforms.uAudioMid.value = audio.mid;
  }

  getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  setTexture(texture: THREE.Texture) {
    this.material.uniforms.uTexture.value = texture;
  }
}