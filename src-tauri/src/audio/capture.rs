use crate::audio::AudioFrame;
use anyhow::Result;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use rustfft::FftPlanner;
use rustfft::num_complex::Complex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// 全局最新音频帧
pub static LATEST_AUDIO: Lazy<Mutex<AudioFrame>> =
    Lazy::new(|| Mutex::new(AudioFrame::default()));

static IS_RUNNING: AtomicBool = AtomicBool::new(false);

// ============ FFT 分析器（跨平台共用） ============

struct SpectrumAnalyzer {
    fft: Arc<dyn rustfft::Fft<f32>>,
    window: Vec<f32>,
    buffer: Vec<Complex<f32>>,
    sample_rate: u32,
}

impl SpectrumAnalyzer {
    fn new(fft_size: usize, sample_rate: u32) -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);
        // Hanning window
        let window: Vec<f32> = (0..fft_size)
            .map(|i| 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / fft_size as f32).cos()))
            .collect();
        Self {
            fft,
            window,
            buffer: vec![Complex::new(0.0, 0.0); fft_size],
            sample_rate,
        }
    }

    fn analyze(&mut self, samples: &[f32]) -> AudioFrame {
        let fft_size = self.buffer.len();
        for (i, sample) in samples.iter().enumerate().take(fft_size.min(samples.len())) {
            self.buffer[i] = Complex::new(sample * self.window[i], 0.0);
        }
        for i in samples.len()..fft_size {
            self.buffer[i] = Complex::new(0.0, 0.0);
        }

        self.fft.process(&mut self.buffer);

        let half = fft_size / 2;
        let mut spectrum = Vec::with_capacity(128);
        let bins_per_band = half / 128;

        let mut bass_energy = 0.0f32;
        let mut mid_energy = 0.0f32;
        let mut high_energy = 0.0f32;
        let mut total_energy = 0.0f32;

        let bass_cutoff = (250.0 * fft_size as f32 / self.sample_rate as f32) as usize;
        let mid_cutoff = (2000.0 * fft_size as f32 / self.sample_rate as f32) as usize;

        let mut band_energies = vec![0.0f32; 128];
        for i in 0..half {
            let magnitude = self.buffer[i].norm();
            total_energy += magnitude;

            if i < bass_cutoff {
                bass_energy += magnitude;
            } else if i < mid_cutoff {
                mid_energy += magnitude;
            } else {
                high_energy += magnitude;
            }

            let band = (i / bins_per_band).min(127);
            band_energies[band] += magnitude;
        }

        // RMS 音量（基于原始样本，不受 FFT 增益影响）
        let sum_sq: f32 = samples
            .iter()
            .take(fft_size.min(samples.len()))
            .map(|s| s * s)
            .sum();
        let rms = (sum_sq / fft_size as f32).sqrt();
        // 经验增益：RMS 0.25 ≈ 音量 1.0
        let volume = (rms * 4.0).min(1.0);

        // 频段相对占比（0~1）
        let eps = 1e-6;
        let total = total_energy.max(eps);
        let bass_ratio = (bass_energy / total).min(1.0);
        let mid_ratio = (mid_energy / total).min(1.0);
        let high_ratio = (high_energy / total).min(1.0);

        // 频段强度 = 占比 × 音量（静音时自然归零）
        let bass = (bass_ratio * volume * 1.8).min(1.0);
        let mid = (mid_ratio * volume * 1.6).min(1.0);
        let high = (high_ratio * volume * 1.4).min(1.0);

        // mel 频率映射 + 对数幅度压缩：
        // 1) mel 曲线平滑分布频率（不会出现前段柱子取自同一 FFT bin 导致完全一致）
        // 2) 对数压缩幅度，避免低频能量饱和到 1.0
        let max_band_energy = band_energies.iter().cloned().fold(0.0f32, f32::max).max(eps);
        let log_max = (1.0 + max_band_energy).ln();
        let sample_rate = self.sample_rate as f32;
        let fft_size_f = fft_size as f32;
        let max_mel = 2595.0 * (1.0 + sample_rate / 2.0 / 700.0).log10();
        for b in 0..128 {
            // mel 频率 → Hz → FFT bin
            let target_mel = max_mel * b as f32 / 127.0;
            let hz = 700.0 * (10f32.powf(target_mel / 2595.0) - 1.0);
            let bin = (hz / sample_rate * fft_size_f) as usize;
            let band = (bin / bins_per_band).min(127);
            let e = band_energies[band];
            // 对数压缩 + 音量调制
            let log_e = (1.0 + e).ln();
            spectrum.push(((log_e / log_max) * volume).min(1.0));
        }

        AudioFrame {
            volume,
            bass,
            mid,
            high,
            beat: false,
            beat_strength: 0.0,
            spectrum,
        }
    }
}

