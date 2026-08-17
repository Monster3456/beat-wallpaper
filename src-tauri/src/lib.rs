use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

mod audio;
mod tray;
mod wallpaper;

/// 应用状态
pub struct AppState {
    pub current_wallpaper: Mutex<Option<PathBuf>>,
    pub is_video: Mutex<bool>,
    pub audio_enabled: Mutex<bool>,
}

#[derive(Clone, Serialize)]
struct AudioData {
    volume: f32,
    bass: f32,
    mid: f32,
    high: f32,
    beat: bool,
    beat_strength: f32,
    spectrum: Vec<f32>,
}

/// 查询当前音频数据（前端轮询调用）
#[tauri::command]
fn get_audio_data() -> AudioData {
    let frame = audio::capture::get_current_audio_frame();
    AudioData {
        volume: frame.volume,
        bass: frame.bass,
        mid: frame.mid,
        high: frame.high,
        beat: frame.beat,
        beat_strength: frame.beat_strength,
        spectrum: frame.spectrum,
    }
}

/// 开始音频捕获
#[tauri::command]
fn start_audio() -> Result<(), String> {
    audio::capture::start_audio_capture().map_err(|e| e.to_string())
}

/// 从文件选择器选择壁纸
#[tauri::command]
async fn select_wallpaper(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let file = app
        .dialog()
        .file()
        .add_filter("壁纸文件", &["png", "jpg", "jpeg", "webp", "bmp", "mp4", "mov", "webm"])
        .blocking_pick_file();

    match file {
        Some(path) => {
            let path_str = path.to_string();
            let path_buf = PathBuf::from(&path_str);

            // 更新状态
            let state = app.state::<AppState>();
            let is_video = matches!(
                path_buf.extension().and_then(|s| s.to_str()),
                Some("mp4") | Some("mov") | Some("webm")
            );
            *state.is_video.lock().unwrap() = is_video;
            *state.current_wallpaper.lock().unwrap() = Some(path_buf.clone());

            // 发送事件到前端
            let _ = app.emit("wallpaper-changed", serde_json::json!({
                "path": path_str,
                "isVideo": is_video
            }));

            Ok(path_str)
        }
        None => Err("未选择文件".to_string()),
    }
}

/// 前端就绪标志（activate_wallpaper_mode 调用后置 true）
static FRONTEND_READY: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// 前端渲染就绪后调用：将所有壁纸窗口切换到桌面壁纸层
#[tauri::command]
fn activate_wallpaper_mode(app: tauri::AppHandle) -> Result<(), String> {
    FRONTEND_READY.store(true, std::sync::atomic::Ordering::SeqCst);
    let mut activated = 0;
    for (label, window) in app.webview_windows() {
        if label == "wallpaper" || label.starts_with("wallpaper_") {
            wallpaper::setup_wallpaper_window(&window).map_err(|e| e.to_string())?;
            activated += 1;
        }
    }
    log::info!("前端就绪，{} 个壁纸窗口已切换到壁纸层", activated);
    Ok(())
}

/// 打开设置窗口（不存在则创建，关闭即销毁——不常驻 WebView，省内存）
pub fn open_settings_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    let result = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("BeatWallpaper 设置")
        .inner_size(640.0, 720.0)
        .resizable(true)
        .shadow(true)
        .skip_taskbar(false)
        .build();
    match result {
        Ok(win) => {
            let _ = win.show();
            let _ = win.set_focus();
            log::info!("设置窗口已创建（懒加载）");
        }
        Err(e) => log::error!("创建设置窗口失败: {}", e),
    }
}

/// 打开设置窗口（托盘点击调用）
#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    open_settings_window(&app);
    Ok(())
}

/// 前端诊断日志（通过 IPC 转发到 Rust 日志）
#[tauri::command]
fn log_frontend(msg: String) {
    log::info!("{}", msg);
}

