import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  session,
  desktopCapturer,
  systemPreferences
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { checkPermissions } from './utils/permission'
import { audioStreamer } from './utils/audio-streamer'
import { WebSocketSignalingServer } from './utils/websocket-server'
import WebSocket from 'ws'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let currentAudioStream: MediaStream | null = null
let signalingServer: WebSocketSignalingServer | null = null
let electronWebSocket: WebSocket | null = null

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

function setupWebSocketIPC(): void {
  // Handle WebSocket signaling messages from renderer
  ipcMain.handle('websocket-send-message', async (_, message) => {
    try {
      if (electronWebSocket && electronWebSocket.readyState === WebSocket.OPEN) {
        electronWebSocket.send(JSON.stringify(message))
        return { success: true }
      } else {
        console.error('WebSocket not connected')
        return { success: false, error: 'WebSocket not connected' }
      }
    } catch (error) {
      console.error('Error sending WebSocket message:', error)
      return { success: false, error: String(error) }
    }
  })

  // Handle starting native system audio stream
  ipcMain.handle('start-audio-stream', async () => {
    try {
      console.log('Starting native system audio stream...')
      const success = await audioStreamer.startStreaming()

      if (success) {
        console.log('✅ Native audio streaming started')
        return {
          success: true,
          format: audioStreamer.getAudioFormat()
        }
      } else {
        throw new Error('Failed to start native audio streaming')
      }
    } catch (error) {
      console.error('Error starting native audio stream:', error)
      throw new Error(`Failed to start native audio stream: ${error}`)
    }
  })

  // Handle stopping native system audio stream
  ipcMain.handle('stop-audio-stream', async () => {
    try {
      console.log('Stopping native system audio stream...')
      await audioStreamer.stopStreaming()
      console.log('✅ Native audio streaming stopped')
      return true
    } catch (error) {
      console.error('Error stopping native audio stream:', error)
      return false
    }
  })

  // Forward audio frames to renderer for WebRTC
  audioStreamer.on('audioFrame', (pcmData: Buffer) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('native-audio-frame', {
        data: pcmData.toString('base64'),
        timestamp: Date.now(),
        format: audioStreamer.getAudioFormat()
      })
    }
  })
}

function setupElectronWebSocketClient(): void {
  // Connect Electron app to the standalone WebSocket signaling server
  electronWebSocket = new WebSocket('ws://localhost:8080')

  electronWebSocket.on('open', () => {
    console.log('⚡ Electron connected to WebSocket signaling server')

    // Identify as Electron client
    electronWebSocket!.send(
      JSON.stringify({
        type: 'identify',
        clientType: 'electron'
      })
    )
  })

  electronWebSocket.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      console.log('📨 Received WebSocket message:', message.type)

      // Forward all messages to renderer process
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('websocket-message-received', message)
      }
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error)
    }
  })

  electronWebSocket.on('close', () => {
    console.log('🔌 Electron disconnected from WebSocket signaling server')
    electronWebSocket = null

    // Attempt to reconnect after 3 seconds
    setTimeout(() => {
      console.log('🔄 Attempting to reconnect to WebSocket signaling server...')
      setupElectronWebSocketClient()
    }, 3000)
  })

  electronWebSocket.on('error', (error) => {
    console.error('❌ Electron WebSocket error:', error)
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
      label: 'Stop Audio Stream',
      click: () => {
        if (currentAudioStream) {
          currentAudioStream.getTracks().forEach((track) => track.stop())
          currentAudioStream = null
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('audio-stream-stopped')
          }
        }
      },
      enabled: !!currentAudioStream
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('System Audio Companion - WebSocket Signaling')
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
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: true,
      contextIsolation: false
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

// Create standalone WebSocket signaling server
function createWebSocketSignalingServer() {
  signalingServer = new WebSocketSignalingServer(8080)

  signalingServer.on('start-recording', (data) => {
    console.log('🎙️ Recording start requested:', data)
    // The Electron client will handle this via WebSocket messages
  })

  signalingServer.on('stop-recording', (data) => {
    console.log('🛑 Recording stop requested:', data)
    // The Electron client will handle this via WebSocket messages
  })

  console.log('✅ WebSocket Signaling Server created')
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
  setupWebSocketIPC()

  // Create system tray
  createTray()

  // Create window (it will be hidden to tray initially in production)
  createWindow()

  // Create standalone WebSocket signaling server
  createWebSocketSignalingServer()

  // Connect Electron app as a client to the signaling server
  setTimeout(() => {
    setupElectronWebSocketClient()
  }, 1000) // Give server time to start

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Prevent quit when all windows are closed (keep running in tray)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (signalingServer) {
      signalingServer.close()
    }
    if (electronWebSocket) {
      electronWebSocket.close()
    }
    app.quit()
  }
})

// Handle app quit
app.on('before-quit', () => {
  isQuitting = true
  if (signalingServer) {
    signalingServer.close()
  }
  if (electronWebSocket) {
    electronWebSocket.close()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
