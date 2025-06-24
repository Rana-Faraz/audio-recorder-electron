import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      companion: {
        checkPermissions: () => Promise<boolean>
        requestPermissions: () => Promise<boolean>
        setStartup: (enable: boolean) => Promise<boolean>
        getStartupStatus: () => Promise<boolean>
      }
    }
  }
}
