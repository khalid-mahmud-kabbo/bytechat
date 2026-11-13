import { io, type Socket } from 'socket.io-client';
import { useAuth } from './auth-store';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000', {
      // function form -> always sends the latest token on reconnect
      auth: (cb) => cb({ token: useAuth.getState().accessToken }),
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