/// 获取当前壁纸路径（前端启动时调用，弥补事件早于前端加载的问题）
/// macOS 返回 desktopEmbed=true：应用只叠加效果在系统桌面之上，不渲染壁纸图像
#[tauri::command]
fn get_current_wallpaper(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<AppState>();
    let path = state.current_wallpaper.lock().unwrap().clone();
    let is_video = *state.is_video.lock().unwrap();

    Ok(serde_json::json!({
        "path": path.map(|p| p.to_string_lossy().to_string()),
        "isVideo": is_video,
        "desktopEmbed": cfg!(target_os = "macos"),
    }))
}

/// 保存当前设置（保存后由 Rust 广播给所有窗口，保证所有屏幕同步）
#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: String) -> Result<(), String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let settings_path = config_dir.join("settings.json");
    std::fs::write(&settings_path, &settings).map_err(|e| e.to_string())?;

    // Rust 端广播给所有窗口（比前端 emit 可靠，所有屏幕同步切换）
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&settings) {
        // 音频灵敏度写入分析器（滑杆有实际体感）
        if let Some(sens) = parsed.get("audioSensitivity").and_then(|v| v.as_f64()) {
            audio::capture::set_audio_sensitivity(sens as f32);
        }

        let _ = app.emit("settings-updated", &parsed);

        // 直接向每个壁纸窗口注入 JS 应用主题（绕过 WebView 事件节流，保证副屏同步）
        if let Some(theme) = parsed.get("theme").and_then(|v| v.as_str()) {
            let js = format!(
                "window.__applyTheme && window.__applyTheme({});",
                serde_json::to_string(theme).unwrap_or_else(|_| "\"heartbeat\"".into())
            );
            for (label, window) in app.webview_windows() {
                if label == "wallpaper" || label.starts_with("wallpaper_") {
                    let _ = window.eval(&js);
                }
            }
        }
        log::info!("设置已保存并广播给所有窗口（emit + eval）");
    }
    Ok(())
}

