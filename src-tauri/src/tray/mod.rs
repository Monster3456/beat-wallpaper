/// 系统托盘管理

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

/// 创建系统托盘
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let _tray = TrayIconBuilder::new()
        .tooltip("BeatWallpaper - 音乐律动壁纸")
        .icon(app.default_window_icon().cloned().unwrap())
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    // 左键单击：打开设置窗口
                    if let Some(window) = tray.app_handle().get_webview_window("settings") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    // 右键单击：弹出菜单
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}