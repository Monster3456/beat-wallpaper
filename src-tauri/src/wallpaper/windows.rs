use anyhow::Result;
use tauri::WebviewWindow;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

/// 在 Windows 上将窗口嵌入桌面壁纸层
pub fn setup_wallpaper_window(_window: &WebviewWindow) -> Result<()> {
    log::info!("Windows wallpaper window setup - 待完善");
    Ok(())
}

/// 读取 Windows 系统壁纸路径（注册表 HKCU\Control Panel\Desktop\WallPaper）
#[cfg(target_os = "windows")]
pub fn get_system_wallpaper_path() -> Result<String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};

    unsafe {
        let mut buf = [0u16; 1024];
        let mut len = (buf.len() * 2) as u32;
        let path = PCWSTR::from_raw(
            "Control Panel\\Desktop".encode_utf16().collect::<Vec<u16>>().as_ptr(),
        );
        let name = PCWSTR::from_raw("WallPaper".encode_utf16().collect::<Vec<u16>>().as_ptr());
        let status = RegGetValueW(
            HKEY_CURRENT_USER,
            path,
            name,
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr() as *mut _),
            Some(&mut len),
        );
        if status.is_err() {
            anyhow::bail!("读取注册表壁纸失败");
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let path_str = String::from_utf16_lossy(&buf[..end]);
        log::info!("Windows 系统壁纸: {}", path_str);
        Ok(path_str)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_system_wallpaper_path() -> Result<String> {
    anyhow::bail!("仅 Windows 支持")
}

static FULLSCREEN_CHECK: std::sync::OnceLock<Arc<AtomicBool>> = std::sync::OnceLock::new();

/// 检测是否全屏应用运行中
pub fn is_fullscreen_app_running() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows::Win32::Foundation::FALSE;
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};

        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return false;
        }

        // 用显示器信息判断全屏（不依赖 GetSystemMetrics 的 feature 归属）
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut info) == FALSE {
            return false;
        }
        let screen_w = info.rcMonitor.right - info.rcMonitor.left;
        let screen_h = info.rcMonitor.bottom - info.rcMonitor.top;

        let mut rect = std::mem::zeroed();
        GetWindowRect(hwnd, &mut rect);

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        width >= screen_w && height >= screen_h
    }

    #[cfg(not(target_os = "windows"))]
    false
}