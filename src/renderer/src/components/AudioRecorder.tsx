import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog'
import { useToast } from '../lib/hooks/use-toast'
import { Mic, MicOff, FolderOpen, Settings } from 'lucide-react'

interface RecordingState {
  isRecording: boolean
  isPermissionGranted: boolean | null
  selectedFolder: string | null
  filename: string
  recordingPath: string | null
  startTime: number | null
  duration: number
}

export const AudioRecorder: React.FC = () => {
  const { toast } = useToast()
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPermissionGranted: null,
    selectedFolder: null,
    filename: '',
    recordingPath: null,
    startTime: null,
    duration: 0
  })
  const [showPermissionDialog, setShowPermissionDialog] = useState(false)

  // Check permissions on component mount
  useEffect(() => {
    checkPermissions()
  }, [])

  // Timer for recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout

    if (recordingState.isRecording && recordingState.startTime) {
      interval = setInterval(() => {
        const now = Date.now()
        const duration = Math.floor((now - recordingState.startTime!) / 1000)
        setRecordingState((prev) => ({ ...prev, duration }))
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [recordingState.isRecording, recordingState.startTime])

  // Set up event listeners
  useEffect(() => {
    if (!window.api?.recording) return

    const handleRecordingStatus = (status: string, timestamp: number, path?: string) => {
      if (status === 'START_RECORDING') {
        setRecordingState((prev) => ({
          ...prev,
          isRecording: true,
          startTime: timestamp,
          recordingPath: path || null,
          duration: 0
        }))
        toast({
          title: 'Recording Started',
          description: 'Audio recording has begun successfully.'
        })
      } else if (status === 'STOP_RECORDING') {
        setRecordingState((prev) => ({
          ...prev,
          isRecording: false,
          startTime: null,
          duration: 0
        }))
        toast({
          title: 'Recording Stopped',
          description: path ? `Recording saved to: ${path}` : 'Recording has been stopped.'
        })
      }
    }

    const handlePermissionDenied = () => {
      setRecordingState((prev) => ({ ...prev, isPermissionGranted: false }))
      setShowPermissionDialog(true)
    }

    const handleRecordingError = (error: string) => {
      setRecordingState((prev) => ({ ...prev, isRecording: false }))
      toast({
        title: 'Recording Error',
        description: `Error: ${error}`,
        variant: 'destructive'
      })
    }

    window.api.recording.onRecordingStatus(handleRecordingStatus)
    window.api.recording.onPermissionDenied(handlePermissionDenied)
    window.api.recording.onRecordingError(handleRecordingError)

    return () => {
      window.api.recording.removeAllListeners()
    }
  }, [toast])

  const checkPermissions = async () => {
    if (!window.api?.recording) return

    try {
      const hasPermission = await window.api.recording.checkPermissions()
      setRecordingState((prev) => ({ ...prev, isPermissionGranted: hasPermission }))

      if (!hasPermission) {
        setShowPermissionDialog(true)
      }
    } catch (error) {
      console.error('Error checking permissions:', error)
      setRecordingState((prev) => ({ ...prev, isPermissionGranted: false }))
    }
  }

  const selectFolder = async () => {
    if (!window.api?.recording) return

    try {
      const folder = await window.api.recording.openFolderDialog()
      if (folder) {
        setRecordingState((prev) => ({ ...prev, selectedFolder: folder }))
        toast({
          title: 'Folder Selected',
          description: `Recordings will be saved to: ${folder}`
        })
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      toast({
        title: 'Error',
        description: 'Failed to open folder dialog.',
        variant: 'destructive'
      })
    }
  }

  const startRecording = async () => {
    if (!window.api?.recording || !recordingState.selectedFolder) return

    try {
      const result = await window.api.recording.startRecording({
        filepath: recordingState.selectedFolder,
        filename: recordingState.filename || undefined
      })

      if (!result.success) {
        toast({
          title: 'Recording Failed',
          description: result.error || 'Unknown error occurred.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error starting recording:', error)
      toast({
        title: 'Recording Failed',
        description: 'Failed to start recording.',
        variant: 'destructive'
      })
    }
  }

  const stopRecording = async () => {
    if (!window.api?.recording) return

    try {
      const result = await window.api.recording.stopRecording()

      if (!result.success) {
        toast({
          title: 'Stop Recording Failed',
          description: result.error || 'Unknown error occurred.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error stopping recording:', error)
      toast({
        title: 'Stop Recording Failed',
        description: 'Failed to stop recording.',
        variant: 'destructive'
      })
    }
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const canRecord = recordingState.isPermissionGranted && recordingState.selectedFolder

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Mic className="h-6 w-6" />
            Audio Recorder
          </CardTitle>
          <CardDescription>Record system audio with high quality FLAC format</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Permission Status */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">Screen Recording Permission</span>
            </div>
            <div
              className={`px-2 py-1 rounded text-xs font-medium ${
                recordingState.isPermissionGranted === true
                  ? 'bg-green-100 text-green-800'
                  : recordingState.isPermissionGranted === false
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {recordingState.isPermissionGranted === true
                ? 'Granted'
                : recordingState.isPermissionGranted === false
                  ? 'Denied'
                  : 'Checking...'}
            </div>
          </div>

          {/* Folder Selection */}
          <div className="space-y-2">
            <Label htmlFor="folder">Recording Location</Label>
            <div className="flex gap-2">
              <Input
                id="folder"
                placeholder="Select a folder to save recordings..."
                value={recordingState.selectedFolder || ''}
                readOnly
                className="flex-1"
              />
              <Button onClick={selectFolder} variant="outline" size="icon">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filename Input */}
          <div className="space-y-2">
            <Label htmlFor="filename">Filename (optional)</Label>
            <Input
              id="filename"
              placeholder="Enter custom filename..."
              value={recordingState.filename}
              onChange={(e) => setRecordingState((prev) => ({ ...prev, filename: e.target.value }))}
              disabled={recordingState.isRecording}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use timestamp. Extension (.flac) will be added automatically.
            </p>
          </div>

          {/* Recording Controls */}
          <div className="flex flex-col items-center gap-4">
            {recordingState.isRecording && (
              <div className="text-center">
                <div className="text-2xl font-mono font-bold">
                  {formatDuration(recordingState.duration)}
                </div>
                <p className="text-sm text-muted-foreground">Recording in progress...</p>
                {recordingState.recordingPath && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Saving to: {recordingState.recordingPath}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={recordingState.isRecording ? stopRecording : startRecording}
                disabled={!canRecord}
                variant={recordingState.isRecording ? 'destructive' : 'default'}
                size="lg"
                className="flex items-center gap-2"
              >
                {recordingState.isRecording ? (
                  <>
                    <MicOff className="h-5 w-5" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    Start Recording
                  </>
                )}
              </Button>
            </div>

            {!canRecord && (
              <p className="text-sm text-muted-foreground text-center">
                {!recordingState.isPermissionGranted
                  ? 'Please grant screen recording permission to continue.'
                  : !recordingState.selectedFolder
                    ? 'Please select a folder to save recordings.'
                    : ''}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Permission Dialog */}
      <AlertDialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Screen Recording Permission Required</AlertDialogTitle>
            <AlertDialogDescription>
              This app needs screen recording permission to capture system audio. Please grant
              permission in System Preferences and restart the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowPermissionDialog(false)}>
              I'll Grant Permission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
