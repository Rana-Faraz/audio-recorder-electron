import { AudioRecorder } from '@/components/AudioRecorder'
import { Toaster } from '@/components/ui/toaster'

function App(): JSX.Element {
  return (
    <div className="min-h-screen w-full bg-background">
      <AudioRecorder />
      <Toaster />
    </div>
  )
}

export default App
