/// 壁纸窗口管理模块
/// 将 Tauri 窗口嵌入桌面壁纸层

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;