import { systemPreferences } from 'electron'

export const checkPermissions = async (): Promise<boolean> => {
  try {
    // On macOS, check screen recording permission
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen')
      console.log('Screen recording permission status:', status)
      return status === 'granted'
    }

    // On other platforms, assume permission is granted
    return true
  } catch (error) {
    console.error('Error checking permissions:', error)
    return false
  }
}
