import * as THREE from 'three';
import type { AudioData, ThemeParams, ScreenInfo } from '../types';

/**
 * 缩放脉冲效果
 * 壁纸随音乐节拍产生呼吸/缩放感
 * 保持 cover 适配的宽高比（x/y 独立基准缩放）
 */
export class BeatPulse {
  private mesh: THREE.Mesh;
  private baseScaleX: number;
  private baseScaleY: number;
  private scaleCurrent: number;
  private velocity: number = 0;

  constructor(mesh: THREE.Mesh) {
    this.mesh = mesh;
    this.baseScaleX = mesh.scale.x;
    this.baseScaleY = mesh.scale.y;
    this.scaleCurrent = 1.0;
  }

  update(audio: AudioData, params: ThemeParams, _screen: ScreenInfo) {
    if (params.pulseIntensity <= 0) return;

    // 低频驱动脉冲（更强响应）
    const target = audio.bass * params.pulseIntensity * 0.2;
    const beatBoost = audio.beat ? audio.beat_strength * 0.15 : 0;
    const targetScale = 1.0 + target + beatBoost;

    // 弹簧阻尼动画（更快响应）
    const stiffness = 0.2;
    const damping = 0.65;
    this.velocity += (targetScale - this.scaleCurrent) * stiffness;
    this.velocity *= damping;
    this.scaleCurrent += this.velocity;

    // 保持 cover 宽高比缩放（x/y 独立基准）
    this.mesh.scale.set(
      this.baseScaleX * this.scaleCurrent,
      this.baseScaleY * this.scaleCurrent,
      1,
    );
  }

  setMesh(mesh: THREE.Mesh) {
    this.mesh = mesh;
    this.baseScaleX = mesh.scale.x;
    this.baseScaleY = mesh.scale.y;
    this.scaleCurrent = 1.0;
    this.velocity = 0;
  }
}