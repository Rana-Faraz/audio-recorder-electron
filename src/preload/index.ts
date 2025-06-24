import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

console.log('Preload script starting...')

// Custom APIs for renderer
const api = {
  // Permission & Startup API
  companion: {
    checkPermissions: () => ipcRenderer.invoke('check-permissions'),
    requestPermissions: () => ipcRenderer.invoke('request-permissions'),
    setStartup: (enable: boolean) => ipcRenderer.invoke('set-startup', enable),
    getStartupStatus: () => ipcRenderer.invoke('get-startup-status')
  }
}

console.log('API object created:', api)
console.log('Context isolated:', process.contextIsolated)

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    console.log('Exposing APIs via contextBridge...')
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    console.log('APIs exposed successfully')
  } catch (error) {
    console.error('Error exposing APIs:', error)
  }
} else {
  console.log('Exposing APIs via window object...')
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  console.log('APIs exposed via window object')
}