/// 加载设置
#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let settings_path = config_dir.join("settings.json");

    if settings_path.exists() {
        std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

/// 获取内置壁纸列表
#[tauri::command]
fn get_builtin_wallpapers(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;
    let wallpapers_dir = resource_dir.join("wallpapers");

    if !wallpapers_dir.exists() {
        return Ok(vec![]);
    }

    let mut wallpapers = vec![];
    if let Ok(entries) = std::fs::read_dir(&wallpapers_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                wallpapers.push(format!("wallpapers/{}", name));
            }
        }
    }
    Ok(wallpapers)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            current_wallpaper: Mutex::new(None),
            is_video: Mutex::new(false),
            audio_enabled: Mutex::new(true),
        })
        .setup(|app| {
            // 初始化日志
            env_logger::init();

            // 创建系统托盘
            tray::create_tray(app.handle())?;

            // 启动音频捕获
            let _ = audio::capture::start_audio_capture();

            // 读取系统当前壁纸并跟随变化
            #[cfg(target_os = "macos")]
            {
                if let Ok(path) = wallpaper::get_system_wallpaper_path() {
                    let state = app.state::<AppState>();
                    *state.current_wallpaper.lock().unwrap() = Some(PathBuf::from(&path));
                    *state.is_video.lock().unwrap() = false;

                    let _ = app.emit("wallpaper-changed", serde_json::json!({
                        "path": path,
                        "isVideo": false
                    }));
                    log::info!("跟随系统壁纸: {}", path);
                } else {
                    log::warn!("setup 阶段获取系统壁纸失败，等待轮询线程补获");
                }

                // 定时检查系统壁纸是否更换（每 5 秒）
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut last = String::new();
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(5));
                        if let Ok(path) = wallpaper::get_system_wallpaper_path() {
                            if path != last {
                                last = path;
                                let _ = handle.emit("wallpaper-changed", serde_json::json!({
                                    "path": last,
                                    "isVideo": false
                                }));
                                log::info!("系统壁纸已更换: {}", last);
                            }
                        }
                    }
                });
            }

            // 壁纸窗口：为每个显示器创建一个（多显示器支持）
            // 延迟显示确保 dev server 就绪，前端就绪后切到壁纸层
            let is_debug = std::env::var("BEAT_WALLPAPER_DEBUG").is_ok();
            {
                use tauri::{WebviewUrl, WebviewWindowBuilder};

                let monitors = app.available_monitors().map_err(|e| e.to_string())?;
                log::info!("检测到 {} 个显示器", monitors.len());

                let mut wallpaper_windows: Vec<tauri::WebviewWindow> = vec![];
                let mut wallpaper_frames: Vec<(f64, f64, f64, f64)> = vec![];
                for (i, monitor) in monitors.iter().enumerate() {
                    let label = if i == 0 {
                        "wallpaper".to_string()
                    } else {
                        format!("wallpaper_{}", i)
                    };
                    let pos = monitor.position();
                    let size = monitor.size();
                    let scale = monitor.scale_factor();

                    let win = WebviewWindowBuilder::new(
                        app,
                        &label,
                        WebviewUrl::App("index.html".into()),
                    )
                    .title("BeatWallpaper")
                    .decorations(false)
                    // macOS：透明窗口叠加在系统桌面之上（图标/小组件/Dock 不被遮挡）
                    .transparent(cfg!(target_os = "macos"))
                    .visible(false)
                    .resizable(false)
                    .focusable(false)
                    .shadow(false)
                    .skip_taskbar(true)
                    .always_on_bottom(true)
                    .build()?;

                    // 立即应用壁纸效果层（不依赖前端回调，防止窗口以普通层级显示遮挡应用）
                    wallpaper::setup_wallpaper_window(&win)?;

                    // 物理坐标定位（LogicalPosition 转换在主屏失效导致窗口不可见）
                    let lw = size.width as f64 / scale;
                    let lh = size.height as f64 / scale;

                    win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y))?;
                    win.set_size(tauri::LogicalSize::new(lw, lh))?;

                    log::info!(
                        "壁纸窗口 {}: physical pos=({},{}) size={}x{} scale={}",
                        label,
                        pos.x,
                        pos.y,
                        lw,
                        lh,
                        scale
                    );
                    wallpaper_windows.push(win);
                    wallpaper_frames.push((pos.x as f64, pos.y as f64, lw, lh));
                }

                // 延迟显示 + 前端未就绪时重载
                let dev_url = app
                    .config()
                    .build
                    .dev_url
                    .clone()
                    .unwrap_or_else(|| "http://localhost:1420".parse().unwrap());
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    for (w, f) in wallpaper_windows.iter().zip(wallpaper_frames.iter()) {
                        if let Err(e) = w.show() {
                            log::error!("显示壁纸窗口失败: {}", e);
                        }
                        // 重新应用保存的 frame（show 后可能被系统重置）
                        let _ = w.set_position(tauri::PhysicalPosition::new(f.0 as i32, f.1 as i32));
                        let _ = w.set_size(tauri::LogicalSize::new(f.2, f.3));
                    }
                    log::info!("壁纸窗口已显示（等待前端就绪）");

                    std::thread::sleep(std::time::Duration::from_secs(8));
                    if !FRONTEND_READY.load(std::sync::atomic::Ordering::SeqCst) {
                        log::warn!("前端未就绪，重新加载 devUrl: {}", dev_url);
                        for w in &wallpaper_windows {
                            let _ = w.navigate(dev_url.clone());
                        }
                    }
                });
            }

            // 首次启动：打开设置窗口展示欢迎引导；非首次启动：静默运行
            let config_dir = app.path().app_config_dir().ok();
            let is_first_launch = config_dir
                .map(|d| !d.join("settings.json").exists())
                .unwrap_or(true);
            if is_first_launch {
                open_settings_window(app.handle());
                log::info!("首次启动，打开设置窗口");
            }

            log::info!("BeatWallpaper 启动完成");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_audio_data,
            start_audio,
            select_wallpaper,
            get_current_wallpaper,
            activate_wallpaper_mode,
            open_settings,
            log_frontend,
            save_settings,
            load_settings,
            get_builtin_wallpapers,
        ])
        .build(tauri::generate_context!())
        .expect("构建 BeatWallpaper 失败")
        .run(|app_handle, event| {
            // macOS: 点击 Dock 图标时打开设置窗口（懒创建）
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    log::info!("Dock 图标点击 (Reopen)");
                    open_settings_window(app_handle);
                }
                tauri::RunEvent::ExitRequested { .. } => {}
                _ => {}
            }
        });
}