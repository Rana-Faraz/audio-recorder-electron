import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Recording API
  recording: {
    openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
    checkPermissions: () => ipcRenderer.invoke('check-permissions'),
    startRecording: (options: { filepath: string; filename?: string }) =>
      ipcRenderer.invoke('start-recording', options),
    stopRecording: () => ipcRenderer.invoke('stop-recording'),

    // Event listeners
    onRecordingStatus: (callback: (status: string, timestamp: number, path?: string) => void) => {
      ipcRenderer.on('recording-status', (_, status, timestamp, path) =>
        callback(status, timestamp, path)
      )
    },
    onPermissionDenied: (callback: () => void) => {
      ipcRenderer.on('permission-denied', callback)
    },
    onRecordingError: (callback: (error: string) => void) => {
      ipcRenderer.on('recording-error', (_, error) => callback(error))
    },

    // Remove listeners
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('recording-status')
      ipcRenderer.removeAllListeners('permission-denied')
      ipcRenderer.removeAllListeners('recording-error')
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
