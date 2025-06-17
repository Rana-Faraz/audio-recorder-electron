import { spawn, ChildProcess } from 'node:child_process'
import { join } from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import { existsSync } from 'fs'
import { checkPermissions } from './permission'

interface RecordingResponse {
  code: string
  timestamp?: string
  path?: string
}

interface RecordingOptions {
  filepath: string
  filename?: string
}

let recordingProcess: ChildProcess | null = null

const initRecording = (filepath: string, filename?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      // In packaged app, use process.resourcesPath, in dev use app.getAppPath()
      const resourcesPath = app.isPackaged
        ? process.resourcesPath
        : join(app.getAppPath(), 'src/native')

      const binaryPath = join(resourcesPath, 'Recorder')
      console.log('Recording binary path:', binaryPath) // Debug log

      const args = ['--record', filepath]

      if (filename) {
        args.push('--filename', filename)
      }

      recordingProcess = spawn(binaryPath, args)

      if (!recordingProcess.stdout) {
        resolve(false)
        return
      }

      recordingProcess.stdout.on('data', (data) => {
        const lines = data
          .toString()
          .split('\n')
          .filter((line: string) => line.trim() !== '')

        for (const line of lines) {
          try {
            const response: RecordingResponse = JSON.parse(line)

            if (response.code !== 'RECORDING_STARTED' && response.code !== 'RECORDING_STOPPED') {
              resolve(false)
              return
            }

            const timestamp = response.timestamp
              ? new Date(response.timestamp).getTime()
              : Date.now()
            const mainWindow = BrowserWindow.getAllWindows()[0]

            if (mainWindow) {
              mainWindow.webContents.send(
                'recording-status',
                response.code === 'RECORDING_STARTED' ? 'START_RECORDING' : 'STOP_RECORDING',
                timestamp,
                response.path
              )
            }

            resolve(true)
          } catch (parseError) {
            console.error('Error parsing recording response:', parseError)
            resolve(false)
          }
        }
      })

      recordingProcess.on('error', (error) => {
        console.error('Recording process error:', error)
        resolve(false)
      })
    } catch (error) {
      console.error('Error initializing recording:', error)
      resolve(false)
    }
  })
}

export const startRecording = async ({ filepath, filename }: RecordingOptions): Promise<void> => {
  const mainWindow = BrowserWindow.getAllWindows()[0]

  if (!mainWindow) {
    console.error('No main window found')
    return
  }

  try {
    const isPermissionGranted = await checkPermissions()

    if (!isPermissionGranted) {
      mainWindow.webContents.send('permission-denied')
      return
    }

    // Check if file already exists
    const fileExtension = '.flac'
    const finalFilename = filename || `recording-${Date.now()}`
    const fullPath = join(filepath, finalFilename + fileExtension)

    if (existsSync(fullPath)) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Recording Error',
        message:
          'File already exists. Please choose a different filename or delete the existing file.',
        buttons: ['OK']
      })

      mainWindow.webContents.send('recording-error', 'FILE_EXISTS')
      return
    }

    // Start recording with retry logic
    let attempts = 0
    const maxAttempts = 3

    while (attempts < maxAttempts) {
      const recordingStarted = await initRecording(filepath, finalFilename)

      if (recordingStarted) {
        break
      }

      attempts++
      if (attempts >= maxAttempts) {
        mainWindow.webContents.send('recording-error', 'FAILED_TO_START')
        return
      }

      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  } catch (error) {
    console.error('Error starting recording:', error)
    if (mainWindow) {
      mainWindow.webContents.send('recording-error', 'UNKNOWN_ERROR')
    }
  }
}

export const stopRecording = (): void => {
  if (recordingProcess && !recordingProcess.killed) {
    recordingProcess.kill('SIGINT')
    recordingProcess = null
  }
}