/// 节拍跟踪器
struct BeatTracker {
    history: Vec<f32>,
    history_size: usize,
    energy_sum: f32,
    index: usize,
}

impl BeatTracker {
    fn new(history_size: usize) -> Self {
        Self {
            history: vec![0.0; history_size],
            history_size,
            energy_sum: 0.0,
            index: 0,
        }
    }

    fn is_beat(&mut self, bass_energy: f32) -> (bool, f32) {
        let avg = self.energy_sum / self.history_size as f32;
        let variance: f32 = self
            .history
            .iter()
            .map(|&v| (v - avg).powi(2))
            .sum::<f32>()
            / self.history_size as f32;
        let threshold = avg + variance.sqrt() * 1.5;

        self.energy_sum -= self.history[self.index];
        self.history[self.index] = bass_energy;
        self.energy_sum += bass_energy;
        self.index = (self.index + 1) % self.history_size;

        let is_beat = bass_energy > threshold && bass_energy > 0.05;
        (is_beat, if is_beat { bass_energy } else { 0.0 })
    }
}

// ============ PCM 环形缓冲（Swift 回调写入） ============

const FFT_SIZE: usize = 2048;
const SAMPLE_RATE: u32 = 48000;

struct PcmBuffer {
    data: Vec<f32>,
    last_fft: Instant,
}

static PCM_BUFFER: Lazy<Mutex<PcmBuffer>> = Lazy::new(|| {
    Mutex::new(PcmBuffer {
        data: Vec::with_capacity(8192),
        last_fft: Instant::now() - Duration::from_secs(1),
    })
});

static ANALYZER: Lazy<Mutex<SpectrumAnalyzer>> =
    Lazy::new(|| Mutex::new(SpectrumAnalyzer::new(FFT_SIZE, SAMPLE_RATE)));
static BEAT_TRACKER: Lazy<Mutex<BeatTracker>> = Lazy::new(|| Mutex::new(BeatTracker::new(43)));

/// Swift 侧回调入口：接收单声道 Float32 PCM 数据
#[no_mangle]
pub extern "C" fn on_audio_pcm_data(ptr: *const f32, len: i32) {
    // 调试：首次调用写文件确认回调链路
    static CALLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if !CALLED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        let _ = std::fs::write("/tmp/bw_rust.log", format!("on_audio_pcm_data 首次调用 len={}\n", len));
    }

    if ptr.is_null() || len <= 0 {
        return;
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, len as usize) };

    let mut buf = PCM_BUFFER.lock();
    buf.data.extend_from_slice(slice);
    // 防止无限增长（保留最近 ~0.17s）
    if buf.data.len() > 8192 {
        let overflow = buf.data.len() - 8192;
        buf.data.drain(..overflow);
    }
}

