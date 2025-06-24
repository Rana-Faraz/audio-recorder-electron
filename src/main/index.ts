import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { checkPermissions } from './utils/permission'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function setupPermissionIPC(): void {
  // Handle permission checking
  ipcMain.handle('check-permissions', async () => {
    try {
      const isPermissionGranted = await checkPermissions()
      return isPermissionGranted
    } catch (error) {
      console.error('Error checking permissions:', error)
      return false
    }
  })

  // Handle permission request
  ipcMain.handle('request-permissions', async () => {
    try {
      // First check if we already have permission
      let isPermissionGranted = await checkPermissions()

      if (!isPermissionGranted && process.platform === 'darwin') {
        // Open System Preferences to grant permission
        await shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
        )

        // Check again after a brief delay (user might have granted it)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        isPermissionGranted = await checkPermissions()
      }

      return isPermissionGranted
    } catch (error) {
      console.error('Error requesting permissions:', error)
      return false
    }
  })

  // Handle startup setting
  ipcMain.handle('set-startup', async (_, enable: boolean) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: enable,
        openAsHidden: true
      })
      return true
    } catch (error) {
      console.error('Error setting startup:', error)
      return false
    }
  })

  // Handle getting startup status
  ipcMain.handle('get-startup-status', () => {
    return app.getLoginItemSettings().openAtLogin
  })
}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon)
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
        } else {
          createWindow()
        }
      }
    },
    {
      label: 'Hide App',
      click: () => {
        if (mainWindow) {
          mainWindow.hide()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('System Audio Companion')
  tray.setContextMenu(contextMenu)

  // Double-click to show/hide window
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
      }
    } else {
      createWindow()
    }
  })
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    show: false,
    autoHideMenuBar: true,
    resizable: false,
    minimizable: true,
    maximizable: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Hide to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.systemaudioscompanion')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Setup IPC handlers
  setupPermissionIPC()

  // Create system tray
  createTray()

  // Create window (it will be hidden to tray initially in production)
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Prevent quit when all windows are closed (keep running in tray)
app.on('window-all-closed', () => {
  // Don't quit the app, just hide to tray
})

// Handle app quit
app.on('before-quit', () => {
  isQuitting = true
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
