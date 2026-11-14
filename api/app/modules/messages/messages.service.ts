import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { messageInclude, serializeMessage } from '../../lib/serializers';
import { assertMember } from '../chats/chats.service';
import { emitStatuses, emitToChat, emitToUsers, getMemberIds, isOnline } from '../../socket/emit';
import { pushNewMessage } from '../push/push.service';

const sendSchema = z.object({
  chatId: z.string().min(1),
  clientId: z.string().min(8).max(64),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'DOCUMENT']).default('TEXT'),
  text: z.string().max(4000).optional(),
  mediaId: z.string().optional(),
  replyToId: z.string().optional(),
});

type SendType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT';

export async function sendMessage(userId: string, raw: unknown) {
  const input = sendSchema.parse(raw);
  await assertMember(input.chatId, userId);

  // same clientId again (offline resend / retry) -> return the original, never duplicate
  const existing = await prisma.message.findUnique({
    where: { senderId_clientId: { senderId: userId, clientId: input.clientId } },
    include: messageInclude,
  });
  if (existing) return serializeMessage(existing);

  const chat = await prisma.chat.findUniqueOrThrow({ where: { id: input.chatId }, select: { type: true } });
  const memberIds = await getMemberIds(input.chatId);
  const recipients = memberIds.filter((id) => id !== userId);

  if (chat.type === 'DIRECT' && recipients[0]) {
    const other = recipients[0];
    const blocked = await prisma.block.findFirst({
      where: { OR: [{ blockerId: userId, blockedId: other }, { blockerId: other, blockedId: userId }] },
    });
    if (blocked) throw new ApiError(403, 'You cannot message this user');
  }

  let type: SendType = input.type;
  if (type === 'TEXT') {
    if (!input.text?.trim()) throw new ApiError(400, 'Message is empty');
  } else {
    if (!input.mediaId) throw new ApiError(400, 'mediaId is required');
    const media = await prisma.media.findUnique({
      where: { id: input.mediaId },
      include: { message: { select: { id: true } } },
    });
    if (!media || media.uploaderId !== userId) throw new ApiError(400, 'Invalid media');
    if (media.message) throw new ApiError(400, 'Media already used');
    // the server decides the type from the real mime type
    if (media.mimeType.startsWith('image/')) type = 'IMAGE';
    else if (media.mimeType.startsWith('video/')) type = 'VIDEO';
    else if (media.mimeType.startsWith('audio/')) type = input.type === 'VOICE' ? 'VOICE' : 'AUDIO';
    else type = 'DOCUMENT';
  }

  if (input.replyToId) {
    const target = await prisma.message.findFirst({
      where: { id: input.replyToId, chatId: input.chatId },
      select: { id: true },
    });
    if (!target) throw new ApiError(400, 'Invalid reply target');
  }

  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        chatId: input.chatId,
        senderId: userId,
        type,
        text: input.text?.trim() || null,
        mediaId: type === 'TEXT' ? null : (input.mediaId ?? null),
        replyToId: input.replyToId ?? null,
        clientId: input.clientId,
        receipts: { create: recipients.map((id) => ({ userId: id })) },
      },
      select: { id: true, createdAt: true },
    });
    await tx.chat.update({ where: { id: input.chatId }, data: { lastMessageId: m.id, lastMessageAt: m.createdAt } });
    return m;
  });

  // recipients that are connected right now get it "delivered" immediately
  const online: string[] = [];
  for (const id of recipients) if (await isOnline(id)) online.push(id);
  if (online.length > 0) {
    await prisma.messageReceipt.updateMany({
      where: { messageId: created.id, userId: { in: online } },
      data: { deliveredAt: new Date() },
    });
  }

  const full = await prisma.message.findUniqueOrThrow({ where: { id: created.id }, include: messageInclude });
  const payload = serializeMessage(full);
  emitToUsers(memberIds, 'message:new', payload); // includes the sender's other devices

  // people with no open connection (browser closed) get a push notification
  void pushNewMessage(
    { chatId: input.chatId, senderId: userId, type, text: input.text?.trim() || null },
    recipients.filter((id) => !online.includes(id)),
  ).catch((e) => console.error('[push]', e));
  return payload;
}

