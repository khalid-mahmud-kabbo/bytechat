import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { z, ZodError } from 'zod';
import { clientOrigins } from '../config/env';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { acceptCall, endCall, endCallsForUser, relaySignal, startCall } from '../modules/calls/calls.service';
import {
  deleteMessage,
  editMessage,
  markDeliveredForUser,
  markRead,
  reactToMessage,
  sendMessage,
} from '../modules/messages/messages.service';
import { broadcastPresence, emitToUsers, getMemberIds } from './emit';
import { setIo } from './io';

// userId -> open socket count (one user can have web + phone online together).
// Move this to Redis (+ socket.io redis adapter) when you run more than one server instance.
const connections = new Map<string, number>();

type Ack = (res: { ok: true; data?: unknown } | { ok: false; error: string }) => void;

function handle(socket: Socket, event: string, fn: (data: unknown) => Promise<unknown>) {
  socket.on(event, async (data: unknown, ack?: Ack) => {
    try {
      const result = await fn(data);
      ack?.({ ok: true, data: result });
    } catch (err) {
      let message = 'Server error';
      if (err instanceof ApiError) message = err.message;
      else if (err instanceof ZodError) message = 'Invalid data';
      else console.error(`[socket:${event}]`, err);
      ack?.({ ok: false, error: message });
    }
  });
}

export function initSocket(server: HttpServer) {
  const io = new Server(server, { cors: { origin: clientOrigins, credentials: true } });
  setIo(io);

  io.use(async (socket, next) => {
    try {
      const id = verifyAccessToken(String(socket.handshake.auth?.token ?? ''));
      const user = await prisma.user.findUnique({ where: { id }, select: { isBanned: true } });
      if (!user || user.isBanned) return next(new Error('unauthorized'));
      socket.data.userId = id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`); // every device of a user joins one personal room

    const count = (connections.get(userId) ?? 0) + 1;
    connections.set(userId, count);
    if (count === 1) {
      await prisma.user.update({ where: { id: userId }, data: { isOnline: true } }).catch(() => {});
      broadcastPresence(userId, true, null).catch(() => {});
    }
    // everything sent while this user was offline is now "delivered"
    markDeliveredForUser(userId).catch((e) => console.error('[deliver]', e));

    // ---- chat ----
    handle(socket, 'message:send', (d) => sendMessage(userId, d));
    handle(socket, 'chat:read', async (d) => {
      const { chatId } = z.object({ chatId: z.string() }).parse(d);
      await markRead(userId, chatId);
    });
    handle(socket, 'message:edit', (d) => editMessage(userId, d));
    handle(socket, 'message:delete', (d) => deleteMessage(userId, d));
    handle(socket, 'message:react', (d) => reactToMessage(userId, d));
    handle(socket, 'typing', async (d) => {
      const { chatId, isTyping } = z.object({ chatId: z.string(), isTyping: z.boolean() }).parse(d);
      const ids = await getMemberIds(chatId);
      if (!ids.includes(userId)) return;
      emitToUsers(
        ids.filter((id) => id !== userId),
        'typing',
        { chatId, userId, isTyping },
      );
    });

    // ---- calls (1-to-1 WebRTC signalling) ----
    handle(socket, 'call:start', (d) => startCall(userId, d));
    handle(socket, 'call:accept', (d) => acceptCall(userId, d));
    handle(socket, 'call:end', (d) => endCall(userId, d));
    handle(socket, 'call:signal', (d) => relaySignal(userId, d));

    socket.on('disconnect', async () => {
      const left = (connections.get(userId) ?? 1) - 1;
      if (left > 0) {
        connections.set(userId, left);
        return;
      }
      connections.delete(userId);
      endCallsForUser(userId).catch(() => {});
      const lastSeenAt = new Date();
      await prisma.user.update({ where: { id: userId }, data: { isOnline: false, lastSeenAt } }).catch(() => {});
      broadcastPresence(userId, false, lastSeenAt).catch(() => {});
    });
  });
}