/// FFT 分析线程：每 ~16ms 从缓冲取 2048 样本做频谱分析
fn fft_loop() {
    std::thread::Builder::new()
        .name("fft-analysis".into())
        .spawn(|| {
            let mut pending = vec![0.0f32; FFT_SIZE];
            let mut fft_counter: u32 = 0;
            loop {
                std::thread::sleep(Duration::from_millis(16));

                let mut buf = PCM_BUFFER.lock();
                if buf.data.len() >= FFT_SIZE && buf.last_fft.elapsed() > Duration::from_millis(12) {
                    pending.copy_from_slice(&buf.data[..FFT_SIZE]);
                    // 滑动窗口前进一半
                    buf.data.drain(..FFT_SIZE / 2);
                    buf.last_fft = Instant::now();
                    drop(buf);

                    let mut analyzer = ANALYZER.lock();
                    let mut frame = analyzer.analyze(&pending);

                    let (is_beat, strength) = BEAT_TRACKER.lock().is_beat(frame.bass);
                    frame.beat = is_beat;
                    frame.beat_strength = strength;

                    *LATEST_AUDIO.lock() = frame;

                    // 每 125 帧（~2 秒）打印一次音频电平（debug 级别）
                    fft_counter += 1;
                    if fft_counter % 125 == 0 {
                        let audio = LATEST_AUDIO.lock();
                        log::debug!(
                            "AUDIO: vol={:.3} bass={:.3} mid={:.3} high={:.3} beat={}",
                            audio.volume,
                            audio.bass,
                            audio.mid,
                            audio.high,
                            audio.beat
                        );
                    }
                }
            }
        })
        .expect("启动 FFT 分析线程失败");
}

// ============ 平台音频捕获 ============

/// 启动音频捕获（系统环回模式）
pub fn start_audio_capture() -> Result<()> {
    if IS_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    fft_loop();

    #[cfg(target_os = "macos")]
    {
        start_macos_capture()?;
    }

    #[cfg(target_os = "windows")]
    {
        start_windows_capture()?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn start_macos_capture() -> Result<()> {
    // 调用 Swift 侧 ScreenCaptureKit 捕获系统音频
    // 数据通过 on_audio_pcm_data 回调进入 PCM 缓冲
    extern "C" {
        fn start_system_audio_capture(callback: extern "C" fn(*const f32, i32));
    }

    unsafe {
        start_system_audio_capture(on_audio_pcm_data);
    }

    log::info!("macOS 系统音频捕获已启动 (ScreenCaptureKit)");
    Ok(())
}

#[cfg(target_os = "windows")]
fn start_windows_capture() -> Result<()> {
    // Windows 使用 cpal WASAPI loopback 捕获系统音频
    start_windows_cpal_loopback()
}

#[cfg(target_os = "windows")]
fn start_windows_cpal_loopback() -> Result<()> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{BufferSize, SampleRate, StreamConfig};

    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| anyhow::anyhow!("未找到音频输出设备"))?;

    let config = device
        .default_input_config()
        .map_err(|e| anyhow::anyhow!("获取音频配置失败: {}", e))?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    log::info!(
        "Windows 音频捕获启动: device={:?}, rate={}, channels={}",
        device.name().unwrap_or_default(),
        sample_rate,
        channels
    );

    let err_fn = |err| log::error!("音频流错误: {}", err);

    let stream_config = StreamConfig {
        channels: config.channels(),
        sample_rate: SampleRate(sample_rate),
        buffer_size: BufferSize::Fixed(FFT_SIZE as u32),
    };

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    push_pcm_mono(data, channels);
                },
                err_fn,
                None,
            )?
        }
        cpal::SampleFormat::I16 => {
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let float_data: Vec<f32> =
                        data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
                    push_pcm_mono(&float_data, channels);
                },
                err_fn,
                None,
            )?
        }
        cpal::SampleFormat::U16 => {
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    let float_data: Vec<f32> = data
                        .iter()
                        .map(|&s| (s as f32 - u16::MAX as f32 / 2.0) / u16::MAX as f32 * 2.0)
                        .collect();
                    push_pcm_mono(&float_data, channels);
                },
                err_fn,
                None,
            )?
        }
        _ => anyhow::bail!("不支持的音频格式"),
    };

    stream.play()?;
    std::mem::forget(stream);
    Ok(())
}

#[cfg(target_os = "windows")]
fn push_pcm_mono(data: &[f32], channels: usize) {
    let mono: Vec<f32> = if channels > 1 {
        data.chunks(channels)
            .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
            .collect()
    } else {
        data.to_vec()
    };

    let mut buf = PCM_BUFFER.lock();
    buf.data.extend_from_slice(&mono);
    if buf.data.len() > 8192 {
        let overflow = buf.data.len() - 8192;
        buf.data.drain(..overflow);
    }
}

/// 获取当前音频帧（由 Tauri 命令调用）
pub fn get_current_audio_frame() -> AudioFrame {
    LATEST_AUDIO.lock().clone()
}