/** The user opened the chat: everything incoming becomes read. */
export async function markRead(userId: string, chatId: string) {
  await assertMember(chatId, userId);
  const now = new Date();

  const pending = await prisma.messageReceipt.findMany({
    where: { userId, readAt: null, message: { chatId } },
    select: { messageId: true },
  });
  if (pending.length > 0) {
    const ids = pending.map((p) => p.messageId);
    await prisma.messageReceipt.updateMany({
      where: { userId, messageId: { in: ids }, deliveredAt: null },
      data: { deliveredAt: now },
    });
    await prisma.messageReceipt.updateMany({
      where: { userId, messageId: { in: ids } },
      data: { readAt: now },
    });
    await emitStatuses(ids);
  }

  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: { lastReadAt: now },
  });
  emitToUsers([userId], 'chat:read', { chatId }); // keeps the user's other devices in sync
}

/** The user just connected: mark everything sent to them while offline as delivered. */
export async function markDeliveredForUser(userId: string) {
  const pending = await prisma.messageReceipt.findMany({
    where: { userId, deliveredAt: null },
    select: { messageId: true },
    take: 500,
  });
  if (pending.length === 0) return;
  const ids = pending.map((p) => p.messageId);
  await prisma.messageReceipt.updateMany({
    where: { userId, messageId: { in: ids } },
    data: { deliveredAt: new Date() },
  });
  await emitStatuses(ids);
}

async function loadOwnMessage(userId: string, messageId: string) {
  const m = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, chatId: true, senderId: true, type: true, deletedAt: true },
  });
  if (!m) throw new ApiError(404, 'Message not found');
  if (m.senderId !== userId) throw new ApiError(403, 'You can only change your own messages');
  return m;
}

export async function deleteMessage(userId: string, raw: unknown) {
  const { messageId } = z.object({ messageId: z.string() }).parse(raw);
  const m = await loadOwnMessage(userId, messageId);
  const updated = await prisma.message.update({
    where: { id: m.id },
    data: { deletedAt: new Date(), text: null },
    include: messageInclude,
  });
  const payload = serializeMessage(updated);
  await emitToChat(m.chatId, 'message:updated', payload);
  return payload;
}

export async function editMessage(userId: string, raw: unknown) {
  const { messageId, text } = z.object({ messageId: z.string(), text: z.string().trim().min(1).max(4000) }).parse(raw);
  const m = await loadOwnMessage(userId, messageId);
  if (m.type !== 'TEXT' || m.deletedAt) throw new ApiError(400, 'This message cannot be edited');
  const updated = await prisma.message.update({
    where: { id: m.id },
    data: { text, editedAt: new Date() },
    include: messageInclude,
  });
  const payload = serializeMessage(updated);
  await emitToChat(m.chatId, 'message:updated', payload);
  return payload;
}

export async function reactToMessage(userId: string, raw: unknown) {
  const { messageId, emoji } = z.object({ messageId: z.string(), emoji: z.string().min(1).max(16) }).parse(raw);
  const m = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true, chatId: true, deletedAt: true } });
  if (!m || m.deletedAt) throw new ApiError(404, 'Message not found');
  await assertMember(m.chatId, userId);

  const key = { messageId_userId: { messageId, userId } };
  const current = await prisma.reaction.findUnique({ where: key });
  if (current && current.emoji === emoji) await prisma.reaction.delete({ where: key }); // tap again = remove
  else if (current) await prisma.reaction.update({ where: key, data: { emoji } });
  else await prisma.reaction.create({ data: { messageId, userId, emoji } });

  const updated = await prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
  const payload = serializeMessage(updated);
  await emitToChat(m.chatId, 'message:updated', payload);
  return payload;
}
