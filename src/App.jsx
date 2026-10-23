import { useState, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Send, File, Activity, CheckCircle, X } from 'lucide-react';
import { useLanDrop } from '@/hooks/useLanDrop';
import { Progress } from "@/components/ui/progress";

// Helper function to format bytes into a human-readable string
function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Helper function to format time in seconds into a human-readable string
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function App() {
  const { status, identity, devices, requestTransfer, incomingRequest, setIncomingRequest, respondToTransfer, transferProgress, setTransferProgress } = useLanDrop();
  // State for the modal
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Filter out our own device
  const otherDevices = devices.filter(d => d.id !== identity.id);


  const handleSendRequest = () => {
    if (!file || !selectedDevice) return;
    
    // Fire the WebSocket message to the backend
    requestTransfer(selectedDevice.id, file);
    
    // Clear the UI state and close the modal
    setSelectedDevice(null);
    setFile(null)
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-100 overflow-hidden">
      
      {/* Header */}
      <header className="p-6 flex items-center justify-between z-10">
        <h1 className="text-xl font-bold tracking-widest text-zinc-300">LanDrop</h1>
        <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/50">
          {status === 'registered' ? 'Scanning...' : 'Connecting...'}
        </Badge>
      </header>

      {/* Radar Area */}
      <main className="flex-1 flex items-center justify-center relative">
        
        <div className="radar-container">
          {/* Pulsing Rings */}
          <div className="radar-ring"></div>
          <div className="radar-ring"></div>
          <div className="radar-ring"></div>

          {/* Central User Profile */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-900 shadow-2xl flex items-center justify-center overflow-hidden">
              <img src={identity.avatarUrl} alt="avatar" className="w-16 h-16" />
            </div>
            <div className="mt-4 flex flex-col items-center text-center">
              <p className="text-sm text-zinc-400">You are known as</p>
              <p className="text-lg font-medium text-white">{identity.name}</p>
            </div>
          </div>

          {/* Orbiting Devices */}
          {otherDevices.map((device, index) => {
            // Calculate position in a circle (radius = 160px)
            const angle = (index / (otherDevices.length || 1)) * (2 * Math.PI) - (Math.PI / 2);
            const radius = 240;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            return (
              <button
                key={device.id}
                className="absolute z-20 flex flex-col items-center group transition-transform hover:scale-102 cursor-pointer"
                style={{ transform: `translate(${x}px, ${y}px)` }}
                onClick={() => setSelectedDevice(device)}
              >
                <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center overflow-hidden group-hover:border-blue-500 transition-all shadow-lg group-hover:shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                  <img 
                    src={`https://api.dicebear.com/10.x/adventurer/svg?seed=${device.name.replace(' ', '')}`} 
                    alt={device.name} 
                    className="w-10 h-10 group-hover:scale-102 transition-transform" 
                  />
                </div>
                <div className="mt-2 text-center">
                  <p className="text-sm font-medium text-zinc-200">{device.name}</p>
                  <p className="text-xs text-zinc-500">{device.ip_address}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Empty State Text */}
        {otherDevices.length === 0 && (
          <div className="absolute bottom-24 text-center text-zinc-500 animate-pulse">
            Open LanDrop on other devices to send files
          </div>
        )}

        {/* Floating Progress Panel */}
        {transferProgress && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#121212] border border-zinc-800 rounded-2xl p-5 shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-full ${transferProgress.status === 'completed' ? 'bg-green-500/20' : 'bg-blue-600/20'}`}>
                  {transferProgress.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Activity className="w-5 h-5 text-blue-500 animate-pulse" />
                  )}
                </div>
                <div>
                  <h4 className="text-zinc-100 font-medium tracking-wide">
                    {transferProgress.status === 'completed' ? 'Transfer Complete' : 'Transferring...'}
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {formatBytes(transferProgress.transferred)} / {formatBytes(transferProgress.total)}
                  </p>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <span className={`${transferProgress.status === 'completed' ? 'text-green-500' : 'text-blue-500'} font-bold text-lg`}>
                  {transferProgress.percentage}%
                </span>
                {transferProgress.status === 'completed' ? (
                  <p className="text-xs text-zinc-500">Took {formatTime(transferProgress.totalTime)}</p>
                ) : (
                  <p className="text-xs text-zinc-500">
                    {formatBytes(transferProgress.speed)}/s • {formatTime(transferProgress.eta)} left
                  </p>
                )}
              </div>
            </div>
            <Progress 
              value={transferProgress.percentage} 
              className={`h-2 bg-zinc-800 ${transferProgress.status === 'completed' ? '[&>div]:bg-green-500' : '[&>div]:bg-blue-600'}`} 
            />
            
            {transferProgress.status === 'completed' && (
              <button 
                onClick={() => setTransferProgress(null)}
                className="absolute -top-3 -right-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 rounded-full p-1.5 transition-colors shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        
      </main>

      {/* File Transfer Modal */}
      <Dialog open={!!selectedDevice} onOpenChange={(open) => {
        if (!open) {
          setSelectedDevice(null);
          setFile(null);
        }
      }}>
        <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Send to <span className="font-semibold text-blue-400">{selectedDevice?.name}</span></DialogTitle>
            <DialogDescription className="text-zinc-400">
              Select a file from your device to transfer securely over the network.
            </DialogDescription>
          </DialogHeader>
          
          {/* Custom Drag & Drop Zone */}
          <div className="py-4">
            <div 
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                isDragging 
                  ? 'border-blue-500 bg-blue-500/10' 
                  : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-800/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  setFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              
              {!file ? (
                <>
                  <div className="relative mb-4">
                    <div className="absolute inset-0 bg-zinc-700/50 rounded-xl transform scale-110 -rotate-12"></div>
                    <div className="absolute inset-0 bg-zinc-600/50 rounded-xl transform scale-105 rotate-3"></div>
                    <div className="relative bg-zinc-800 p-4 rounded-xl shadow-lg ">
                      <File className="w-8 h-8 text-zinc-300" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-100">Upload files</h3>
                  <p className="text-sm text-zinc-400 mt-1">Drag & drop or click to browse.</p>
                  <p className="text-xs text-zinc-600 mt-3">Any file format or size supported</p>
                </>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <div className="bg-blue-500/20 p-4 rounded-full">
                    <File className="w-10 h-10 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-200 max-w-62.5 truncate" title={file.name}>{file.name}</p>
                    <p className="text-sm text-zinc-500">{formatBytes(file.size)}</p>
                  </div>
                  <p className="text-xs text-blue-400 mt-2 hover:underline">Click to change file</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button 
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => setSelectedDevice(null)}
            >
              Cancel
            </Button>
            <Button 
              disabled={!file} 
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:bg-zinc-800 disabled:text-zinc-500"
              onClick={handleSendRequest}
            >
              <Send className="w-4 h-4 mr-2" />
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Incoming Transfer Modal */}
          <Dialog open={!!incomingRequest} onOpenChange={(open) => {
            if (!open) setIncomingRequest(null);
          }}>
            <DialogContent className="sm:max-w-md bg-[#0a0a0a] border-zinc-800 text-zinc-100 shadow-2xl">
              <DialogHeader>
                <DialogTitle>Incoming File Transfer</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  <span className="font-semibold text-blue-400">
                    {devices.find(d => d.id === incomingRequest?.senderId)?.name || 'A device'}
                  </span> wants to send you a file.
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-6 flex flex-col items-center justify-center space-y-4 bg-zinc-900/30 rounded-xl border border-zinc-800">
                <div className="bg-blue-500/20 p-4 rounded-full">
                  <File className="w-10 h-10 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-zinc-200 max-w-62.5 truncate" title={incomingRequest?.filename}>
                    {incomingRequest?.filename}
                  </p>
                  {/* Reuse our formatBytes utility here! */}
                  <p className="text-sm text-zinc-500">
                    {incomingRequest?.size ? formatBytes(incomingRequest.size) : ''}
                  </p>
                </div>
              </div>

              <DialogFooter className="sm:justify-between">
                <Button 
                  className="bg-red-500 hover:bg-red-600 text-white"
                  onClick={() => {
                    respondToTransfer(incomingRequest.transferId, false);
                    setIncomingRequest(null);
                  }}
                >
                  Decline
                </Button>
                
                <Button 
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    // 1. Tell the backend we accept
                    respondToTransfer(incomingRequest.transferId, true);
                    // 2. Close the modal
                    setIncomingRequest(null);
                  }}
                >
                  Accept File
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
    </div>
  );
}

export default App
