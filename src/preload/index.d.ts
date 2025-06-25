import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      permission: {
        checkPermissions: () => Promise<boolean>
        requestPermissions: () => Promise<boolean>
        setStartup: (enable: boolean) => Promise<boolean>
        getStartupStatus: () => Promise<boolean>
      }
      websocket: {
        // Native audio streaming
        startAudioStream: () => Promise<{ success: boolean; format?: any }>
        stopAudioStream: () => Promise<boolean>

        // Send WebSocket signaling messages
        sendMessage: (message: any) => Promise<{ success: boolean; error?: string }>

        // Event listeners for WebSocket signaling
        onMessageReceived: (callback: (message: any) => void) => void

        // Native audio frame listener
        onNativeAudioFrame: (
          callback: (data: { data: string; timestamp: number; format: any }) => void
        ) => void

        // Audio stream stopped listener
        onAudioStreamStopped: (callback: () => void) => void

        removeAllListeners: () => void
      }
    }
  }

  interface AudioSource {
    id: string
    name: string
    audio: boolean
  }

  interface AudioFormat {
    sampleRate: number
    channels: number
    bitDepth: number
    format: string
  }
}
