// src/hooks/useLanDrop.js
import { useState, useEffect, useRef, useCallback } from 'react';

export function useLanDrop() {
	const [status, setStatus] = useState('disconnected'); // disconnected, connected, registered
	const [myId, setMyId] = useState(null);
	const [devices, setDevices] = useState([]);
	const ws = useRef(null);

	useEffect(() => {
		// Connect to your Fastify backend
		ws.current = new WebSocket('ws://localhost:3000/ws');

		ws.current.onopen = () => setStatus('connected');
		ws.current.onclose = () => setStatus('disconnected');

		ws.current.onmessage = (event) => {
			const parsed = JSON.parse(event.data);

			if (parsed.type === 'registered') {
				setStatus('registered');
				setMyId(parsed.id);
			} else if (parsed.type === 'device-list') {
				setDevices(parsed.devices);
			}
			// We will add transfer listeners here next!
		};

		return () => ws.current.close();
	}, []);

	const registerDevice = useCallback((deviceName) => {
		if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

		// Generate a random 12-character ID for this session
		const id = 'device-' + Math.random().toString(36).substring(2, 10);
		ws.current.send(JSON.stringify({ type: 'register', id, name: deviceName }));
	}, []);

	return { status, myId, devices, registerDevice };
}