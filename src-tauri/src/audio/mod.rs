pub mod capture;

use serde::Serialize;

/// 音频分析结果，通过 IPC 发送到前端
#[derive(Clone, Debug, Serialize)]
pub struct AudioFrame {
    /// 当前音量 (0.0 ~ 1.0)
    pub volume: f32,
    /// 低频能量 (低音/鼓点)
    pub bass: f32,
    /// 中频能量 (人声/旋律)
    pub mid: f32,
    /// 高频能量 (镲/高音)
    pub high: f32,
    /// 是否检测到节拍/鼓点
    pub beat: bool,
    /// 节拍强度 (0.0 ~ 1.0)
    pub beat_strength: f32,
    /// 完整频谱数据 (128 个频段, 用于前端波形可视化)
    pub spectrum: Vec<f32>,
}

impl Default for AudioFrame {
    fn default() -> Self {
        Self {
            volume: 0.0,
            bass: 0.0,
            mid: 0.0,
            high: 0.0,
            beat: false,
            beat_strength: 0.0,
            spectrum: vec![0.0; 128],
        }
    }
}

/// 音频帧 + 时间戳，用于平滑过渡
#[derive(Clone, Debug)]
pub struct TimedAudioFrame {
    pub frame: AudioFrame,
    pub timestamp: std::time::Instant,
}