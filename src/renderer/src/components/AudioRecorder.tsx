import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { useToast } from '../lib/hooks/use-toast'
import { Settings, Shield, Power, CheckCircle } from 'lucide-react'

interface CompanionState {
  hasPermission: boolean | null
  startupEnabled: boolean
  isLoading: boolean
}

export const AudioRecorder: React.FC = () => {
  const { toast } = useToast()
  const [state, setState] = useState<CompanionState>({
    hasPermission: null,
    startupEnabled: false,
    isLoading: true
  })

  // Check permissions and startup status on component mount
  useEffect(() => {
    console.log('Component mounted, checking window.api:', window.api)
    console.log('window.api?.companion:', window.api?.companion)
    console.log('window.electron:', window.electron)
    console.log('All window properties:', Object.keys(window))

    // Add a small delay to ensure APIs are loaded
    const timer = setTimeout(() => {
      checkStatus()
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  const checkStatus = async () => {
    // Wait for API to be available with retries
    let retries = 0
    const maxRetries = 10

    while (!window.api?.companion && retries < maxRetries) {
      console.log(`Waiting for API... attempt ${retries + 1}/${maxRetries}`)
      await new Promise((resolve) => setTimeout(resolve, 100))
      retries++
    }

    if (!window.api?.companion) {
      console.warn('Companion API not available after retries')
      setState((prev) => ({ ...prev, isLoading: false, hasPermission: false }))
      toast({
        title: 'API Error',
        description: 'Failed to load app API. Please restart the application.',
        variant: 'destructive'
      })
      return
    }

    console.log('API available, proceeding with status check')

    try {
      setState((prev) => ({ ...prev, isLoading: true }))

      const [hasPermission, startupEnabled] = await Promise.all([
        window.api.companion.checkPermissions(),
        window.api.companion.getStartupStatus()
      ])

      setState({
        hasPermission,
        startupEnabled,
        isLoading: false
      })
    } catch (error) {
      console.error('Error checking status:', error)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        hasPermission: false,
        startupEnabled: false
      }))
      toast({
        title: 'Error',
        description: 'Failed to check app status. Please restart the app.',
        variant: 'destructive'
      })
    }
  }

  const handleRequestPermissions = async () => {
    if (!window.api.companion) return

    try {
      setState((prev) => ({ ...prev, isLoading: true }))

      const granted = await window.api.companion.requestPermissions()

      setState((prev) => ({ ...prev, hasPermission: granted, isLoading: false }))

      if (granted) {
        toast({
          title: 'Permission Granted',
          description: 'Screen recording permission has been granted successfully.'
        })
      } else {
        toast({
          title: 'Permission Required',
          description:
            'Please grant screen recording permission in System Preferences and restart the app.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error requesting permissions:', error)
      setState((prev) => ({ ...prev, isLoading: false }))
      toast({
        title: 'Error',
        description: 'Failed to request permissions.',
        variant: 'destructive'
      })
    }
  }

  const handleToggleStartup = async () => {
    if (!window.api?.companion) return

    try {
      setState((prev) => ({ ...prev, isLoading: true }))

      const newStartupState = !state.startupEnabled
      const success = await window.api.companion.setStartup(newStartupState)

      if (success) {
        setState((prev) => ({
          ...prev,
          startupEnabled: newStartupState,
          isLoading: false
        }))

        toast({
          title: newStartupState ? 'Startup Enabled' : 'Startup Disabled',
          description: newStartupState
            ? 'App will now start automatically on system startup.'
            : 'App will no longer start automatically on system startup.'
        })
      } else {
        setState((prev) => ({ ...prev, isLoading: false }))
        toast({
          title: 'Error',
          description: 'Failed to update startup settings.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error toggling startup:', error)
      setState((prev) => ({ ...prev, isLoading: false }))
      toast({
        title: 'Error',
        description: 'Failed to update startup settings.',
        variant: 'destructive'
      })
    }
  }

  const PermissionCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Screen Recording Permission
        </CardTitle>
        <CardDescription>Required for system audio capture functionality</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {state.hasPermission === true ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">Permission Granted</span>
              </>
            ) : state.hasPermission === false ? (
              <>
                <Shield className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-600">Permission Denied</span>
              </>
            ) : (
              <>
                <Settings className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-600">Checking...</span>
              </>
            )}
          </div>
          {state.hasPermission !== true && (
            <Button onClick={handleRequestPermissions} disabled={state.isLoading} size="sm">
              Grant Permission
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )

  const StartupCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Power className="h-5 w-5" />
          Run on Startup
        </CardTitle>
        <CardDescription>
          Start the companion app automatically when your system boots
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {state.startupEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <Button
            onClick={handleToggleStartup}
            disabled={state.isLoading}
            variant={state.startupEnabled ? 'destructive' : 'default'}
            size="sm"
          >
            {state.startupEnabled ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-2">System Audio Companion</h1>
        <p className="text-sm text-muted-foreground">
          Configure permissions and settings for system audio streaming
        </p>
      </div>

      <PermissionCard />
      <StartupCard />

      <div className="text-center pt-4">
        <p className="text-xs text-muted-foreground">
          The app will run in the system tray when the window is closed
        </p>
      </div>
    </div>
  )
}
