import * as THREE from 'three';
import type { AudioData, ThemeParams, ScreenInfo } from '../types';

/**
 * 边框流光效果
 * 屏幕四周的光晕/霓虹灯带随音乐流动
 */
export class BorderGlow {
  private scene: THREE.Scene;
  private glowMeshes: THREE.Mesh[] = [];
  private time: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  init() {
    if (this.glowMeshes.length > 0) return;

    // 创建四条边框光带
    const colors = [0xff0066, 0x00ff66, 0x0066ff, 0xff6600];
    const thickness = 0.018;

    const rects = [
      { x: 0, y: 0.985, w: 2, h: thickness },     // 上
      { x: 0, y: -0.985, w: 2, h: thickness },    // 下
      { x: -0.985, y: 0, w: thickness, h: 2 },     // 左
      { x: 0.985, y: 0, w: thickness, h: 2 },      // 右
    ];

    rects.forEach((rect, i) => {
      const geometry = new THREE.PlaneGeometry(rect.w, rect.h);
      const material = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(rect.x, rect.y, 0.01);
      this.scene.add(mesh);
      this.glowMeshes.push(mesh);
    });
  }

  update(audio: AudioData, params: ThemeParams, _screen: ScreenInfo) {
    if (params.borderGlowIntensity <= 0) {
      this.glowMeshes.forEach((m) => (m.material as THREE.MeshBasicMaterial).opacity = 0);
      return;
    }

    this.init();
    this.time += 0.016;

    // 光晕强度由音频驱动
    const baseIntensity = params.borderGlowIntensity;
    const beatFlash = audio.beat ? audio.beat_strength * 0.7 : 0;
    const intensity = Math.min(baseIntensity + beatFlash, 1.2);

    this.glowMeshes.forEach((mesh, i) => {
      const phase = this.time * 0.6 + i * Math.PI / 2;
      const audioPhase = audio.bass * 0.4 + audio.mid * 0.15;

      // 颜色随音频变化（更饱和更亮）
      const hue = (phase / (Math.PI * 2) + audioPhase) % 1.0;
      const color = new THREE.Color().setHSL(hue, 0.9, 0.55 + audio.bass * 0.35);
      (mesh.material as THREE.MeshBasicMaterial).color.copy(color);
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(intensity * 0.75, 1.0);
    });
  }
}