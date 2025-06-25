import React, { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { useToast } from '../lib/hooks/use-toast'
import { Mic, MicOff, Wifi, WifiOff, Radio, Antenna } from 'lucide-react'

interface WebRTCManagerProps {
  className?: string
}

type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'
type ICEConnectionState =
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'failed'
  | 'disconnected'
  | 'closed'

export function WebRTCManager({ className }: WebRTCManagerProps) {
  const { toast } = useToast()
  const [isStreaming, setIsStreaming] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>('new')
  const [iceConnectionState, setICEConnectionState] = useState<ICEConnectionState>('new')
  const [connectedPeers, setConnectedPeers] = useState<number>(0)
  const [isWaitingForConnection, setIsWaitingForConnection] = useState(false)
  const [activeSessions, setActiveSessions] = useState<Map<string, RTCPeerConnection>>(new Map())
  const [websocketConnected, setWebsocketConnected] = useState(false)

  const localStreamRef = useRef<MediaStream | null>(null)
  const iceCandidatesBuffer = useRef<Map<string, RTCIceCandidate[]>>(new Map())

  useEffect(() => {
    // Listen for WebSocket signaling messages
    window.api.websocket.onMessageReceived(handleWebSocketMessage)

    return () => {
      stopAudioStream()
      window.api.websocket.removeAllListeners()
    }
  }, [])

  const handleWebSocketMessage = async (message: any) => {
    console.log('📨 WebSocket message received:', message.type)

    switch (message.type) {
      case 'client-connected':
        if (message.data?.clientType === 'electron') {
          setWebsocketConnected(true)
          console.log('⚡ Electron connected to signaling server')
          toast({
            title: 'Signaling Connected',
            description: 'Connected to WebSocket signaling server'
          })
        }
        break

      case 'offer':
        await handleOfferReceived(message)
        break

      case 'ice-candidate':
        await handleIceCandidateReceived(message)
        break

      case 'start-recording':
        console.log('🎙️ Recording start requested for session:', message.sessionId)
        break

      case 'stop-recording':
        console.log('🛑 Recording stop requested for session:', message.sessionId)
        await stopAudioStream()
        toast({
          title: 'Recording Stopped',
          description: 'Recording stopped by website request'
        })
        break

      case 'client-disconnected':
        if (message.sessionId) {
          await handleSessionDisconnected(message.sessionId)
        } else {
          setWebsocketConnected(false)
          toast({
            title: 'Signaling Disconnected',
            description: 'Lost connection to signaling server'
          })
        }
        break

      default:
        console.log('⚠️ Unknown WebSocket message type:', message.type)
    }
  }

  const handleOfferReceived = async (message: any) => {
    const { sessionId, data: offer } = message
    console.log('📥 Offer received for session:', sessionId)

    try {
      // Start audio stream if not already started
      if (!isStreaming) {
        console.log('Starting audio stream for new connection...')
        await startAudioStream()
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      if (!localStreamRef.current) {
        throw new Error('No audio stream available')
      }

      console.log('Creating peer connection for session:', sessionId)
      await createPeerConnectionForSession(sessionId, offer)

      toast({
        title: 'New Connection',
        description: `Website connected via WebSocket signaling`
      })
    } catch (error) {
      console.error('Failed to handle offer:', error)
      toast({
        title: 'Connection Failed',
        description: 'Failed to establish WebRTC connection',
        variant: 'destructive'
      })
    }
  }

  const handleIceCandidateReceived = async (message: any) => {
    const { sessionId, data: candidate } = message
    console.log(`🧊 ICE candidate received for session: ${sessionId}`)

    const peerConnection = activeSessions.get(sessionId)
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        console.log(`✅ Added ICE candidate for session: ${sessionId}`)
      } catch (error) {
        console.error(`❌ Failed to add ICE candidate:`, error)
      }
    } else {
      // Buffer candidates for later use
      const buffered = iceCandidatesBuffer.current.get(sessionId) || []
      buffered.push(candidate)
      iceCandidatesBuffer.current.set(sessionId, buffered)
      console.log(`📦 Buffered ICE candidate for session ${sessionId}`)
    }
  }

  const handleSessionDisconnected = async (sessionId: string) => {
    console.log('Session disconnected:', sessionId)

    const peerConnection = activeSessions.get(sessionId)
    if (peerConnection) {
      peerConnection.close()
      activeSessions.delete(sessionId)
      setActiveSessions(new Map(activeSessions))
      setConnectedPeers(activeSessions.size)

      toast({
        title: 'Connection Closed',
        description: 'Website disconnected from stream'
      })
    }

    // Clean up buffered candidates
    iceCandidatesBuffer.current.delete(sessionId)
  }

  const startAudioStream = async () => {
    try {
      console.log('🎵 Starting native system audio streaming...')

      // Start native system audio capture
      const result = await window.api.websocket.startAudioStream()
      if (!result.success) {
        throw new Error('Failed to start native audio streaming')
      }

      console.log('✅ Native audio streaming started:', result.format)

      // Create a virtual MediaStream for WebRTC compatibility
      localStreamRef.current = createVirtualAudioStream()
      setIsStreaming(true)
      setIsWaitingForConnection(true)

      // Set up native audio frame listener
      window.api.websocket.onNativeAudioFrame((audioFrame) => {
        processNativeAudioFrame(audioFrame)
      })

      toast({
        title: 'Native System Audio Active',
        description: '🚀 Real system audio capture streaming via WebRTC'
      })
    } catch (error) {
      console.error('Failed to start audio stream:', error)
      toast({
        title: 'Audio Stream Failed',
        description: 'Failed to start system audio capture. Check permissions.',
        variant: 'destructive'
      })
    }
  }

  const createVirtualAudioStream = (): MediaStream => {
    // Create an AudioContext for native audio processing
    const audioContext = new AudioContext({ sampleRate: 48000 })
    const destination = audioContext.createMediaStreamDestination()

    // Store the audio context and destination for native audio processing
    ;(window as any).audioContext = audioContext
    ;(window as any).audioDestination = destination

    console.log('🎵 Native audio stream context created')
    console.log('- Sample rate:', audioContext.sampleRate)
    console.log('- Audio context state:', audioContext.state)

    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('🎵 Audio context resumed for native audio')
      })
    }

    return destination.stream
  }

  const processNativeAudioFrame = (audioFrame: {
    data: string
    timestamp: number
    format: any
  }) => {
    try {
      // Get the audio context and destination
      const audioContext = (window as any).audioContext
      const audioDestination = (window as any).audioDestination

      if (!audioContext || !audioDestination) {
        console.log('⚠️ Audio context not available for native audio processing')
        return
      }

      // Decode base64 PCM data
      const pcmData = atob(audioFrame.data)
      const samples = new Int16Array(pcmData.length / 2)

      // Convert binary string to Int16Array
      for (let i = 0; i < samples.length; i++) {
        const byte1 = pcmData.charCodeAt(i * 2)
        const byte2 = pcmData.charCodeAt(i * 2 + 1)
        samples[i] = (byte2 << 8) | byte1 // Little-endian 16-bit
      }

      // Convert to float32 for Web Audio API
      const floatSamples = new Float32Array(samples.length)
      for (let i = 0; i < samples.length; i++) {
        floatSamples[i] = samples[i] / 32768.0 // Normalize to [-1, 1]
      }

      // Create audio buffer
      const sampleRate = audioFrame.format?.sampleRate || 48000
      const channels = audioFrame.format?.channels || 2
      const samplesPerChannel = floatSamples.length / channels

      const audioBuffer = audioContext.createBuffer(channels, samplesPerChannel, sampleRate)

      // Fill audio buffer with native audio data
      if (channels === 1) {
        audioBuffer.copyToChannel(floatSamples, 0)
      } else if (channels === 2) {
        // De-interleave stereo audio
        const leftChannel = new Float32Array(samplesPerChannel)
        const rightChannel = new Float32Array(samplesPerChannel)

        for (let i = 0; i < samplesPerChannel; i++) {
          leftChannel[i] = floatSamples[i * 2]
          rightChannel[i] = floatSamples[i * 2 + 1]
        }

        audioBuffer.copyToChannel(leftChannel, 0)
        audioBuffer.copyToChannel(rightChannel, 1)
      }

      // Create buffer source and play it
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioDestination)
      source.start()

      // Log less frequently to avoid spam
      if (Math.random() < 0.01) {
        // Log ~1% of frames
        console.log(
          `📡 Processing native audio: ${samplesPerChannel} samples/channel, ${channels}ch, ${sampleRate}Hz`
        )
      }
    } catch (error) {
      console.error('❌ Error processing native audio frame:', error)
    }
  }

  const stopAudioStream = async () => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
        localStreamRef.current = null
      }

      // Close all active peer connections
      activeSessions.forEach((pc) => pc.close())
      activeSessions.clear()
      setActiveSessions(new Map())

      setIsStreaming(false)
      setConnectionState('closed')
      setICEConnectionState('closed')
      setConnectedPeers(0)
      setIsWaitingForConnection(false)

      await window.api.websocket.stopAudioStream()

      toast({
        title: 'Native Audio Stopped',
        description: 'System audio capture and WebRTC streaming stopped.'
      })
    } catch (error) {
      console.error('Failed to stop audio stream:', error)
      toast({
        title: 'Stop Failed',
        description: 'Failed to stop audio stream',
        variant: 'destructive'
      })
    }
  }

  const createPeerConnectionForSession = async (
    sessionId: string,
    offer: RTCSessionDescriptionInit
  ) => {
    try {
      const configuration: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      }

      const peerConnection = new RTCPeerConnection(configuration)

      // Add connection state listeners
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState as ConnectionState
        setConnectionState(state)
        console.log(`Session ${sessionId} connection state:`, state)

        if (state === 'connected') {
          setConnectedPeers(activeSessions.size)
          setIsWaitingForConnection(false)
          toast({
            title: 'WebRTC Connection Established',
            description: `Ultra-low latency streaming to website active!`
          })
        } else if (state === 'disconnected' || state === 'failed') {
          activeSessions.delete(sessionId)
          setActiveSessions(new Map(activeSessions))
          setConnectedPeers(activeSessions.size)
        }
      }

      peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState as ICEConnectionState
        setICEConnectionState(state)
        console.log(`Session ${sessionId} ICE connection state:`, state)
      }

      // Send ICE candidates via WebSocket
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log(`🧊 Sending ICE candidate for session ${sessionId}`)
          await window.api.websocket.sendMessage({
            type: 'ice-candidate',
            sessionId,
            data: event.candidate
          })
        }
      }

      // Add local audio stream
      if (localStreamRef.current) {
        const tracks = localStreamRef.current.getTracks()
        console.log(`Adding ${tracks.length} tracks to peer connection for session ${sessionId}`)
        tracks.forEach((track) => {
          peerConnection.addTrack(track, localStreamRef.current!)
        })
        console.log(`✅ Added audio tracks to peer connection`)
      }

      // Set remote description (offer)
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

      // Create and set local description (answer)
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      console.log(`Created answer for session ${sessionId}`)

      // Send answer back via WebSocket
      console.log(`Sending answer via WebSocket for session ${sessionId}`)
      await window.api.websocket.sendMessage({
        type: 'answer',
        sessionId,
        data: answer
      })

      // Store the peer connection
      activeSessions.set(sessionId, peerConnection)
      setActiveSessions(new Map(activeSessions))

      // Process any buffered ICE candidates
      const bufferedCandidates = iceCandidatesBuffer.current.get(sessionId)
      if (bufferedCandidates) {
        for (const candidate of bufferedCandidates) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (error) {
            console.error('Failed to add buffered ICE candidate:', error)
          }
        }
        iceCandidatesBuffer.current.delete(sessionId)
      }

      console.log(`WebRTC session ${sessionId} configured successfully`)
    } catch (error) {
      console.error(`Failed to create peer connection for session ${sessionId}:`, error)
      throw error
    }
  }

  const getConnectionStatusText = () => {
    if (!websocketConnected) {
      return (
        <span className="text-red-500 flex items-center gap-1">
          <WifiOff className="w-3 h-3" />
          Signaling Disconnected
        </span>
      )
    }

    if (!isStreaming) {
      return (
        <span className="text-gray-500 flex items-center gap-1">
          <WifiOff className="w-3 h-3" />
          Stopped
        </span>
      )
    }

    if (isWaitingForConnection && connectedPeers === 0) {
      return (
        <span className="text-yellow-500 flex items-center gap-1">
          <Radio className="w-3 h-3 animate-pulse" />
          Waiting for Connection
        </span>
      )
    }

    if (connectedPeers > 0) {
      return (
        <span className="text-green-500 flex items-center gap-1">
          <Antenna className="w-3 h-3" />
          Connected ({connectedPeers})
        </span>
      )
    }

    return (
      <span className="text-blue-500 flex items-center gap-1">
        <Wifi className="w-3 h-3" />
        Ready
      </span>
    )
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Mic className="w-5 h-5" />
              WebSocket Signaling Server
            </span>
            {getConnectionStatusText()}
          </CardTitle>
          <CardDescription>
            Native system audio streaming with WebSocket signaling - real-time system audio capture
            with ultra-low latency WebRTC
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={startAudioStream}
              disabled={isStreaming || !websocketConnected}
              className="flex items-center gap-2"
            >
              <Mic className="w-4 h-4" />
              Start Native Audio
            </Button>
            <Button
              onClick={stopAudioStream}
              disabled={!isStreaming}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <MicOff className="w-4 h-4" />
              Stop Native Audio
            </Button>
          </div>

          <div className="bg-muted p-3 rounded-lg space-y-2">
            <div className="text-sm font-medium">WebSocket Signaling Status:</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                🔗 Signaling Server: <code>ws://localhost:8080</code>
              </div>
              <div>📡 Protocol: WebSocket + WebRTC</div>
              <div>⚡ Latency: Ultra-low with reliable signaling</div>
              <div>🎯 Active Sessions: {activeSessions.size}</div>
              <div>💚 WebSocket: {websocketConnected ? 'Connected' : 'Disconnected'}</div>
              <div>🎵 Native Audio: {isStreaming ? 'Active' : 'Stopped'}</div>
            </div>
          </div>

          {websocketConnected && isStreaming && (
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
              <div className="text-sm font-medium text-green-800">
                ✅ Native System Audio Active
              </div>
              <div className="text-xs text-green-600 mt-1">
                Real-time system audio streaming to: <code>ws://localhost:8080</code>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            <div className="font-medium mb-1">How to connect from website:</div>
            <div>
              Connect to WebSocket: <code>ws://localhost:8080</code>
            </div>
            <div>Send identify message, then exchange WebRTC offers/answers via WebSocket</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
