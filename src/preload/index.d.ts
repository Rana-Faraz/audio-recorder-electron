import { ElectronAPI } from '@electron-toolkit/preload'

interface RecordingAPI {
  openFolderDialog: () => Promise<string | null>
  checkPermissions: () => Promise<boolean>
  startRecording: (options: {
    filepath: string
    filename?: string
  }) => Promise<{ success: boolean; error?: string }>
  stopRecording: () => Promise<{ success: boolean; error?: string }>

  // Event listeners
  onRecordingStatus: (callback: (status: string, timestamp: number, path?: string) => void) => void
  onPermissionDenied: (callback: () => void) => void
  onRecordingError: (callback: (error: string) => void) => void

  // Remove listeners
  removeAllListeners: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      recording: RecordingAPI
    }
  }
}
