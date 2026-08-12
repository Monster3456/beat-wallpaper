fn main() {
    tauri_build::build();

    // macOS: 手动编译 Swift 音频捕获桥接为静态库
    #[cfg(target_os = "macos")]
    {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let src_dir = std::path::Path::new(&manifest_dir).join("src");

        let swift_src = src_dir.join("audio_capture.swift");
        let lib_path = std::path::Path::new(&out_dir).join("libswift_audio.a");

        let status = std::process::Command::new("swiftc")
            .arg("-emit-library")
            .arg("-static")
            .arg("-o")
            .arg(&lib_path)
            .arg(&swift_src)
            .args(["-framework", "Foundation"])
            .args(["-framework", "ScreenCaptureKit"])
            .args(["-framework", "CoreMedia"])
            .args(["-framework", "CoreVideo"])
            .args(["-framework", "CoreGraphics"])
            .args(["-framework", "IOKit"])
            .args(["-module-name", "SwiftAudioBridge"])
            .status()
            .expect("swiftc 执行失败");

        assert!(status.success(), "Swift 编译失败: audio_capture.swift");

        println!("cargo:rustc-link-search=native={}", out_dir);
        println!("cargo:rustc-link-lib=static=swift_audio");
        // Swift 运行时从 dyld cache 按 install-name 加载，需要 rpath
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        // macOS 系统自带 Swift 运行时
        // 从 SDK 链接 Swift 运行时 stub 库（运行时从 dyld cache 加载）
        let sdk_path_output = std::process::Command::new("xcrun")
            .args(["--show-sdk-path"])
            .output()
            .expect("xcrun 执行失败");
        let sdk_path = String::from_utf8(sdk_path_output.stdout)
            .expect("解析 SDK 路径失败")
            .trim()
            .to_string();
        println!("cargo:rustc-link-search={}/usr/lib/swift", sdk_path);
        println!("cargo:rustc-link-lib=dylib=swiftCore");
        println!("cargo:rustc-link-lib=dylib=swiftFoundation");
        println!("cargo:rustc-link-lib=dylib=swiftObjectiveC");
        println!("cargo:rustc-link-lib=dylib=swiftDispatch");
        println!("cargo:rustc-link-lib=dylib=swiftDarwin");
        println!("cargo:rustc-link-lib=dylib=swift_Concurrency");
        println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
        println!("cargo:rustc-link-lib=framework=CoreMedia");
        println!("cargo:rustc-link-lib=framework=CoreVideo");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=IOKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=Security");
        println!("cargo:rerun-if-changed={}", swift_src.display());
    }
}