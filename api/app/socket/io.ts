import type { Server } from 'socket.io';

let instance: Server | null = null;

export const setIo = (io: Server) => {
  instance = io;
};

export const getIo = (): Server => {
  if (!instance) throw new Error('Socket.IO is not initialised');
  return instance;
};
