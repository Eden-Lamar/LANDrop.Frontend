import { useState } from 'react';
import { useLanDrop } from '@/hooks/useLanDrop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Laptop } from 'lucide-react'; // Lucide icons come with shadcn
import './App.css'

function App() {
const { status, myId, devices, registerDevice } = useLanDrop();
  const [deviceName, setDeviceName] = useState('');

  if (status === 'disconnected') {
    return <div className="flex h-screen items-center justify-center">Connecting to server...</div>;
  }

  if (status === 'connected') {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <Card className="w-96 shadow-lg">
          <CardHeader>
            <CardTitle>Welcome to LanDrop</CardTitle>
            <CardDescription>Enter a name to make your device discoverable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              placeholder="e.g. My MacBook Pro" 
              value={deviceName} 
              onChange={(e) => setDeviceName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && registerDevice(deviceName)}
            />
            <Button className="w-full" onClick={() => registerDevice(deviceName)}>
              Join Network
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main Dashboard (Status === 'registered')
  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">LanDrop Network</h1>
          <Badge variant="secondary">My ID: {myId}</Badge>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {devices.map((device) => {
            // Don't show ourselves in the list of "other" devices
            if (device.id === myId) return null;

            return (
              <Card key={device.id} className="hover:border-zinc-400 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg font-medium">{device.name}</CardTitle>
                  <Laptop className="h-5 w-5 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-500">{device.ip_address}</p>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline">Send File</Button>
                    <Button size="sm" variant="outline">Send Clipboard</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          
          {devices.length <= 1 && (
            <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed rounded-lg">
              Waiting for other devices to join the network...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App
