import { prisma } from '../lib/prisma';
import { messageStatus, type MessageStatus } from '../lib/serializers';
import { getIo } from './io';

// chatId -> member ids. Cached because typing events are very frequent.
const memberCache = new Map<string, { ids: string[]; at: number }>();
const TTL_MS = 30_000;

export async function getMemberIds(chatId: string): Promise<string[]> {
  const hit = memberCache.get(chatId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  const rows = await prisma.chatMember.findMany({ where: { chatId, leftAt: null }, select: { userId: true } });
  const ids = rows.map((r) => r.userId);
  memberCache.set(chatId, { ids, at: Date.now() });
  return ids;
}

export const invalidateMembers = (chatId: string) => {
  memberCache.delete(chatId);
};

export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  if (userIds.length === 0) return;
  getIo()
    .to(userIds.map((id) => `user:${id}`))
    .emit(event, payload);
}

export async function emitToChat(chatId: string, event: string, payload: unknown, exceptUserId?: string) {
  const ids = (await getMemberIds(chatId)).filter((id) => id !== exceptUserId);
  emitToUsers(ids, event, payload);
}

export async function isOnline(userId: string): Promise<boolean> {
  return (await getIo().in(`user:${userId}`).fetchSockets()).length > 0;
}

/** Tell every sender that the delivery/read status of their messages changed. */
export async function emitStatuses(messageIds: string[]) {
  if (messageIds.length === 0) return;
  const msgs = await prisma.message.findMany({
    where: { id: { in: messageIds } },
    select: { id: true, chatId: true, senderId: true, receipts: { select: { deliveredAt: true, readAt: true } } },
  });
  const bySender = new Map<string, { id: string; chatId: string; status: MessageStatus }[]>();
  for (const m of msgs) {
    const list = bySender.get(m.senderId) ?? [];
    list.push({ id: m.id, chatId: m.chatId, status: messageStatus(m) });
    bySender.set(m.senderId, list);
  }
  for (const [senderId, updates] of bySender) emitToUsers([senderId], 'message:status', { updates });
}

export async function broadcastPresence(userId: string, online: boolean, lastSeenAt: Date | null) {
  const peers = await prisma.chatMember.findMany({
    where: {
      userId: { not: userId },
      leftAt: null,
      chat: { members: { some: { userId, leftAt: null } } },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  emitToUsers(
    peers.map((p) => p.userId),
    'presence:update',
    { userId, isOnline: online, lastSeenAt },
  );
}

/** Ask members' clients to refetch this chat (new member, rename, removed...). */
export async function notifyChatUpdated(chatId: string, extraUserIds: string[] = []) {
  invalidateMembers(chatId);
  const ids = new Set([...(await getMemberIds(chatId)), ...extraUserIds]);
  emitToUsers([...ids], 'chat:updated', { chatId });
}
