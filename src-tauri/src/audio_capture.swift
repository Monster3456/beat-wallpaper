import Foundation
import ScreenCaptureKit
import CoreMedia

/// 系统音频捕获桥接
/// 使用 ScreenCaptureKit 捕获系统输出音频（无需安装虚拟声卡）
/// Swift 侧完成声道混合，通过 C 回调把单声道 Float32 PCM 传给 Rust 做 FFT
@objc class AudioCaptureBridge: NSObject, SCStreamOutput, SCStreamDelegate {
    static let shared = AudioCaptureBridge()

    private var stream: SCStream?
    private var captureCallback: ((UnsafePointer<Float>, Int32) -> Void)?
    private var captureStarted = false
    private var bufferCount = 0

    private override init() {
        super.init()
    }

    /// 文件日志（调试用）
    func logToFile(_ msg: String) {
        let line = "\(Date()) \(msg)\n"
        if let data = line.data(using: .utf8) {
            if let handle = FileHandle(forWritingAtPath: "/tmp/bw_swift.log") {
                handle.seekToEndOfFile()
                handle.write(data)
                handle.closeFile()
            } else {
                try? data.write(to: URL(fileURLWithPath: "/tmp/bw_swift.log"))
            }
        }
    }

    /// 启动系统音频捕获
    func startCapture(callback: @escaping (UnsafePointer<Float>, Int32) -> Void) {
        guard !captureStarted else { return }
        captureCallback = callback

        logToFile("startCapture 调用")
        Task {
            do {
                // 请求屏幕内容（需要屏幕录制权限，首次会弹窗授权）
                let content = try await SCShareableContent.current
                guard let display = content.displays.first else {
                    logToFile("未找到可捕获的显示器")
                    return
                }
                logToFile("获取到显示器: \(display.displayID), 应用数: \(content.applications.count)")

                // 只捕获音频，不需要窗口画面
                let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])

                let config = SCStreamConfiguration()
                config.width = Int(display.width)
                config.height = Int(display.height)
                config.capturesAudio = true
                config.showsCursor = false
                config.sampleRate = 48000
                config.channelCount = 2

                self.stream = SCStream(filter: filter, configuration: config, delegate: self)
                try self.stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .userInitiated))
                try await self.stream?.startCapture()
                self.captureStarted = true
                logToFile("SCStream 音频捕获已启动")
            } catch {
                logToFile("捕获启动失败: \(error)")
            }
        }
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, let captureCallback = captureCallback else { return }

        bufferCount += 1
        if bufferCount == 1 || bufferCount % 500 == 0 {
            logToFile("收到音频缓冲 #\(bufferCount)")
        }

        // 第一步：查询需要的 AudioBufferList 大小
        var bufferListSize = 0
        let sizeStatus = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: &bufferListSize,
            bufferListOut: nil,
            bufferListSize: 0,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: 0,
            blockBufferOut: nil
        )
        guard sizeStatus == noErr, bufferListSize > 0 else {
            if bufferCount == 1 { logToFile("查询 bufferList 大小失败: \(sizeStatus)") }
            return
        }

        // 第二步：分配内存并提取
        let memory = UnsafeMutableRawPointer.allocate(
            byteCount: bufferListSize,
            alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { memory.deallocate() }
        let bufferListPtr = memory.bindMemory(to: AudioBufferList.self, capacity: 1)

        var blockBuffer: CMBlockBuffer?
        let extractStatus = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: bufferListPtr,
            bufferListSize: bufferListSize,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: 0,
            blockBufferOut: &blockBuffer
        )
        guard extractStatus == noErr else {
            if bufferCount == 1 { logToFile("提取 bufferList 失败: \(extractStatus)") }
            return
        }

        let buffers = UnsafeMutableAudioBufferListPointer(bufferListPtr)
        let bufferCount2 = buffers.count
        guard bufferCount2 > 0 else { return }

        if bufferCount2 == 1 {
            // 交织布局
            let buf = buffers[0]
            let channels = Int(buf.mNumberChannels)
            guard channels > 0, let data = buf.mData else { return }
            let frames = Int(buf.mDataByteSize) / (4 * channels)
            guard frames > 0 else { return }

            let floatPtr = data.assumingMemoryBound(to: Float.self)

            if channels == 1 {
                captureCallback(floatPtr, Int32(frames))
            } else {
                // 声道混合
                var mono = [Float](repeating: 0, count: frames)
                for i in 0..<frames {
                    var sum: Float = 0
                    for c in 0..<channels {
                        sum += floatPtr[i * channels + c]
                    }
                    mono[i] = sum / Float(channels)
                }
                mono.withUnsafeBufferPointer { captureCallback($0.baseAddress!, Int32(frames)) }
            }
        } else {
            // 非交织布局：每个 buffer 一个声道
            let first = buffers[0]
            guard let firstData = first.mData else { return }
            let frames = Int(first.mDataByteSize) / 4
            guard frames > 0 else { return }

            var mono = [Float](repeating: 0, count: frames)
            for b in 0..<bufferCount2 {
                let buf = buffers[b]
                guard let data = buf.mData else { continue }
                let ptr = data.assumingMemoryBound(to: Float.self)
                for i in 0..<frames {
                    mono[i] += ptr[i]
                }
            }
            let scale = 1.0 / Float(bufferCount2)
            for i in 0..<frames {
                mono[i] *= scale
            }
            mono.withUnsafeBufferPointer { captureCallback($0.baseAddress!, Int32(frames)) }
        }
    }

    // MARK: - SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        NSLog("SCStream 停止: \(error)")
        captureStarted = false
    }
}

/// C 桥接入口，由 Rust 调用
@_cdecl("start_system_audio_capture")
func startSystemAudioCapture(_ callback: @escaping @convention(c) (UnsafePointer<Float>, Int32) -> Void) {
    AudioCaptureBridge.shared.startCapture(callback: callback)
}

/// 检查是否已授权屏幕录制
@_cdecl("check_screen_capture_permission")
func checkScreenCapturePermission() -> Bool {
    let semaphore = DispatchSemaphore(value: 0)
    var hasAccess = false
    Task {
        let content = try? await SCShareableContent.current
        hasAccess = (content != nil)
        semaphore.signal()
    }
    _ = semaphore.wait(timeout: .now() + 3)
    return hasAccess
}