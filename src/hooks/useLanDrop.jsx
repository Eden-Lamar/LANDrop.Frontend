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
  const [acceptedTransfer, setAcceptedTransfer] = useState(null);
  const [transferProgress, setTransferProgress] = useState(null);

	// State to track when someone wants to send us a file
  const [incomingRequest, setIncomingRequest] = useState(null);

	const ws = useRef(null);

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

		ws.current.onmessage = (event) => {
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
        setIncomingRequest(parsed);
      } else if (parsed.type === 'transfer:accepted') {
        console.log(`Transfer ${parsed.transferId} accepted! Preparing HTTP upload...`);
        // Tell the UI it is time to upload!
        setAcceptedTransfer(parsed.transferId);
      } 
      else if (parsed.type === 'transfer:rejected') {
        console.log(`Transfer ${parsed.transferId} was declined.`);
        alert("The receiver declined your file.");
      } else if (parsed.type === 'transfer:progress') {
        setTransferProgress({
          percentage: parsed.progress,
          speed: parsed.speed,
          transferred: parsed.transferredBytes,
          total: parsed.totalBytes
        });
      }
      // Handle completion or failure
      else if (['transfer:completed', 'transfer:failed', 'transfer:cancelled', 'transfer:corrupted'].includes(parsed.type)) {
        if (parsed.type !== 'transfer:completed') {
          alert(`Transfer stopped: ${parsed.type}`);
        }
        // Clear the progress bar after 1 second so the user can see it hit 100%
        setTimeout(() => setTransferProgress(null), 1000);
      }
		};
			
			

		return () => ws.current.close();
	}, [identity]);

	// Function to send a transfer request to another device
  const requestTransfer = useCallback((receiverId, file) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

		console.log("📤 Sending Transfer Request:", { receiverId, filename: file.name, size: file.size });
    
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
    acceptedTransfer,
    setAcceptedTransfer,
    transferProgress
  };
}