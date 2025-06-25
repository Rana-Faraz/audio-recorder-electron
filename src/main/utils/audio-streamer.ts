import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { EventEmitter } from 'events'

interface AudioData {
  code: string
  data?: string
  timestamp?: string
  error?: string
}

export class AudioStreamerManager extends EventEmitter {
  private streamerProcess: ChildProcess | null = null
  private isStreaming = false
  private audioDataBuffer: Buffer[] = []
  private readonly maxBufferSize = 1024 // Max audio chunks to buffer

  constructor() {
    super()
  }

  async startStreaming(): Promise<boolean> {
    if (this.isStreaming) {
      console.log('Audio streaming already active')
      return true
    }

    try {
      const resourcesPath = app.isPackaged
        ? process.resourcesPath
        : join(app.getAppPath(), 'src/native')

      const streamerPath = join(resourcesPath, 'AudioStreamer')
      console.log('Starting audio streamer:', streamerPath)

      this.streamerProcess = spawn(streamerPath, ['--start-stream'], {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      // Handle process output
      this.streamerProcess.stdout?.on('data', (data) => {
        const lines = data
          .toString()
          .split('\n')
          .filter((line: string) => line.trim())

        for (const line of lines) {
          try {
            const audioData: AudioData = JSON.parse(line)
            this.handleAudioData(audioData)
          } catch (error) {
            console.error('Failed to parse audio data:', error, 'Line:', line)
          }
        }
      })

      this.streamerProcess.stderr?.on('data', (data) => {
        console.error('Audio streamer error:', data.toString())
      })

      this.streamerProcess.on('close', (code) => {
        console.log('Audio streamer process closed with code:', code)
        this.isStreaming = false
        this.streamerProcess = null
        this.emit('stopped')
      })

      this.streamerProcess.on('error', (error) => {
        console.error('Audio streamer process error:', error)
        this.isStreaming = false
        this.emit('error', error)
      })

      // Wait for stream to start
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Audio streamer start timeout'))
        }, 10000)

        const onData = (audioData: AudioData) => {
          if (audioData.code === 'STREAM_STARTED') {
            clearTimeout(timeout)
            this.off('audioData', onData)
            this.isStreaming = true
            resolve()
          } else if (audioData.code === 'STREAM_FAILED') {
            clearTimeout(timeout)
            this.off('audioData', onData)
            reject(new Error(audioData.error || 'Stream failed'))
          }
        }

        this.on('audioData', onData)
      })

      console.log('✅ Audio streaming started successfully')
      return true
    } catch (error) {
      console.error('Failed to start audio streaming:', error)
      return false
    }
  }

  async stopStreaming(): Promise<void> {
    if (!this.isStreaming || !this.streamerProcess) {
      return
    }

    console.log('Stopping audio streaming...')

    // Send SIGTERM to gracefully stop the process
    this.streamerProcess.kill('SIGTERM')

    // Wait for process to close
    await new Promise<void>((resolve) => {
      if (!this.streamerProcess) {
        resolve()
        return
      }

      const timeout = setTimeout(() => {
        // Force kill if it doesn't close gracefully
        this.streamerProcess?.kill('SIGKILL')
        resolve()
      }, 5000)

      this.streamerProcess.on('close', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    this.isStreaming = false
    this.streamerProcess = null
    this.audioDataBuffer = []
    console.log('✅ Audio streaming stopped')
  }

  private handleAudioData(audioData: AudioData): void {
    this.emit('audioData', audioData)

    if (audioData.code === 'AUDIO_DATA' && audioData.data) {
      try {
        // Decode base64 audio data
        const pcmData = Buffer.from(audioData.data, 'base64')

        // Buffer audio data
        this.audioDataBuffer.push(pcmData)

        // Prevent memory overflow
        if (this.audioDataBuffer.length > this.maxBufferSize) {
          this.audioDataBuffer.shift()
        }

        // Emit raw PCM data for WebRTC consumption
        this.emit('audioFrame', pcmData)
      } catch (error) {
        console.error('Failed to process audio data:', error)
      }
    }
  }

  // Get buffered audio data for WebRTC
  getAudioBuffer(): Buffer {
    if (this.audioDataBuffer.length === 0) {
      return Buffer.alloc(0)
    }

    // Combine all buffered audio chunks
    const combinedBuffer = Buffer.concat(this.audioDataBuffer)
    this.audioDataBuffer = [] // Clear buffer after reading

    return combinedBuffer
  }

  // Create a MediaStream-like interface for WebRTC
  createAudioTrack(): MediaStreamTrack | null {
    if (!this.isStreaming) {
      return null
    }

    // This is a simplified approach - in a real implementation,
    // you'd need to create a proper MediaStreamTrack from the PCM data
    // For now, we'll handle this differently in the WebRTC integration
    return null
  }

  isActive(): boolean {
    return this.isStreaming
  }

  // Get audio format information
  getAudioFormat() {
    return {
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      format: 'PCM'
    }
  }
}

// Singleton instance
export const audioStreamer = new AudioStreamerManager()
