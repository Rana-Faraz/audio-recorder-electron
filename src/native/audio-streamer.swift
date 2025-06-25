import AVFoundation
import ScreenCaptureKit
import Foundation

// Debug helper
extension FileHandle: TextOutputStream {
    public func write(_ string: String) {
        let data = Data(string.utf8)
        self.write(data)
    }
}

var standardError = FileHandle.standardError

class AudioStreamer: NSObject, SCStreamDelegate, SCStreamOutput {
    static var screenCaptureStream: SCStream?
    private var contentEligibleForSharing: SCShareableContent?
    private var isStreaming = false
    private var audioCallback: ((Data) -> Void)?
    
    override init() {
        super.init()
    }
    
    func startStreaming(completion: @escaping (Bool, String?) -> Void) {
        guard !isStreaming else {
            completion(false, "Already streaming")
            return
        }
        
        // Check permissions first
        if !CGPreflightScreenCaptureAccess() {
            let granted = CGRequestScreenCaptureAccess()
            if !granted {
                completion(false, "Screen capture permission denied")
                return
            }
        }
        
        updateAvailableContent { [weak self] success, error in
            if success {
                self?.setupStreamingEnvironment(completion: completion)
            } else {
                completion(false, error ?? "Failed to get available content")
            }
        }
    }
    
    func stopStreaming() {
        AudioStreamer.screenCaptureStream?.stopCapture()
        AudioStreamer.screenCaptureStream = nil
        isStreaming = false
    }
    
    func setAudioCallback(_ callback: @escaping (Data) -> Void) {
        self.audioCallback = callback
    }
    
    private func updateAvailableContent(completion: @escaping (Bool, String?) -> Void) {
        print("DEBUG: Getting shareable content", to: &standardError)
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { [weak self] content, error in
            print("DEBUG: SCShareableContent callback called", to: &standardError)
            guard let self = self else {
                print("DEBUG: Self deallocated", to: &standardError)
                completion(false, "Self deallocated")
                return
            }
            
            if let error = error {
                print("DEBUG: Failed to get shareable content: \(error)", to: &standardError)
                completion(false, "Failed to get shareable content: \(error.localizedDescription)")
                return
            }
            
            print("DEBUG: Got shareable content successfully", to: &standardError)
            self.contentEligibleForSharing = content
            completion(true, nil)
        }
    }
    
    private func setupStreamingEnvironment(completion: @escaping (Bool, String?) -> Void) {
        guard let firstDisplay = contentEligibleForSharing?.displays.first else {
            print("DEBUG: No display found", to: &standardError)
            completion(false, "No display found")
            return
        }
        
        print("DEBUG: Creating screen content filter", to: &standardError)
        let screenContentFilter = SCContentFilter(display: firstDisplay, excludingApplications: [], exceptingWindows: [])
        
        print("DEBUG: Starting async task for streaming", to: &standardError)
        Task {
            print("DEBUG: Inside async task, calling initiateStreaming", to: &standardError)
            await initiateStreaming(with: screenContentFilter, completion: completion)
        }
    }
    
    private func initiateStreaming(with filter: SCContentFilter, completion: @escaping (Bool, String?) -> Void) async {
        print("DEBUG: initiateStreaming called", to: &standardError)
        let streamConfiguration = SCStreamConfiguration()
        configureStream(streamConfiguration)
        
        do {
            print("DEBUG: Creating SCStream", to: &standardError)
            AudioStreamer.screenCaptureStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)
            
            print("DEBUG: Adding stream output", to: &standardError)
            try AudioStreamer.screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
            
            print("DEBUG: Starting capture", to: &standardError)
            try await AudioStreamer.screenCaptureStream?.startCapture()
            
            print("DEBUG: Capture started successfully", to: &standardError)
            isStreaming = true
            completion(true, nil)
        } catch {
            print("DEBUG: Capture failed with error: \(error)", to: &standardError)
            completion(false, "Failed to start capture: \(error.localizedDescription)")
        }
    }
    
    private func configureStream(_ configuration: SCStreamConfiguration) {
        // Minimal video configuration (we only want audio)
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale.max)
        configuration.showsCursor = false
        
        // Audio configuration for WebRTC compatibility
        configuration.capturesAudio = true
        configuration.sampleRate = 48000
        configuration.channelCount = 2
    }
    
    // MARK: - SCStreamOutput
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .audio else { 
            print("DEBUG: Non-audio output type received: \(outputType)", to: &standardError)
            return 
        }
        
        // print("DEBUG: Audio sample buffer received", to: &standardError)
        
        // Convert CMSampleBuffer to PCM data for WebRTC
        guard let audioBuffer = sampleBuffer.asPCMBuffer else { 
            print("DEBUG: Failed to convert sample buffer to PCM buffer", to: &standardError)
            return 
        }
        
        // print("DEBUG: PCM buffer created, frame length: \(audioBuffer.frameLength)", to: &standardError)
        
        // Convert AVAudioPCMBuffer to Data
        if let audioData = audioBuffer.toPCMData() {
            // print("DEBUG: PCM data created, size: \(audioData.count) bytes", to: &standardError)
            // Send audio data to callback (which will forward to WebRTC)
            audioCallback?(audioData)
        } else {
            print("DEBUG: Failed to convert PCM buffer to data", to: &standardError)
        }
    }
    
    // MARK: - SCStreamDelegate
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("Stream stopped with error: \(error.localizedDescription)")
        isStreaming = false
        AudioStreamer.screenCaptureStream = nil
    }
}

