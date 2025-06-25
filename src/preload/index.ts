import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Permission Management API
  permission: {
    checkPermissions: () => ipcRenderer.invoke('check-permissions'),
    requestPermissions: () => ipcRenderer.invoke('request-permissions'),
    setStartup: (enable: boolean) => ipcRenderer.invoke('set-startup', enable),
    getStartupStatus: () => ipcRenderer.invoke('get-startup-status')
  },

  // WebSocket Signaling API with Native Audio
  websocket: {
    // Native audio streaming
    startAudioStream: () => ipcRenderer.invoke('start-audio-stream'),
    stopAudioStream: () => ipcRenderer.invoke('stop-audio-stream'),

    // Send WebSocket signaling messages
    sendMessage: (message: any) => ipcRenderer.invoke('websocket-send-message', message),

    // Event listeners for WebSocket signaling
    onMessageReceived: (callback: (message: any) => void) => {
      ipcRenderer.on('websocket-message-received', (_, message) => callback(message))
    },

    // Native audio frame listener
    onNativeAudioFrame: (
      callback: (data: { data: string; timestamp: number; format: any }) => void
    ) => {
      ipcRenderer.on('native-audio-frame', (_, data) => callback(data))
    },

    // Audio stream stopped listener
    onAudioStreamStopped: (callback: () => void) => {
      ipcRenderer.on('audio-stream-stopped', () => callback())
    },

    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('websocket-message-received')
      ipcRenderer.removeAllListeners('native-audio-frame')
      ipcRenderer.removeAllListeners('audio-stream-stopped')
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
