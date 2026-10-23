// src/hooks/useLanDrop.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { uniqueNamesGenerator, animals } from 'unique-names-generator';

// Custom space/astrology dictionary
const spaceWords = [
  'Cosmic', 'Lunar', 'Solar', 'Astral', 'Stellar', 'Celestial', 
  'Nebula', 'Nova', 'Pulsar', 'Quasar', 'Eclipse', 'Comet', 
  'Eclipse', 'Aurora', 'Zodiac', 'Orion', 'Apollo', 'Meteor'
];

function generateIdentity() {
  const name = uniqueNamesGenerator({
    dictionaries: [spaceWords, animals],
    separator: ' ',
    style: 'capital'
  });
  
  const id = 'device-' + Math.random().toString(36).substring(2, 10);
  // Remove spaces from the name for a cleaner seed URL
  const avatarUrl = `https://api.dicebear.com/10.x/adventurer/svg?seed=${name.replace(/\s+/g, '')}`;
  
  return { name, id, avatarUrl };
}

export function useLanDrop() {
	const [status, setStatus] = useState('disconnected'); // disconnected, connected, registered
	const [identity] = useState(() => generateIdentity());
	const [devices, setDevices] = useState([]);
  const [transferProgress, setTransferProgress] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [incomingClipboard, setIncomingClipboard] = useState(null);
  const [declinedTransfer, setDeclinedTransfer] = useState(null);

	const ws = useRef(null);

  // WebRTC Refs
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const pendingFileRef = useRef(null);
  const incomingMetaRef = useRef(null);
  const receiveBufferRef = useRef([]);
  const receivedBytesRef = useRef(0);
  const startTimeRef = useRef(0);
  // Track the internal boundaries of the current file
  const currentFileBytesRef = useRef(0); 
  const currentFileIndexRef = useRef(0);

  const cleanupWebRTC = useCallback(() => {
    if (dcRef.current) dcRef.current.close();
    if (pcRef.current) pcRef.current.close();
    pcRef.current = null;
    dcRef.current = null;
    receiveBufferRef.current = [];
    receivedBytesRef.current = 0;
    currentFileBytesRef.current = 0; // Reset
    currentFileIndexRef.current = 0; // Reset
  }, []);

  const sendFileChunks = useCallback((files = []) => {
    if (!files || files.length === 0) return;
    const chunkSize = 64 * 1024; 
    let fileIndex = 0;
    let fileOffset = 0;
    let globalOffset = 0;
    let lastUiUpdate = 0;
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    startTimeRef.current = Date.now();

    const pushNextChunk = async () => {
      while (fileIndex < files.length) {
        const currentFile = files[fileIndex];

        if (dcRef.current.bufferedAmount >= 1024 * 1024) {
          dcRef.current.onbufferedamountlow = () => {
            dcRef.current.onbufferedamountlow = null;
            pushNextChunk();
          };
          return;
        }
        
        try {
          const chunk = await currentFile.slice(fileOffset, fileOffset + chunkSize).arrayBuffer();
          dcRef.current.send(chunk);
          
          fileOffset += chunk.byteLength;
          globalOffset += chunk.byteLength;
          
          const now = Date.now();
          if (now - lastUiUpdate > 250 || globalOffset === totalSize) {
            const elapsed = (now - startTimeRef.current) / 1000;
            const speed = elapsed > 0 ? Math.round(globalOffset / elapsed) : 0;
            const eta = speed > 0 ? Math.round((totalSize - globalOffset) / speed) : 0;
            
            setTransferProgress({
              status: 'transferring',
              percentage: parseFloat(((globalOffset / totalSize) * 100).toFixed(1)),
              transferred: globalOffset,
              total: totalSize,
              speed,
              eta,
              currentFileName: currentFile.name 
            });
            lastUiUpdate = now;
          }

          if (fileOffset >= currentFile.size) {
            fileIndex++; 
            fileOffset = 0;
          }
        } catch (err) {
          if (err.name === 'OperationError') {
            dcRef.current.onbufferedamountlow = () => {
              dcRef.current.onbufferedamountlow = null;
              pushNextChunk();
            };
            return;
          }
          return;
        }
      }
      
      const totalTime = Math.round((Date.now() - startTimeRef.current) / 1000);
      setTransferProgress(prev => ({ ...prev, status: 'completed', percentage: 100, totalTime }));
    };
    
    pushNextChunk();
  }, []);

  const initWebRTC = useCallback(async (targetId, isSender) => {
    cleanupWebRTC();
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'webrtc:ice-candidate', targetId, payload: event.candidate }));
      }
    };

    if (isSender) {
      const dc = pc.createDataChannel('fileTransfer');
      dcRef.current = dc;
      dc.bufferedAmountLowThreshold = 256 * 1024; 
      dc.onopen = () => sendFileChunks(pendingFileRef.current.files);
      
      dc.onclose = () => cleanupWebRTC(); 
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.current.send(JSON.stringify({ type: 'webrtc:offer', targetId, payload: offer }));
    } else {
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dcRef.current = dc;
        dc.binaryType = 'arraybuffer';
        startTimeRef.current = Date.now();
        let lastUiUpdate = 0;
        
        dc.onmessage = (e) => {
          receiveBufferRef.current.push(e.data);
          receivedBytesRef.current += e.data.byteLength;
          currentFileBytesRef.current += e.data.byteLength; 
          
          // 🟢 Restored the missing meta variable and added safety checks
          const meta = incomingMetaRef.current;
          if (!meta || !meta.files) return;
          
          const currentFile = meta.files[currentFileIndexRef.current];
          if (!currentFile) return;

          const now = Date.now();
          
          if (now - lastUiUpdate > 250 || receivedBytesRef.current === meta.totalSize) {
            const elapsed = (now - startTimeRef.current) / 1000;
            const speed = elapsed > 0 ? Math.round(receivedBytesRef.current / elapsed) : 0;
            const eta = speed > 0 ? Math.round((meta.totalSize - receivedBytesRef.current) / speed) : 0;
            
            setTransferProgress({
              status: 'transferring',
              percentage: parseFloat(((receivedBytesRef.current / meta.totalSize) * 100).toFixed(1)),
              transferred: receivedBytesRef.current,
              total: meta.totalSize,
              speed,
              eta,
              currentFileName: currentFile.name
            });
            lastUiUpdate = now;
          }

          if (currentFileBytesRef.current === currentFile.size) {
            const blob = new Blob(receiveBufferRef.current);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentFile.name;
            a.click();
            URL.revokeObjectURL(url);
            
            receiveBufferRef.current = [];
            currentFileBytesRef.current = 0;
            currentFileIndexRef.current++; 
          }

          if (receivedBytesRef.current === meta.totalSize) {
            const totalTime = Math.round((Date.now() - startTimeRef.current) / 1000);
            setTransferProgress(prev => ({ ...prev, status: 'completed', percentage: 100, totalTime }));
            cleanupWebRTC();
          }
        };
      };
    }
  }, [cleanupWebRTC, sendFileChunks]);

	useEffect(() => {
		// Connect to your Fastify backend
		ws.current = new WebSocket('ws://localhost:3000/ws');

		ws.current.onopen = () => {
      setStatus('connected');
      // Auto-register immediately using the generated identity
      ws.current.send(JSON.stringify({ 
        type: 'register', 
        id: identity.id, 
        name: identity.name 
      }));
    };
		
		ws.current.onclose = () => setStatus('disconnected');

		ws.current.onmessage = async (event) => {
			const parsed = JSON.parse(event.data);

			// Print everything the server sends us
      console.log("📥 WS Received:", parsed);
      if (parsed.type === 'error') {
        console.error("BACKEND ERROR:", parsed.message);
      }

			if (parsed.type === 'registered') {
				setStatus('registered');
				// setMyId(parsed.id);
			} else if (parsed.type === 'device-list') {
				setDevices(parsed.devices);
			} else if (parsed.type === 'transfer:request') { // Listen for incoming file transfer requests
        incomingMetaRef.current = { files: parsed.files, totalSize: parsed.totalSize };
        setIncomingRequest(parsed);
      } else if (parsed.type === 'transfer:accepted') {
        if (pendingFileRef.current) initWebRTC(pendingFileRef.current.receiverId, true);
        // Tell the UI it is time to upload!
        // setAcceptedTransfer(parsed.transferId);
      } 
      else if (parsed.type === 'transfer:rejected') {
        console.log(`Transfer ${parsed.transferId} was declined.`);
        if (pendingFileRef.current) {
          // Set the receiver's ID in state and auto-clear it after 4 seconds
          setDeclinedTransfer(pendingFileRef.current.receiverId);
          pendingFileRef.current = null;
        }
      } // WebRTC Signaling Handlers
      else if (parsed.type === 'webrtc:offer') {
        await initWebRTC(parsed.senderId, false);
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(parsed.payload));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        ws.current.send(JSON.stringify({ type: 'webrtc:answer', targetId: parsed.senderId, payload: pcRef.current.localDescription }));
      }
      else if (parsed.type === 'webrtc:answer' && pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(parsed.payload));
      }
      else if (parsed.type === 'webrtc:ice-candidate' && pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(parsed.payload));
      } else if (parsed.type === 'clipboard:receive') {
        setIncomingClipboard(parsed);
      }
      else if (parsed.type === 'clipboard:sent') {
        console.log(`✅ Text delivered to ${parsed.receiverId}`);
      }
    };	

		return () => ws.current.close();
	}, [identity, initWebRTC]);

    // Emit the clipboard payload to the backend
  const sendClipboard = useCallback((receiverId, content) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({ type: 'clipboard:send', receiverId, content }));
  }, []);

	// Function to send a transfer request to another device
  const requestTransfer = useCallback((receiverId, files) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    pendingFileRef.current = { receiverId, files: files }; // Save array
		// console.log("📤 Sending Transfer Request:", { receiverId, filename: file.name, size: file.size });
    
    const payloadFiles = files.map(f => ({ name: f.name, size: f.size }));

    ws.current.send(JSON.stringify({
      type: 'transfer:request',
      receiverId,
      files: payloadFiles
    }));
  }, []);

  // Receiver responds to the incoming request
  const respondToTransfer = useCallback((transferId, accepted) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    
    ws.current.send(JSON.stringify({
      type: accepted ? 'transfer:accept' : 'transfer:reject',
      transferId
    }));
  }, []);

	return { 
    status, 
    identity, 
    devices, 
    requestTransfer, 
    incomingRequest, 
    setIncomingRequest, 
    respondToTransfer,
    transferProgress,
    setTransferProgress,
    incomingClipboard,
    setIncomingClipboard,
    sendClipboard,
    declinedTransfer,
    setDeclinedTransfer
  };
}