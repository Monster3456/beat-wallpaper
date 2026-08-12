/// AI 深度估计模块
/// 使用亮度分析法生成深度图（浅色=远、深色=近，比径向渐变更有内容感）
/// 后续可替换为 ONNX MiDaS 模型推理（待集成）

use anyhow::Result;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

/// 深度图数据
#[derive(Clone)]
pub struct DepthMap {
    pub width: u32,
    pub height: u32,
    /// 每个像素的深度值 (0.0~1.0, 0=近, 1=远)
    pub data: Vec<f32>,
}

/// 深度估计器
pub struct DepthEstimator {
    cache: Arc<Mutex<HashMap<PathBuf, DepthMap>>>,
    model_loaded: bool,
}

impl DepthEstimator {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            model_loaded: false,
        }
    }

    pub fn init(&mut self) -> Result<()> {
        self.model_loaded = true;
        log::info!("深度估计器初始化完成（亮度分析模式）");
        Ok(())
    }

    /// 基于亮度生成深度图：较亮的区域视为较远，较暗的区域视为较近
    /// 这比径向渐变更有内容语义（天空=远，地面/物体=近）
    pub fn estimate(&self, image_path: &PathBuf) -> Result<DepthMap> {
        // 检查缓存
        {
            let cache = self.cache.lock();
            if let Some(depth) = cache.get(image_path) {
                return Ok(depth.clone());
            }
        }

        let img = image::open(image_path)?;
        let (width, height) = (img.width(), img.height());
        let gray = img.to_luma8();

        let data: Vec<f32> = gray
            .pixels()
            .map(|p| {
                // 亮度归一化：暗=0（近），亮=1（远）
                p.0[0] as f32 / 255.0
            })
            .collect();

        // 高斯平滑（消除噪声，让深度过渡自然）
        let radius = (width.min(height) / 120).max(4) as usize;
        let smoothed = self.gaussian_blur(&data, width as usize, height as usize, radius);

        let depth = DepthMap {
            width,
            height,
            data: smoothed,
        };

        // 写入缓存
        {
            let mut cache = self.cache.lock();
            cache.insert(image_path.clone(), depth.clone());
        }

        Ok(depth)
    }

    /// 简单高斯模糊（1D 分离实现）
    fn gaussian_blur(
        &self,
        data: &[f32],
        w: usize,
        h: usize,
        radius: usize,
    ) -> Vec<f32> {
        let size = w * h;
        let mut temp = vec![0.0f32; size];
        let mut result = vec![0.0f32; size];

        let kernel_size = radius * 2 + 1;
        let mut kernel = Vec::with_capacity(kernel_size);
        let sigma = radius as f32 / 2.0;
        let mut sum = 0.0f32;
        for i in 0..kernel_size {
            let x = i as i32 - radius as i32;
            let g = (-(x * x) as f32 / (2.0 * sigma * sigma)).exp();
            kernel.push(g);
            sum += g;
        }
        for k in &mut kernel {
            *k /= sum;
        }

        // 水平方向
        for y in 0..h {
            for x in 0..w {
                let mut val = 0.0;
                for (ki, &kv) in kernel.iter().enumerate() {
                    let sx = (x as i32 + ki as i32 - radius as i32).clamp(0, w as i32 - 1) as usize;
                    val += data[y * w + sx] * kv;
                }
                temp[y * w + x] = val;
            }
        }

        // 垂直方向
        for x in 0..w {
            for y in 0..h {
                let mut val = 0.0;
                for (ki, &kv) in kernel.iter().enumerate() {
                    let sy = (y as i32 + ki as i32 - radius as i32).clamp(0, h as i32 - 1) as usize;
                    val += temp[sy * w + x] * kv;
                }
                result[y * w + x] = val;
            }
        }

        result
    }

    pub fn clear_cache(&self) {
        self.cache.lock().clear();
    }
}