// MARK: - Extensions for audio processing
extension CMSampleBuffer {
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { audioBufferList, _ -> AVAudioPCMBuffer? in
            guard let absd = self.formatDescription?.audioStreamBasicDescription else { return nil }
            guard let format = AVAudioFormat(standardFormatWithSampleRate: absd.mSampleRate, channels: absd.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: audioBufferList.unsafePointer)
        }
    }
}

extension AVAudioPCMBuffer {
    func toPCMData() -> Data? {
        guard let floatChannelData = self.floatChannelData else { return nil }
        
        let frameLength = Int(self.frameLength)
        let channelCount = Int(self.format.channelCount)
        
        // Convert float samples to 16-bit PCM (common WebRTC format)
        var pcmData = Data()
        
        for frame in 0..<frameLength {
            for channel in 0..<channelCount {
                let sample = floatChannelData[channel][frame]
                
                // Clamp the sample to valid range [-1.0, 1.0] before conversion
                let clampedSample = max(-1.0, min(1.0, sample))
                
                // Convert float (-1.0 to 1.0) to 16-bit signed integer with proper bounds checking
                let scaledSample = clampedSample * Float(Int16.max)
                let intSample = Int16(scaledSample.rounded())
                
                let bytes = withUnsafeBytes(of: intSample.littleEndian) { Data($0) }
                pcmData.append(bytes)
            }
        }
        
        return pcmData
    }
}

// CLI interface for the audio streamer
class AudioStreamerCLI {
    private let streamer = AudioStreamer()
    private var isRunning = false
    
    func run() {
        let arguments = CommandLine.arguments
        
        if arguments.contains("--start-stream") {
            startAudioStream()
        } else if arguments.contains("--stop-stream") {
            stopAudioStream()
        } else if arguments.contains("--check-permissions") {
            checkPermissions()
        } else {
            returnResponse(["code": "INVALID_ARGUMENTS"])
        }
    }
    
    private func startAudioStream() {
        print("DEBUG: Starting audio stream...", to: &standardError)
        
        // Start keeping the process alive immediately
        isRunning = true
        
        // Set up audio callback to output PCM data
        streamer.setAudioCallback { [weak self] audioData in
            // Output audio data as base64 for IPC transport
            let base64Audio = audioData.base64EncodedString()
            self?.returnResponse([
                "code": "AUDIO_DATA",
                "data": base64Audio,
                "timestamp": ISO8601DateFormatter().string(from: Date())
            ], shouldExit: false)
        }
        
        print("DEBUG: Calling streamer.startStreaming...", to: &standardError)
        streamer.startStreaming { [weak self] success, error in
            print("DEBUG: startStreaming completion called with success=\(success), error=\(error ?? "nil")", to: &standardError)
            
            if success {
                self?.returnResponse([
                    "code": "STREAM_STARTED",
                    "timestamp": ISO8601DateFormatter().string(from: Date())
                ], shouldExit: false)
                print("DEBUG: Stream started successfully", to: &standardError)
            } else {
                self?.isRunning = false
                self?.returnResponse([
                    "code": "STREAM_FAILED",
                    "error": error ?? "Unknown error"
                ])
            }
        }
        
        print("DEBUG: startAudioStream method completed, starting keepAlive", to: &standardError)
        // Keep the process alive while waiting for async operations
        keepAlive()
    }


    
    private func stopAudioStream() {
        streamer.stopStreaming()
        isRunning = false
        returnResponse(["code": "STREAM_STOPPED"])
    }
    
    private func checkPermissions() {
        let hasPermission = CGPreflightScreenCaptureAccess()
        returnResponse([
            "code": hasPermission ? "PERMISSION_GRANTED" : "PERMISSION_DENIED"
        ])
    }
    
    private func keepAlive() {
        // Set up signal handlers
        signal(SIGINT) { _ in
            exit(0)
        }
        signal(SIGTERM) { _ in
            exit(0)
        }
        
        // Keep the run loop alive indefinitely
        RunLoop.current.run()
    }
    
    private func returnResponse(_ response: [String: Any], shouldExit: Bool = true) {
        if let jsonData = try? JSONSerialization.data(withJSONObject: response),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
            fflush(stdout)
        }
        
        if shouldExit {
            exit(0)
        }
    }
}

// Entry point
let cli = AudioStreamerCLI()
cli.run() 