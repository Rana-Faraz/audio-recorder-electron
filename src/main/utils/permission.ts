import { promisify } from 'util'
import { exec } from 'child_process'
import { join } from 'path'
import { app } from 'electron'

const execAsync = promisify(exec)

interface PermissionResponse {
  code: string
}

export const checkPermissions = async (): Promise<boolean> => {
  try {
    // In packaged app, use process.resourcesPath, in dev use app.getAppPath()
    const resourcesPath = app.isPackaged
      ? process.resourcesPath
      : join(app.getAppPath(), 'src/native')

    const binaryPath = join(resourcesPath, 'Recorder')
    console.log('Binary path:', binaryPath) // Debug log

    const { stdout } = await execAsync(`"${binaryPath}" --check-permissions`)
    const response: PermissionResponse = JSON.parse(stdout.trim())

    return response.code === 'PERMISSION_GRANTED'
  } catch (error) {
    console.error('Error checking permissions:', error)
    return false
  }
}
