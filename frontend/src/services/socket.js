import { io } from 'socket.io-client';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || apiBase.replace(/\/api\/?$/, '') || 'http://localhost:5000';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], autoConnect: false });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
