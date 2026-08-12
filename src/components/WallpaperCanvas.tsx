import { useEffect, useRef, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { EffectComposer } from '../effects/EffectComposer';
import type { AudioData, Settings, Theme } from '../types';
import { getBuiltinWallpapers } from '../audioBridge';
import * as THREE from 'three';

interface Props {
  audioData: AudioData | null;
  currentTheme: Theme | null;
  wallpaperPath: string | null;
  isVideo: boolean;
  performanceMode: Settings['performanceMode'];
}

export function WallpaperCanvas({
  audioData,
  currentTheme,
  wallpaperPath,
  isVideo,
  performanceMode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number>(0);

  // 初始化
  useEffect(() => {
    if (!containerRef.current) return;
    if (!composerRef.current) {
      composerRef.current = new EffectComposer(containerRef.current);
    }
    return () => {
      composerRef.current?.dispose();
      composerRef.current = null;
    };
  }, []);

  // 加载壁纸
  useEffect(() => {
    if (!composerRef.current) return;

    if (isVideo && wallpaperPath) {
      // 视频壁纸
      loadVideoWallpaper(convertFileSrc(wallpaperPath));
    } else if (wallpaperPath) {
      // 图片壁纸
      const assetUrl = convertFileSrc(wallpaperPath);
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const tex = loader.load(assetUrl, () => {
        composerRef.current?.setTexture(tex);
      });
      // sRGB 色彩空间校正，否则颜色发灰发淡
      tex.colorSpace = THREE.SRGBColorSpace;
    } else {
      // 加载内置壁纸
      getBuiltinWallpapers().then((paths) => {
        if (paths.length > 0) {
          const tex = new THREE.TextureLoader().load(paths[0], () => {
            composerRef.current?.setTexture(tex);
          });
          tex.colorSpace = THREE.SRGBColorSpace;
        }
      });
    }
  }, [wallpaperPath, isVideo]);

  // 应用主题
  useEffect(() => {
    if (currentTheme && composerRef.current) {
      composerRef.current.applyTheme(currentTheme);
    }
  }, [currentTheme]);

  // 性能模式（像素比上限 + 粒子上限）
  useEffect(() => {
    composerRef.current?.setPerformanceMode(performanceMode);
  }, [performanceMode]);

  // 更新效果（每秒 60 帧）
  const updateLoop = useCallback(() => {
    if (audioData && currentTheme && composerRef.current) {
      composerRef.current.updateEffects(audioData, currentTheme);
    }
    animFrameRef.current = requestAnimationFrame(updateLoop);
  }, [audioData, currentTheme]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [updateLoop]);

  // 视频壁纸加载
  const loadVideoWallpaper = (path: string) => {
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.style.display = 'none';
      videoRef.current = video;
      document.body.appendChild(video);
    }

    const video = videoRef.current;
    video.src = path + '?' + Date.now();
    video.load();
    video.play().catch(() => {});

    // 监听视频可以播放后创建纹理
    video.addEventListener(
      'loadeddata',
      () => {
        const tex = new THREE.VideoTexture(video);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        composerRef.current?.setTexture(tex);
      },
      { once: true },
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        overflow: 'hidden',
      }}
    />
  );
}