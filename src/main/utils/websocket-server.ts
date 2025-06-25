import { WebSocketServer, WebSocket } from 'ws'
import { EventEmitter } from 'events'

export interface SignalingMessage {
  type:
    | 'offer'
    | 'answer'
    | 'ice-candidate'
    | 'start-recording'
    | 'stop-recording'
    | 'client-connected'
    | 'client-disconnected'
    | 'identify'
  sessionId?: string
  data?: any
  clientType?: 'electron' | 'website'
}

interface Client {
  ws: WebSocket
  type: 'electron' | 'website'
  id: string
}

export class WebSocketSignalingServer extends EventEmitter {
  private wss: WebSocketServer
  private clients: Map<string, Client> = new Map()
  private electronClients: Map<string, Client> = new Map()
  private websiteClients: Map<string, Client> = new Map()
  private activeSessions: Map<string, { websiteId: string; electronId: string }> = new Map()

  constructor(port: number = 8080) {
    super()

    this.wss = new WebSocketServer({ port })
    console.log(`🔌 WebSocket Signaling Server starting on port ${port}`)

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req)
    })

    this.wss.on('listening', () => {
      console.log(`✅ WebSocket Signaling Server running on ws://localhost:${port}`)
      console.log(`📡 Ready for WebRTC signaling between website and Electron`)
      console.log(`🌐 Website: Connect to ws://localhost:${port}`)
      console.log(`⚡ Electron: Connect to ws://localhost:${port}`)
    })

    this.wss.on('error', (error) => {
      console.error('❌ WebSocket Server error:', error)
    })
  }

  private handleConnection(ws: WebSocket, req: any) {
    const clientId = this.generateClientId()
    console.log(`🔗 New WebSocket connection: ${clientId}`)

    // Send connection confirmation and request identification
    this.sendToClient(ws, {
      type: 'client-connected',
      data: { clientId, message: 'Please identify your client type' }
    })

    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message: SignalingMessage = JSON.parse(data.toString())
        this.handleMessage(ws, message, clientId)
      } catch (error) {
        console.error('❌ Failed to parse WebSocket message:', error)
      }
    })

    ws.on('close', () => {
      this.handleDisconnection(clientId)
    })

    ws.on('error', (error) => {
      console.error(`❌ WebSocket client ${clientId} error:`, error)
    })
  }

  private handleMessage(ws: WebSocket, message: SignalingMessage, clientId: string) {
    console.log(`📨 Received ${message.type} from client ${clientId}`)

    switch (message.type) {
      case 'identify':
        this.handleIdentify(ws, message, clientId)
        break

      case 'offer':
        this.handleOffer(message, clientId)
        break

      case 'answer':
        this.handleAnswer(message, clientId)
        break

      case 'ice-candidate':
        this.handleIceCandidate(message, clientId)
        break

      case 'start-recording':
        this.handleStartRecording(message, clientId)
        break

      case 'stop-recording':
        this.handleStopRecording(message, clientId)
        break

      default:
        console.log(`⚠️  Unknown message type: ${message.type}`)
    }
  }

  private handleIdentify(ws: WebSocket, message: SignalingMessage, clientId: string) {
    const clientType = message.clientType!
    console.log(`🏷️  Client ${clientId} identified as: ${clientType}`)

    const client: Client = {
      ws,
      type: clientType,
      id: clientId
    }

    this.clients.set(clientId, client)

    if (clientType === 'electron') {
      this.electronClients.set(clientId, client)
      console.log(`⚡ Electron client registered: ${clientId}`)
    } else if (clientType === 'website') {
      this.websiteClients.set(clientId, client)
      console.log(`🌐 Website client registered: ${clientId}`)
    }

    // Send confirmation
    this.sendToClient(ws, {
      type: 'client-connected',
      data: {
        clientId,
        clientType,
        message: `${clientType} client registered successfully`,
        stats: this.getStats()
      }
    })

    // Notify other clients
    this.broadcastStats()
  }

  private handleOffer(message: SignalingMessage, fromClientId: string) {
    const fromClient = this.clients.get(fromClientId)
    if (!fromClient || fromClient.type !== 'website') {
      console.log('❌ Offer must come from website client')
      return
    }

    // Use session ID from website's offer, or create new one if not provided
    const sessionId = message.sessionId || this.generateSessionId()
    message.sessionId = sessionId

    console.log(`📤 Using session ${sessionId} for offer from website ${fromClientId}`)

    // Find an available Electron client
    const electronClient = Array.from(this.electronClients.values())[0] // Use first available
    if (!electronClient) {
      console.log('❌ No Electron clients available')
      this.sendToClient(fromClient.ws, {
        type: 'client-disconnected',
        data: { error: 'No Electron app connected' }
      })
      return
    }

    // Store session
    this.activeSessions.set(sessionId, {
      websiteId: fromClientId,
      electronId: electronClient.id
    })

    console.log(`📤 Forwarding offer to Electron ${electronClient.id}`)
    this.sendToClient(electronClient.ws, message)

    // Tell Electron to start recording
    this.sendToClient(electronClient.ws, {
      type: 'start-recording',
      sessionId,
      data: { sessionId }
    })
  }

  private handleAnswer(message: SignalingMessage, fromClientId: string) {
    const fromClient = this.clients.get(fromClientId)
    if (!fromClient || fromClient.type !== 'electron') {
      console.log('❌ Answer must come from Electron client')
      return
    }

    const session = this.activeSessions.get(message.sessionId!)
    if (!session) {
      console.log(`❌ No session found for answer: ${message.sessionId}`)
      return
    }

    const websiteClient = this.clients.get(session.websiteId)
    if (!websiteClient) {
      console.log(`❌ Website client not found: ${session.websiteId}`)
      return
    }

    console.log(
      `📤 Forwarding answer from Electron ${fromClientId} to website ${session.websiteId}`
    )
    this.sendToClient(websiteClient.ws, message)
  }

  private handleIceCandidate(message: SignalingMessage, fromClientId: string) {
    const session = this.activeSessions.get(message.sessionId!)
    if (!session) {
      console.log(`❌ No session found for ICE candidate: ${message.sessionId}`)
      return
    }

    const fromClient = this.clients.get(fromClientId)
    if (!fromClient) {
      console.log(`❌ Client not found: ${fromClientId}`)
      return
    }

    if (fromClient.type === 'electron') {
      // Forward ICE candidate from Electron to website
      const websiteClient = this.clients.get(session.websiteId)
      if (websiteClient) {
        console.log(`🧊 Forwarding ICE candidate from Electron to website`)
        this.sendToClient(websiteClient.ws, message)
      }
    } else if (fromClient.type === 'website') {
      // Forward ICE candidate from website to Electron
      const electronClient = this.clients.get(session.electronId)
      if (electronClient) {
        console.log(`🧊 Forwarding ICE candidate from website to Electron`)
        this.sendToClient(electronClient.ws, message)
      }
    }
  }

  private handleStartRecording(message: SignalingMessage, fromClientId: string) {
    console.log(`🎙️  Start recording requested by client ${fromClientId}`)
    // This could be forwarded to Electron clients if needed
    this.emit('start-recording', { sessionId: message.sessionId, clientId: fromClientId })
  }

  private handleStopRecording(message: SignalingMessage, fromClientId: string) {
    console.log(`🛑 Stop recording requested by client ${fromClientId}`)

    // Clean up session if it exists
    if (message.sessionId) {
      this.activeSessions.delete(message.sessionId)
    }

    this.emit('stop-recording', { sessionId: message.sessionId, clientId: fromClientId })
  }

  private handleDisconnection(clientId: string) {
    const client = this.clients.get(clientId)
    if (!client) return

    console.log(`🔌 Client disconnected: ${client.type} ${clientId}`)

    // Remove from all maps
    this.clients.delete(clientId)
    this.electronClients.delete(clientId)
    this.websiteClients.delete(clientId)

    // Clean up sessions involving this client
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.websiteId === clientId || session.electronId === clientId) {
        console.log(`🧹 Cleaning up session ${sessionId} due to client disconnect`)
        this.activeSessions.delete(sessionId)

        // Notify the other client in the session
        const otherClientId =
          session.websiteId === clientId ? session.electronId : session.websiteId
        const otherClient = this.clients.get(otherClientId)
        if (otherClient) {
          this.sendToClient(otherClient.ws, {
            type: 'client-disconnected',
            sessionId,
            data: { reason: 'Other client disconnected' }
          })
        }
      }
    }

    // Broadcast updated stats
    this.broadcastStats()
  }

  private sendToClient(ws: WebSocket, message: SignalingMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  private broadcastStats() {
    const stats = this.getStats()
    const statsMessage: SignalingMessage = {
      type: 'client-connected',
      data: { stats }
    }

    this.clients.forEach((client) => {
      this.sendToClient(client.ws, statsMessage)
    })
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15)
  }

  // Get server stats
  getStats() {
    return {
      totalClients: this.clients.size,
      electronClients: this.electronClients.size,
      websiteClients: this.websiteClients.size,
      activeSessions: this.activeSessions.size,
      uptime: process.uptime()
    }
  }

  // Cleanup
  close() {
    console.log('🔌 Closing WebSocket Signaling Server')
    this.wss.close()
  }
}
