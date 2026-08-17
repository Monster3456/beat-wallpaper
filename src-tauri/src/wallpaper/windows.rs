use anyhow::Result;
use tauri::WebviewWindow;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

// 仅 Windows 可用的类型（函数签名需要模块级导入）
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};

/// 在 Windows 上将窗口嵌入桌面壁纸层（Progman/WorkerW 技法）：
/// 把窗口设为壁纸 WorkerW 的子窗口——壁纸图片之上、桌面图标（SHELLDLL_DefView）之下，
/// 与 macOS 嵌入效果一致，不会遮挡任何窗口
pub fn setup_wallpaper_window(window: &WebviewWindow) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use windows::core::w;
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumWindows, FindWindowW, GetWindowLongPtrW, SendMessageW, SetParent,
            SetWindowLongPtrW, GWL_STYLE, WS_CHILD, WS_POPUP,
        };

        unsafe {
            // 1. 找到 Progman 并发送 0x052C 让系统创建壁纸 WorkerW
            let progman = FindWindowW(w!("Progman"), None).unwrap_or_default();
            if progman.is_invalid() {
                log::warn!("Windows: 未找到 Progman 窗口，跳过桌面嵌入");
                return Ok(());
            }
            let _ = SendMessageW(progman, 0x052C, WPARAM(0x000D as usize), LPARAM(1 as isize));

            // 2. 枚举 WorkerW，找到不含 SHELLDLL_DefView（桌面图标）的那个 = 壁纸层
            let mut wallpaper_worker: HWND = HWND::default();
            EnumWindows(
                Some(find_wallpaper_worker),
                LPARAM(&mut wallpaper_worker as *mut HWND as isize),
            );

            if wallpaper_worker.is_invalid() {
                log::warn!("Windows: 未找到壁纸 WorkerW，跳过桌面嵌入");
                return Ok(());
            }

            // 3. 窗口子窗口化到壁纸 WorkerW（去掉 POPUP、加 CHILD）
            // tauri 的 HWND 可能与本地 windows crate 版本不同，统一转成裸指针再包装
            let hwnd = HWND(window.hwnd()?.0);
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
            SetWindowLongPtrW(hwnd, GWL_STYLE, ((style & !WS_POPUP.0) | WS_CHILD.0) as isize);
            let _ = SetParent(hwnd, wallpaper_worker);

            log::info!(
                "Windows: 壁纸窗口已嵌入桌面层 hwnd={:?} worker={:?}",
                hwnd,
                wallpaper_worker
            );
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        log::info!("非 Windows 平台，跳过桌面嵌入");
    }

    Ok(())
}

/// 枚举回调：找到没有桌面图标子窗口的 WorkerW（即壁纸背景层）
#[cfg(target_os = "windows")]
unsafe extern "system" fn find_wallpaper_worker(hwnd: HWND, lparam: LPARAM) -> BOOL {
    use windows::core::w;
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, GetClassNameW};

    let mut buf = [0u16; 256];
    let len = GetClassNameW(hwnd, &mut buf);
    if len > 0 && String::from_utf16_lossy(&buf[..len as usize]) == "WorkerW" {
        let defview = FindWindowExW(hwnd, None, w!("SHELLDLL_DefView"), None).unwrap_or_default();
        if defview.is_invalid() {
            let target = lparam.0 as *mut HWND;
            *target = hwnd;
            return BOOL(0); // 停止枚举
        }
    }
    BOOL(1)
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