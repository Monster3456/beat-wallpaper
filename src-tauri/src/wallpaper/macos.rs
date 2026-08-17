use anyhow::Result;
use objc::runtime::Object;
use tauri::WebviewWindow;

// CGWindowLevelKey 枚举值
const KCG_DESKTOP_ICON_WINDOW_LEVEL_KEY: i32 = 5; // kCGDesktopIconWindowLevelKey

extern "C" {
    fn CGWindowLevelForKey(key: i32) -> i32;
}

/// 壁纸效果层：桌面图标层级 - 1（壁纸图片之上、桌面图标与所有普通窗口之下）
/// 之前误用 key=4（kCGNormalWindowLevelKey=0）导致与普通窗口同级、会盖住其他窗口
fn wallpaper_layer_level() -> i32 {
    unsafe { CGWindowLevelForKey(KCG_DESKTOP_ICON_WINDOW_LEVEL_KEY) - 1 }
}

/// 在 macOS 上将窗口设置为壁纸效果层（桌面图标之下、壁纸图片之上）
pub fn setup_wallpaper_window(window: &WebviewWindow) -> Result<()> {
    let ns_window = window.ns_window().map_err(|e| {
        anyhow::anyhow!("获取 NSWindow 失败: {}", e)
    })?;

    let wallpaper_level = wallpaper_layer_level();
    log::info!("壁纸效果层级值: {}", wallpaper_level);

    unsafe {
        use objc::{msg_send, sel, sel_impl};

        let ns_window = ns_window as *mut Object;

        // 设置窗口层级为壁纸效果层（低于所有普通窗口，永不遮挡应用）
        let _: () = msg_send![ns_window, setLevel: wallpaper_level as i64];

        // 让窗口忽略鼠标事件（穿透）
        let yes: i8 = 1;
        let _: () = msg_send![ns_window, setIgnoresMouseEvents: yes];

        // 设置窗口为不活跃时不隐藏
        let no: i8 = 0;
        let _: () = msg_send![ns_window, setHidesOnDeactivate: no];

        // 所有 Space/桌面都显示（CanJoinAllSpaces | Stationary | IgnoresCycle | FullScreenAuxiliary）
        let collection_behavior: u64 = 1 | 16 | 32 | 256;
        let _: () = msg_send![ns_window, setCollectionBehavior: collection_behavior];

        // 验证设置结果
        let level: i64 = msg_send![ns_window, level];
        let ignores: i8 = msg_send![ns_window, ignoresMouseEvents];
        log::info!(
            "macOS 壁纸窗口设置完成: level={}, ignoresMouseEvents={}",
            level,
            ignores
        );
    }

    Ok(())
}

/// 确保窗口尺寸与所在显示器匹配（位置在创建时已按显示器设置）
pub fn set_wallpaper_frame(window: &WebviewWindow) -> Result<()> {
    if let Some(monitor) = window.current_monitor()? {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        window.set_size(tauri::LogicalSize::new(
            size.width as f64 / scale,
            size.height as f64 / scale,
        ))?;
        log::info!("壁纸窗口尺寸: {}x{}", size.width, size.height);
    }
    Ok(())
}

/// 获取 macOS 系统当前壁纸的文件路径
pub fn get_system_wallpaper_path() -> Result<String> {
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};
        use objc::runtime::Object;

        let ns_workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
        let main_screen: *mut Object = msg_send![class!(NSScreen), mainScreen];
        let url: *mut Object = msg_send![ns_workspace, desktopImageURLForScreen: main_screen];

        if url.is_null() {
            anyhow::bail!("无法获取系统壁纸 URL");
        }

        let path: *mut Object = msg_send![url, path];
        if path.is_null() {
            anyhow::bail!("无法获取系统壁纸路径");
        }

        // NSString → Rust String
        let utf8: *const std::ffi::c_char = msg_send![path, UTF8String];
        if utf8.is_null() {
            anyhow::bail!("壁纸路径编码失败");
        }
        let bytes = std::ffi::CStr::from_ptr(utf8);
        let path_str = bytes.to_string_lossy().to_string();
        log::info!("系统壁纸: {}", path_str);
        Ok(path_str)
    }
}

/// macOS 全屏检测（由前端检测更可靠）
pub fn is_fullscreen_app_running() -> bool {
    false
}