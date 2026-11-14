import webpush from 'web-push';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';

export const pushEnabled = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (pushEnabled) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

export type PushPayload = {
  title: string;
  body: string;
  chatId?: string;
  tag?: string;
  kind: 'message' | 'missed_call';
};

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!pushEnabled || userIds.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24,
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = the browser unsubscribed -> forget it
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error('[push]', status ?? err);
      }
    }),
  );
}

const previewOf = (m: { type: string; text: string | null }) => {
  switch (m.type) {
    case 'IMAGE':
      return '📷 Photo';
    case 'VIDEO':
      return '🎥 Video';
    case 'VOICE':
      return '🎤 Voice message';
    case 'AUDIO':
      return '🎵 Audio';
    case 'DOCUMENT':
      return '📄 Document';
    default:
      return (m.text ?? '').slice(0, 120);
  }
};

/** Push for recipients that have no open connection (tab closed). Respects muted chats. */
export async function pushNewMessage(
  msg: { chatId: string; senderId: string; type: string; text: string | null },
  offlineUserIds: string[],
) {
  if (!pushEnabled || offlineUserIds.length === 0) return;
  const members = await prisma.chatMember.findMany({
    where: {
      chatId: msg.chatId,
      userId: { in: offlineUserIds },
      leftAt: null,
      OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
    },
    select: { userId: true },
  });
  if (members.length === 0) return;

  const [sender, chat] = await Promise.all([
    prisma.user.findUnique({ where: { id: msg.senderId }, select: { name: true, phone: true } }),
    prisma.chat.findUnique({ where: { id: msg.chatId }, select: { type: true, name: true } }),
  ]);
  const who = sender?.name ?? sender?.phone ?? 'New message';
  const group = chat?.type === 'GROUP';
  await sendPushToUsers(
    members.map((m) => m.userId),
    {
      title: group ? (chat?.name ?? 'Group') : who,
      body: `${group ? `${who}: ` : ''}${previewOf(msg)}`,
      chatId: msg.chatId,
      tag: `chat:${msg.chatId}`,
      kind: 'message',
    },
  );
}
