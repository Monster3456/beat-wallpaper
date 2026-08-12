import * as THREE from 'three';
import type { AudioData, ThemeParams, ScreenInfo } from '../types';

/**
 * 游戏化粒子系统（Sprite 实现，保证可见）
 * - 粒子碰到音波条（该位置柱子有高度）→ 分裂成 2 个粒子
 * - 碰到上/左/右边界 → 50% 消失 / 反弹；底部只反弹（数量稳定）
 * - 画面至少保留 1 个粒子
 */
interface Particle {
  sprite: THREE.Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
  light: number;
  alive: boolean;
  cooldown: number;
}

export class Particles {
  private scene: THREE.Scene;
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private targetCount: number = 0;
  private time: number = 0;
  private maxParticles: number = 350;
  private dotTexture: THREE.Texture;

  // 音波条参数（与 WaveformBars 保持一致）
  private waveBaseY: number = -0.92;
  private waveHeightFactor: number = 0.55;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 实心圆点纹理（微粒质感，非发光球）
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(16, 16, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // 边缘轻微羽化（避免锯齿）
    const grad = ctx.createRadialGradient(16, 16, 9, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.7, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    this.dotTexture = new THREE.CanvasTexture(canvas);

    // 预创建粒子池
    for (let i = 0; i < this.maxParticles; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.dotTexture,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.scale.set(0.04, 0.04, 1);
      this.scene.add(sprite);
      this.pool.push({
        sprite,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        hue: 0,
        light: 0.7,
        alive: false,
        cooldown: 0,
      });
    }
  }

  setCount(count: number) {
    this.targetCount = count;
    if (count === 0) {
      this.active.forEach((p) => {
        p.alive = false;
        p.sprite.visible = false;
      });
      this.active = [];
      return;
    }
    // 初始只生成 3 个粒子，随音乐播放通过分裂逐渐增加
    if (this.active.length === 0) {
      for (let i = 0; i < Math.min(3, count); i++) {
        this.activate(this.spawnData());
      }
    }
  }

  private spawnData(overrides: Partial<Omit<Particle, 'sprite' | 'alive'>> = {}) {
    return {
      x: (Math.random() - 0.5) * 1.4,
      y: Math.random() * 1.2 - 0.1,
      vx: (Math.random() - 0.5) * 0.02,
      vy: (Math.random() - 0.5) * 0.02,
      size: Math.random() * 1.2 + 0.8,
      hue: Math.random(),
      light: 0.55 + Math.random() * 0.25,
      ...overrides,
    };
  }

  private activate(data: ReturnType<typeof this.spawnData>): Particle {
    const p = this.pool.find((q) => !q.alive);
    if (!p) return this.active[0];

    p.alive = true;
    p.sprite.visible = true;
    p.x = data.x;
    p.y = data.y;
    p.vx = data.vx;
    p.vy = data.vy;
    p.size = data.size;
    p.hue = data.hue;
    p.light = data.light;
    p.cooldown = 0;
    p.sprite.position.set(data.x, data.y, 0.02);
    p.sprite.scale.set(data.size * 0.004, data.size * 0.004, 1);
    this.active.push(p);
    return p;
  }

  private deactivate(p: Particle) {
    p.alive = false;
    p.sprite.visible = false;
    const idx = this.active.indexOf(p);
    if (idx >= 0) this.active.splice(idx, 1);
  }

  update(audio: AudioData, params: ThemeParams, _screen: ScreenInfo) {
    if (this.targetCount === 0) return;
    this.time += 0.016;

    const bass = audio.bass;
    const vol = audio.volume;
    const beat = audio.beat ? audio.beat_strength : 0;
    const spectrum = audio.spectrum ?? [];

    // 粒子数量完全由 分裂(+1) / 消失(-1) 驱动：
    // 有音乐 → 碰音波分裂数量增长；无音乐 → 边界消失逐渐剩 1 个（保底）
    // 注意：不补充粒子（补充会阻止"无音乐时只剩 1 个"的设计）

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];

      if (p.cooldown > 0) p.cooldown--;

      p.vx += (Math.random() - 0.5) * 0.002 * (1 + bass * 2);
      p.vy += (Math.random() - 0.5) * 0.002 * (1 + vol);
      if (audio.beat) {
        p.vx += (Math.random() - 0.5) * 0.01 * beat;
        p.vy += (Math.random() - 0.5) * 0.01 * beat;
      }
      p.vx *= 0.999;
      p.vy *= 0.999;

      p.x += p.vx;
      p.y += p.vy;

      // 音波碰撞：仅当该 x 位置柱子有实际高度（spectrum>0）且下落时分裂
      const nx = Math.max(-1, Math.min(1, p.x));
      const spectrumIdx = Math.floor(((nx + 1) / 2) * spectrum.length);
      const spectrumValue = spectrum[spectrumIdx] ?? 0;
      const waveHeight = spectrumValue * this.waveHeightFactor + 0.03;
      const waveSurface = this.waveBaseY + waveHeight;

      if (p.cooldown <= 0 && spectrumValue > 0.01 && p.y < waveSurface && p.vy < 0) {
        this.splitParticle(i, p);
        continue;
      }

      // 边界：上/左/右 50% 消失；底部直接消失（保底 1 个）
      let hitBoundary = false;
      let bounceX = false;
      let bounceY = false;
      if (p.y > 0.98) { hitBoundary = true; bounceY = true; }
      if (p.x < -0.98) { hitBoundary = true; bounceX = true; }
      if (p.x > 0.98) { hitBoundary = true; bounceX = true; }

      if (p.y < -1.05) {
        // 底部：直接消失（保底 1 个粒子）
        if (this.active.length > 1) {
          this.deactivate(p);
        } else {
          p.vy = Math.abs(p.vy) * 0.5 + 0.005;
          p.y = -1.02;
        }
        continue;
      }

      if (hitBoundary) {
        const canDie = this.active.length > 1;
        if (canDie && Math.random() < 0.3) {
          this.deactivate(p);
          continue;
        }
        if (bounceX) p.vx *= -1;
        if (bounceY) p.vy *= -1;
        p.x = Math.max(-0.98, Math.min(0.98, p.x));
        p.y = Math.min(0.98, p.y);
      }

      // 颜色 + 位置更新
      p.hue = (p.hue + 0.001 + bass * 0.05) % 1.0;
      const c = new THREE.Color().setHSL(p.hue, 0.9, p.light);
      (p.sprite.material as THREE.SpriteMaterial).color.copy(c);
      p.sprite.position.set(p.x, p.y, 0.02);
    }
  }

  /** 分裂：30% 概率 1 生 3，其他 1 生 2 */
  private splitParticle(index: number, p: Particle) {
    const triple = Math.random() < 0.3;
    const needSlots = triple ? 2 : 1;

    // 空间不足时只反弹
    if (this.active.length + needSlots > this.maxParticles) {
      p.vy = Math.abs(p.vy) * 0.8 + 0.01;
      return;
    }

    // 向上弹射（+PI/2：sin 为正，粒子向上飞离音波，避免连锁分裂）
    const angle1 = Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const angle2 = Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const speed1 = 0.008 + Math.random() * 0.008;
    const speed2 = 0.008 + Math.random() * 0.008;
    const childSize = Math.max(p.size * 0.85, 0.6);

    // 原粒子向上弹开 + 冷却（防止立即再次碰撞）
    p.x += (Math.random() - 0.5) * 0.02;
    p.y += 0.05;
    p.vx = Math.cos(angle1) * speed1;
    p.vy = Math.sin(angle1) * speed1;
    p.size = childSize;
    p.hue = (p.hue + 0.05) % 1.0;
    p.light = 0.95;
    p.cooldown = 15;

    // 新粒子 1
    const child = this.activate({
      x: p.x + (Math.random() - 0.5) * 0.02,
      y: p.y + 0.05,
      vx: Math.cos(angle2) * speed2,
      vy: Math.sin(angle2) * speed2,
      size: childSize,
      hue: (p.hue - 0.1 + 1.0) % 1.0,
      light: 0.95,
    });
    child.cooldown = 15;

    // 30% 概率：额外第 3 个（更小、更慢、角度更散）
    if (triple) {
      const angle3 = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const child2 = this.activate({
        x: p.x + (Math.random() - 0.5) * 0.03,
        y: p.y + 0.05,
        vx: Math.cos(angle3) * 0.006,
        vy: Math.sin(angle3) * 0.006,
        size: Math.max(childSize * 0.8, 0.5),
        hue: (p.hue + 0.15) % 1.0,
        light: 0.9,
      });
      child2.cooldown = 15;
    }
  }
}