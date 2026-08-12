import * as THREE from 'three';
import type { AudioData, ThemeParams, ScreenInfo } from '../types';

export type ParticleShape = 'dot' | 'snow' | 'heart' | 'flame' | 'bubble';

/**
 * 粒子系统（Sprite 实现，保证可见）
 * 所有形态（圆点/雪花/爱心/火焰/气泡）统一游戏规则：
 * 初始 3 个 → 碰音波条分裂（70% 1生2 / 30% 1生3）→ 边界 30% 消失 → 保底 1 个
 * 形态只决定外观：元素为直线运动，碰撞才变向
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
  /** 预分配颜色对象（避免每帧 new Color 造成 GC 压力） */
  color: THREE.Color;
}

export class Particles {
  private scene: THREE.Scene;
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private targetCount: number = 0;
  private time: number = 0;
  private maxParticles: number = 350;
  private dotTexture: THREE.Texture;
  private snowTexture: THREE.Texture;
  private heartTexture: THREE.Texture;
  private flameTexture: THREE.Texture;
  private bubbleTexture: THREE.Texture;
  private shape: ParticleShape = 'dot';
  private bubbleSpawnTimer: number = 0;

  // 音波条参数（与 WaveformBars 保持一致，仅 dot 游戏模式用）
  private waveBaseY: number = -0.92;
  private waveHeightFactor: number = 0.55;
  /** 主题主色色相（null = 未设置，随机色） */
  private accentHue: number | null = null;
  /** 上升浮力（烈焰火星/深海气泡）：0-1 */
  private rise: number = 0;

  setMaxParticles(n: number) {
    this.maxParticles = n;
  }

  setAccentHue(hue: number) {
    this.accentHue = hue;
  }

  setRise(r: number) {
    this.rise = r;
  }

  /** 切换粒子形态：更新所有池内粒子的贴图 */
  setShape(shape: ParticleShape) {
    if (shape === this.shape) return;
    this.shape = shape;
    const tex =
      shape === 'snow'
        ? this.snowTexture
        : shape === 'heart'
          ? this.heartTexture
          : shape === 'flame'
            ? this.flameTexture
            : shape === 'bubble'
              ? this.bubbleTexture
              : this.dotTexture;
    this.pool.forEach((p) => {
      const m = p.sprite.material as THREE.SpriteMaterial;
      m.map = tex;
      m.rotation = 0;
      m.needsUpdate = true;
    });
  }

