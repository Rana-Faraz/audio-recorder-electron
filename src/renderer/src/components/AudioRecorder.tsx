import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { useToast } from '../lib/hooks/use-toast'
import { Settings, Shield, Power, CheckCircle, Radio } from 'lucide-react'
import { WebRTCManager } from './WebRTCManager'

interface CompanionState {
  hasPermission: boolean | null
  startupEnabled: boolean
  isLoading: boolean
  activeTab: 'settings' | 'webrtc'
}

export const AudioRecorder: React.FC = () => {
  const { toast } = useToast()
  const [state, setState] = useState<CompanionState>({
    hasPermission: null,
    startupEnabled: false,
    isLoading: true,
    activeTab: 'settings'
  })

  // Check permissions and startup status on component mount
  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    if (!window.api?.permission) {
      console.warn('Permission API not available')
      setState((prev) => ({ ...prev, isLoading: false, hasPermission: false }))
      return
    }

    try {
      setState((prev) => ({ ...prev, isLoading: true }))

      const [hasPermission, startupEnabled] = await Promise.all([
        window.api.permission.checkPermissions(),
        window.api.permission.getStartupStatus()
      ])

      setState({
        hasPermission,
        startupEnabled,
        isLoading: false,
        activeTab: hasPermission ? 'webrtc' : 'settings'
      })
    } catch (error) {
      console.error('Error checking status:', error)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        hasPermission: false
      }))
      toast({
        title: 'Error',
        description: 'Failed to check system status.',
        variant: 'destructive'
      })
    }
  }

  const handleRequestPermissions = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }))

      const granted = await window.api.permission.requestPermissions()

      if (granted) {
        setState((prev) => ({
          ...prev,
          hasPermission: true,
          isLoading: false,
          activeTab: 'webrtc'
        }))
        toast({
          title: 'Permission Granted',
          description: 'Screen recording permission has been granted!'
        })
      } else {
        setState((prev) => ({ ...prev, isLoading: false }))
        toast({
          title: 'Permission Required',
          description: 'Please grant screen recording permission in System Preferences.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }))
      toast({
        title: 'Error',
        description: 'Failed to request permissions.',
        variant: 'destructive'
      })
    }
  }

  const handleToggleStartup = async () => {
    try {
      const newStartupState = !state.startupEnabled
      const success = await window.api.permission.setStartup(newStartupState)

      if (success) {
        setState((prev) => ({ ...prev, startupEnabled: newStartupState }))
        toast({
          title: newStartupState ? 'Startup Enabled' : 'Startup Disabled',
          description: `App will ${newStartupState ? 'now' : 'no longer'} start automatically on system boot.`
        })
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update startup settings.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update startup settings.',
        variant: 'destructive'
      })
    }
  }

  const renderTabButton = (tab: 'settings' | 'webrtc', label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setState((prev) => ({ ...prev, activeTab: tab }))}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        state.activeTab === tab
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
      disabled={tab === 'webrtc' && !state.hasPermission}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">System Audio Companion</h1>
          <p className="text-muted-foreground">Stream your system audio to websites via WebRTC</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          {renderTabButton('settings', 'Settings', <Settings className="h-4 w-4" />)}
          {renderTabButton('webrtc', 'Audio Stream', <Radio className="h-4 w-4" />)}
        </div>

        {/* Settings Tab */}
        {state.activeTab === 'settings' && (
          <div className="space-y-4">
            {/* Permission Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Screen Recording Permission
                </CardTitle>
                <CardDescription>Required to capture system audio for streaming</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {state.isLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : state.hasPermission ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Shield className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">
                      {state.isLoading
                        ? 'Checking...'
                        : state.hasPermission
                          ? 'Permission Granted'
                          : 'Permission Required'}
                    </span>
                  </div>

                  {!state.hasPermission && !state.isLoading && (
                    <Button onClick={handleRequestPermissions}>Grant Permission</Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Startup Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Power className="h-5 w-5" />
                  Run on Startup
                </CardTitle>
                <CardDescription>
                  Automatically start the companion app when your system boots
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    Start with system: {state.startupEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <Button
                    onClick={handleToggleStartup}
                    variant={state.startupEnabled ? 'destructive' : 'default'}
                  >
                    {state.startupEnabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Next Steps */}
            {state.hasPermission && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-5 w-5" />
                    Ready to Stream
                  </CardTitle>
                  <CardDescription className="text-green-700">
                    All permissions are configured. Switch to the Audio Stream tab to connect to
                    websites.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
        )}

        {/* WebRTC Tab */}
        {state.activeTab === 'webrtc' && state.hasPermission && <WebRTCManager />}

        {/* Permission Required Message for WebRTC Tab */}
        {state.activeTab === 'webrtc' && !state.hasPermission && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <Shield className="h-5 w-5" />
                Permission Required
              </CardTitle>
              <CardDescription className="text-yellow-700">
                Screen recording permission is required to stream system audio. Please grant
                permission in the Settings tab first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setState((prev) => ({ ...prev, activeTab: 'settings' }))}
                className="mt-2"
              >
                Go to Settings
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
