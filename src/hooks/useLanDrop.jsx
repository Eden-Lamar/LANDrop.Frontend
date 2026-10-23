// src/hooks/useLanDrop.js
import { useState, useEffect, useRef, useCallback } from 'react';

const ADJECTIVES = ['Cosmic', 'Quantum', 'Neon', 'Lunar', 'Solar', 'Astral', 'Crystal', 'Velvet'];
const ANIMALS = ['Fox', 'Owl', 'Panther', 'Dolphin', 'Tiger', 'Falcon', 'Wolf', 'Bear'];

function generateIdentity() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const id = 'device-' + Math.random().toString(36).substring(2, 10);
  
  // Use Dicebear for a cute, deterministic avatar based on the name
  const avatarUrl = `https://api.dicebear.com/10.x/adventurer/svg?seed=${adj}${animal}`;
  
  return { name: `${adj} ${animal}`, id, avatarUrl };
}

export function useLanDrop() {
	const [status, setStatus] = useState('disconnected'); // disconnected, connected, registered
	const [identity] = useState(() => generateIdentity());
	const [devices, setDevices] = useState([]);
  const [transferProgress, setTransferProgress] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [incomingClipboard, setIncomingClipboard] = useState(null);

	const ws = useRef(null);

  // WebRTC Refs
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const pendingFileRef = useRef(null);
  const incomingMetaRef = useRef(null);
  const receiveBufferRef = useRef([]);
  const receivedBytesRef = useRef(0);
  const startTimeRef = useRef(0);

  const cleanupWebRTC = useCallback(() => {
    if (dcRef.current) dcRef.current.close();
    if (pcRef.current) pcRef.current.close();
    pcRef.current = null;
    dcRef.current = null;
    receiveBufferRef.current = [];
    receivedBytesRef.current = 0;
  }, []);

  const sendFileChunks = useCallback((file) => {
    const chunkSize = 256 * 1024; // 256KB chunks for max throughput
    let offset = 0;
    let lastUiUpdate = 0;
    startTimeRef.current = Date.now();

    const pushNextChunk = async () => {
      while (offset < file.size) {
        // Lower buffer threshold to 1MB
        if (dcRef.current.bufferedAmount >= 1024 * 1024) {
          dcRef.current.onbufferedamountlow = () => {
            dcRef.current.onbufferedamountlow = null;
            pushNextChunk();
          };
          return;
        }
        
        try {
        const chunk = await file.slice(offset, offset + chunkSize).arrayBuffer();
        dcRef.current.send(chunk);
        offset += chunk.byteLength;
        
        const now = Date.now();
        // Throttle UI updates to every 250ms to prevent React thread freezing
        if (now - lastUiUpdate > 250 || offset === file.size) {
          const elapsed = (now - startTimeRef.current) / 1000;
          const speed = elapsed > 0 ? Math.round(offset / elapsed) : 0;
          const eta = speed > 0 ? Math.round((file.size - offset) / speed) : 0;
          
          setTransferProgress({
            status: 'transferring',
            percentage: parseFloat(((offset / file.size) * 100).toFixed(1)),
            transferred: offset,
            total: file.size,
            speed,
            eta
          });
          lastUiUpdate = now;
        }
      } catch (err) {
          // Catch the OperationError and pause gracefully instead of crashing
          if (err.name === 'OperationError') {
            dcRef.current.onbufferedamountlow = () => {
              dcRef.current.onbufferedamountlow = null;
              pushNextChunk();
            };
            return;
          }
          console.error("WebRTC send error:", err);
          return;
        }
      }
      
      const totalTime = Math.round((Date.now() - startTimeRef.current) / 1000);
      setTransferProgress(prev => ({ ...prev, status: 'completed', percentage: 100, totalTime }));
      // cleanupWebRTC();
    };
    
    pushNextChunk();
  }, []);

  // Initialize WebRTC connection
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
      dc.bufferedAmountLowThreshold = 1024 * 1024; // 1MB threshold
      dc.onopen = () => sendFileChunks(pendingFileRef.current.file);

      // Let the receiver dictate when it is safe to close
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
          
          const meta = incomingMetaRef.current;
          const now = Date.now();
          
          if (now - lastUiUpdate > 250 || receivedBytesRef.current === meta.size) {
            const elapsed = (now - startTimeRef.current) / 1000;
            const speed = elapsed > 0 ? Math.round(receivedBytesRef.current / elapsed) : 0;
            const eta = speed > 0 ? Math.round((meta.size - receivedBytesRef.current) / speed) : 0;
            
            setTransferProgress({
              status: 'transferring',
              percentage: parseFloat(((receivedBytesRef.current / meta.size) * 100).toFixed(1)),
              transferred: receivedBytesRef.current,
              total: meta.size,
              speed,
              eta
            });
            lastUiUpdate = now;
          }

          if (receivedBytesRef.current === meta.size) {
            const blob = new Blob(receiveBufferRef.current);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = meta.filename;
            a.click();
            URL.revokeObjectURL(url);
            
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
        incomingMetaRef.current = { filename: parsed.filename, size: parsed.size };
        setIncomingRequest(parsed);
      } else if (parsed.type === 'transfer:accepted') {
        if (pendingFileRef.current) initWebRTC(pendingFileRef.current.receiverId, true);
        // Tell the UI it is time to upload!
        // setAcceptedTransfer(parsed.transferId);
      } 
      else if (parsed.type === 'transfer:rejected') {
        console.log(`Transfer ${parsed.transferId} was declined.`);
        alert("The receiver declined your file.");
        pendingFileRef.current = null;
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
  const requestTransfer = useCallback((receiverId, file) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    pendingFileRef.current = { receiverId, file };
		// console.log("📤 Sending Transfer Request:", { receiverId, filename: file.name, size: file.size });

    ws.current.send(JSON.stringify({
      type: 'transfer:request',
      receiverId,
      filename: file.name,
      size: file.size
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
    sendClipboard
  };
}