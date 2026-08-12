use anyhow::Result;
use tauri::WebviewWindow;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

/// 在 Windows 上将窗口嵌入桌面壁纸层
pub fn setup_wallpaper_window(_window: &WebviewWindow) -> Result<()> {
    log::info!("Windows wallpaper window setup - 待完善");
    Ok(())
}

static FULLSCREEN_CHECK: std::sync::OnceLock<Arc<AtomicBool>> = std::sync::OnceLock::new();

/// 检测是否全屏应用运行中
pub fn is_fullscreen_app_running() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        let hwnd = windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow();
        if hwnd.0 == 0 {
            return false;
        }

        let mut rect = std::mem::zeroed();
        windows::Win32::UI::WindowsAndMessaging::GetWindowRect(hwnd, &mut rect);

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        let screen_w = windows::Win32::Graphics::Gdi::GetSystemMetrics(
            windows::Win32::Graphics::Gdi::SM_CXSCREEN,
        );
        let screen_h = windows::Win32::Graphics::Gdi::GetSystemMetrics(
            windows::Win32::Graphics::Gdi::SM_CYSCREEN,
        );

        width >= screen_w && height >= screen_h
    }

    #[cfg(not(target_os = "windows"))]
    false
}