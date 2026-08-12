import * as THREE from 'three';
import type { AudioData, ThemeParams, ScreenInfo } from '../types';

/**
 * AI 视差分层效果
 * 使用深度图让壁纸产生 3D 纵深感：每个顶点按深度在 z 轴位移，
 * 音频驱动网格微旋转，产生随音乐律动的视差光影
 */
export class ParallaxDepth {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private time: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * 根据深度图构建视差网格
   */
  build(texture: THREE.Texture, depthData: number[], _params: ThemeParams) {
    this.clear();

    if (!depthData || depthData.length === 0) return;

    const imgW = texture.image?.width || texture.image?.videoWidth || 1920;
    const imgH = texture.image?.height || texture.image?.videoHeight || 1080;

    const grid = 24; // 低密度网格（减少扭曲面）
    const geometry = new THREE.PlaneGeometry(2, 2, grid, grid);
    const positions = geometry.attributes.position.array;
    const uvs = geometry.attributes.uv.array;

    // 每个顶点按深度图在 z 轴位移（微小幅度，避免画面撕裂）
    const dispScale = 0.025;
    for (let i = 0; i < positions.length / 3; i++) {
      const uvx = uvs[i * 2];
      const uvy = uvs[i * 2 + 1];

      const tx = Math.min(Math.floor(uvx * (imgW - 1)), imgW - 1);
      const ty = Math.min(Math.floor(uvy * (imgH - 1)), imgH - 1);
      const idx = ty * imgW + tx;

      const depth = idx < depthData.length ? depthData[idx] : 0.5;
      // 极微小的 z 位移（0.025 幅度），避免网格扭曲导致画面破碎
      positions[i * 3 + 2] = (depth - 0.5) * dispScale;
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  update(audio: AudioData, params: ThemeParams, _screen: ScreenInfo) {
    if (!this.mesh || params.parallaxAmount <= 0) return;

    this.time += 0.016;

    // 低频驱动俯仰、中频驱动偏航（微小角度，避免画面扭曲）
    const tiltX = Math.sin(this.time * 0.3) * 0.015 * params.parallaxAmount * (1 + audio.bass);
    const tiltY = Math.cos(this.time * 0.25) * 0.015 * params.parallaxAmount * (1 + audio.mid * 0.5);

    this.mesh.rotation.x = tiltX;
    this.mesh.rotation.y = tiltY;

    // 节拍时轻微上下震动（光影流动感）
    if (audio.beat) {
      this.mesh.position.y = audio.beat_strength * 0.01 * params.parallaxAmount;
    } else {
      this.mesh.position.y = 0;
    }
  }

  clear() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
  }
}