  /** 生成锚定主题色的色相（±0.06 抖动，保持层次又不脱离主题） */
  private hueNearAccent(): number {
    if (this.accentHue === null) return Math.random();
    return (this.accentHue + (Math.random() - 0.5) * 0.12 + 1.0) % 1.0;
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.dotTexture = this.buildDotTexture();
    this.snowTexture = this.buildSnowTexture();
    this.heartTexture = this.buildHeartTexture();
    this.flameTexture = this.buildFlameTexture();
    this.bubbleTexture = this.buildBubbleTexture();

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
        color: new THREE.Color(),
      });
    }
  }

  /** 实心圆点纹理（微粒质感，非发光球） */
  private buildDotTexture(): THREE.Texture {
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
    return new THREE.CanvasTexture(canvas);
  }

  /** 高清六角雪花（128px，六臂 + 枝杈 + 中心点 + 光晕） */
  private buildSnowTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(64, 64);
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      // 主臂
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -50);
      ctx.stroke();
      // 枝杈
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(-9, -42);
      ctx.moveTo(0, -32);
      ctx.lineTo(9, -42);
      ctx.moveTo(0, -46);
      ctx.lineTo(-6, -52);
      ctx.moveTo(0, -46);
      ctx.lineTo(6, -52);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }

  /** 高清红色爱心（128px，直接烤红 + 高光） */
  private buildHeartTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(64, 66);
    ctx.shadowColor = 'rgba(255,45,85,0.9)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.bezierCurveTo(-48, -16, -32, -52, 0, -20);
    ctx.bezierCurveTo(32, -52, 48, -16, 0, 24);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -48, 0, 24);
    grad.addColorStop(0, '#ff5a76');
    grad.addColorStop(0.55, '#ff2d55');
    grad.addColorStop(1, '#d61f45');
    ctx.fillStyle = grad;
    ctx.fill();
    // 左上高光
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.bezierCurveTo(-30, -14, -22, -32, -4, -16);
    ctx.bezierCurveTo(-12, -10, -10, -2, -6, 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }

  /** 火焰纹理（128px，泪滴形外焰 + 亮白内芯） */
  private buildFlameTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(64, 66);
    ctx.shadowColor = 'rgba(255,120,20,0.9)';
    ctx.shadowBlur = 12;
    // 外焰
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.bezierCurveTo(-26, 8, -18, -22, 0, -32);
    ctx.bezierCurveTo(18, -22, 26, 8, 0, 28);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -32, 0, 28);
    grad.addColorStop(0, '#fff3a0');
    grad.addColorStop(0.45, '#ffb347');
    grad.addColorStop(1, '#ff5e1a');
    ctx.fillStyle = grad;
    ctx.fill();
    // 内芯
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.bezierCurveTo(-10, 5, -7, -12, 0, -18);
    ctx.bezierCurveTo(7, -12, 10, 5, 0, 16);
    ctx.closePath();
    ctx.fillStyle = '#fffde8';
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }

  /** 气泡纹理（圆圈轮廓 + 高光弧，深海用） */
  private buildBubbleTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(64, 64);
    ctx.shadowColor = 'rgba(190,225,255,0.9)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(220,240,255,0.95)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.stroke();
    // 左上高光弧
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 40, Math.PI * 1.15, Math.PI * 1.55);
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
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
    // 初始只生成 3 个粒子，随音乐播放通过分裂逐渐增加（所有形态统一）
    if (this.active.length === 0) {
      for (let i = 0; i < Math.min(3, count); i++) {
        this.activate(this.spawnData());
      }
    }
  }

  /** 随机方向的匀速初速度（元素用：直线运动直到碰撞） */
  private linearVelocity(): { vx: number; vy: number } {
    const angle = Math.random() * Math.PI * 2;
    const spd = 0.004 + Math.random() * 0.004;
    return { vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd };
  }

  private spawnData(overrides: Partial<Omit<Particle, 'sprite' | 'alive'>> = {}) {
    if (this.shape === 'snow') {
      return {
        x: (Math.random() - 0.5) * 1.9,
        y: 0.7 + Math.random() * 0.3,
        ...this.linearVelocity(),
        size: 2.5 + Math.random() * 3.0, // 雪花要能看出形状：大中小混搭
        hue: this.hueNearAccent(),
        light: 0.95,
        ...overrides,
      };
    }
    if (this.shape === 'heart') {
      return {
        x: (Math.random() - 0.5) * 1.7,
        y: -1.0 + Math.random() * 0.4,
        ...this.linearVelocity(),
        size: 3.0 + Math.random() * 3.0, // 爱心要看清是红色爱心
        hue: this.hueNearAccent(),
        light: 0.9,
        ...overrides,
      };
    }
    if (this.shape === 'flame') {
      return {
        x: (Math.random() - 0.5) * 1.3,
        y: -0.9 + Math.random() * 0.5,
        ...this.linearVelocity(),
        size: 4.0 + Math.random() * 4.0, // 火焰要大才像火
        hue: this.hueNearAccent(),
        light: 0.75 + Math.random() * 0.2,
        ...overrides,
      };
    }
    if (this.shape === 'bubble') {
      return {
        x: (Math.random() - 0.5) * 1.7,
        y: -0.9 + Math.random() * 0.6,
        ...this.linearVelocity(),
        size: 1.8 + Math.random() * 2.4, // 气泡：圆圈轮廓 + 高光
        hue: this.hueNearAccent(),
        light: 0.9,
        ...overrides,
      };
    }
    return {
      x: (Math.random() - 0.5) * 1.4,
      y: Math.random() * 1.2 - 0.1,
      vx: (Math.random() - 0.5) * 0.02,
      vy: (Math.random() - 0.5) * 0.02,
      size: Math.random() * 1.2 + 0.8, // 圆点粒子保持原尺寸
      hue: this.hueNearAccent(),
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
    // 元素（雪花/爱心/火焰）渲染倍率放大 2.5 倍，保证形状可辨；圆点保持原样
    const s = data.size * (this.shape === 'dot' ? 0.004 : 0.01);
    p.sprite.scale.set(s, s, 1);
    this.active.push(p);
    return p;
  }

  private deactivate(p: Particle) {
    p.alive = false;
    p.sprite.visible = false;
    const idx = this.active.indexOf(p);
    if (idx >= 0) this.active.splice(idx, 1);
  }

  /** 颜色 + 位置更新：元素贴图自带颜色（红心/雪花/火焰），圆点粒子锚定主题色 */
  private applyColor(p: Particle, bass: number) {
    const mat = p.sprite.material as THREE.SpriteMaterial;
    if (this.shape !== 'dot') {
      mat.color.set(0xffffff);
    } else if (this.accentHue !== null) {
      let d = this.accentHue - p.hue;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      p.hue = (p.hue + d * 0.015 + bass * 0.02 + 1.0) % 1.0;
      p.color.setHSL(p.hue, 0.9, p.light);
      mat.color.copy(p.color);
    } else {
      p.hue = (p.hue + 0.001 + bass * 0.05) % 1.0;
      p.color.setHSL(p.hue, 0.9, p.light);
      mat.color.copy(p.color);
    }
    p.sprite.position.set(p.x, p.y, 0.02);
  }

  update(audio: AudioData, params: ThemeParams, _screen: ScreenInfo) {
    if (this.targetCount === 0) return;
    this.time += 0.016;

    const bass = audio.bass;
    const vol = audio.volume;
    const beat = audio.beat ? audio.beat_strength : 0;
    const spectrum = audio.spectrum ?? [];

    // 保底保证：无论发生什么，画面至少保留 1 个元素
    if (this.active.length === 0) {
      this.activate(this.spawnData());
    }

    // 气泡模式（深海）：随音乐冒出——低频/音量越强越频繁，beat 立即冒，静音不冒
    if (this.shape === 'bubble') {
      const drive = Math.min(audio.bass * 0.7 + audio.volume * 0.3, 1.0);
      const burst = audio.beat ? 1 : 0;
      this.bubbleSpawnTimer -= 1;
      if (drive < 0.06) {
        // 静音：不冒泡（等音乐回来）
        this.bubbleSpawnTimer = 10;
      } else if (this.active.length < 12 && (this.bubbleSpawnTimer <= 0 || burst > 0)) {
        this.activate({
          x: (Math.random() - 0.5) * 1.7,
          y: -1.05,
          vx: (Math.random() - 0.5) * 0.0012,
          vy: 0.0015 + Math.random() * 0.002 + drive * 0.0015, // 慢速上浮，音乐强略快
          size: 1.2 + Math.random() * 1.6 + drive * 1.4, // 音乐强时更大
          hue: this.hueNearAccent(),
          light: 0.9,
        });
        // 间隔随音乐强度缩短：静音边缘 ~1.6s，强音乐 ~0.45s
        this.bubbleSpawnTimer = Math.round(95 - drive * 68);
      }
      for (let i = this.active.length - 1; i >= 0; i--) {
        const p = this.active[i];
        p.vy += 0.00035; // 极缓上浮
        p.vx += Math.sin(this.time * 1.2 + p.y * 22) * 0.00015; // 轻微摇摆
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > 1.08) this.deactivate(p); // 顶部破灭
        this.applyColor(p, bass);
      }
      return;
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];

      if (p.cooldown > 0) p.cooldown--;

      if (this.shape === 'dot') {
        // 圆点游戏粒子：随机扰动 + 上升浮力 + 节拍冲击
        p.vx += (Math.random() - 0.5) * 0.002 * (1 + bass * 2);
        p.vy += (Math.random() - 0.5) * 0.002 * (1 + vol);
        if (this.rise > 0) {
          p.vy += this.rise * 0.002;
          p.vx += Math.sin(this.time * 2.0 + p.y * 30.0) * 0.0006 * this.rise;
        }
        if (audio.beat) {
          p.vx += (Math.random() - 0.5) * 0.01 * beat;
          p.vy += (Math.random() - 0.5) * 0.01 * beat;
        }
        p.vx *= 0.999;
        p.vy *= 0.999;
      } else {
        // 元素：匀速直线运动——速度保持不变，只有碰撞（音波分裂/边界反弹）才改变方向
      }

      p.x += p.vx;
      p.y += p.vy;

      // ---- 形态专属视觉（不影响运动规则） ----
      if (this.shape === 'snow') {
        (p.sprite.material as THREE.SpriteMaterial).rotation =
          Math.sin(this.time * 1.2 + p.x * 30) * 0.6;
      } else if (this.shape === 'flame') {
        // 火焰摇曳：大小脉动
        const fl = 1 + 0.18 * Math.sin(this.time * 12 + p.x * 40);
        p.sprite.scale.set(p.size * 0.01 * fl, p.size * 0.01 * fl, 1);
      }

      // ---- 统一游戏规则：音波碰撞分裂 ----
      const nx = Math.max(-1, Math.min(1, p.x));
      const spectrumIdx = Math.floor(((nx + 1) / 2) * spectrum.length);
      const spectrumValue = spectrum[spectrumIdx] ?? 0;
      const waveHeight = spectrumValue * this.waveHeightFactor + 0.03;
      const waveSurface = this.waveBaseY + waveHeight;

      if (p.cooldown <= 0 && spectrumValue > 0.01 && p.y < waveSurface && p.vy < 0) {
        this.splitParticle(i, p);
        continue;
      }

      // 边界：上/左/右 30% 消失；底部直接消失（保底 1 个）
      let hitBoundary = false;
      let bounceX = false;
      let bounceY = false;
      if (p.y > 0.98) {
        hitBoundary = true;
        bounceY = true;
      }
      if (p.x < -0.98) {
        hitBoundary = true;
        bounceX = true;
      }
      if (p.x > 0.98) {
        hitBoundary = true;
        bounceX = true;
      }

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

      this.applyColor(p, bass);
    }
  }

  /** 分裂：30% 概率 1 生 3，其他 1 生 2（仅游戏形态） */
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
    // 元素分裂不缩到看不清：下限 1.8（×0.01 倍率 ≈ 13px）；圆点保持 0.6
    const childSize = Math.max(p.size * 0.85, this.shape === 'dot' ? 0.6 : 1.8);

    // 原粒子向上弹开 + 冷却（防止立即再次碰撞）
    p.x += (Math.random() - 0.5) * 0.02;
    p.y += 0.05;
    p.vx = Math.cos(angle1) * speed1;
    p.vy = Math.sin(angle1) * speed1;
    p.size = childSize;
    p.hue = this.hueNearAccent();
    p.light = 0.95;
    p.cooldown = 12;

    // 新粒子 1
    const child = this.activate({
      x: p.x + (Math.random() - 0.5) * 0.02,
      y: p.y + 0.05,
      vx: Math.cos(angle2) * speed2,
      vy: Math.sin(angle2) * speed2,
      size: childSize,
      hue: this.hueNearAccent(),
      light: 0.95,
    });
    child.cooldown = 12;

    // 30% 概率：额外第 3 个（更小、更慢、角度更散）
    if (triple) {
      const angle3 = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const child2 = this.activate({
        x: p.x + (Math.random() - 0.5) * 0.03,
        y: p.y + 0.05,
        vx: Math.cos(angle3) * 0.006,
        vy: Math.sin(angle3) * 0.006,
        size: Math.max(childSize * 0.8, 0.5),
        hue: this.hueNearAccent(),
        light: 0.9,
      });
      child2.cooldown = 12;
    }
  }
}
