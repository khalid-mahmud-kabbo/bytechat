import type { Prisma, User } from '../generated/prisma/client';

export const publicUser = (u: User) => ({
  id: u.id,
  phone: u.phone,
  name: u.name,
  about: u.about,
  avatarUrl: u.avatarUrl,
  role: u.role,
  isOnline: u.isOnline,
  lastSeenAt: u.lastSeenAt,
  createdAt: u.createdAt,
});

type LiteInput = {
  id: string;
  name: string | null;
  phone: string;
  avatarUrl: string | null;
  about: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
};

/** What other people are allowed to see about a user. */
export const lite = (u: LiteInput) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  avatarUrl: u.avatarUrl,
  about: u.about,
  isOnline: u.isOnline,
  lastSeenAt: u.lastSeenAt,
});

export const userSelect = {
  id: true,
  name: true,
  phone: true,
  avatarUrl: true,
  about: true,
  isOnline: true,
  lastSeenAt: true,
} as const;

export const messageInclude = {
  media: true,
  receipts: true,
  reactions: true,
  replyTo: { select: { id: true, text: true, type: true, senderId: true, deletedAt: true } },
} satisfies Prisma.MessageInclude;

export type MessageFull = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;
export type MessageStatus = 'sent' | 'delivered' | 'read';

/** Status as the SENDER sees it. Receipts only exist for the other members. */
export function messageStatus(m: { receipts: { deliveredAt: Date | null; readAt: Date | null }[] }): MessageStatus {
  if (m.receipts.length === 0) return 'sent';
  if (m.receipts.every((r) => r.readAt)) return 'read';
  if (m.receipts.every((r) => r.deliveredAt)) return 'delivered';
  return 'sent';
}

export const serializeMessage = (m: MessageFull) => ({
  id: m.id,
  chatId: m.chatId,
  senderId: m.senderId,
  clientId: m.clientId,
  type: m.type,
  text: m.deletedAt ? null : m.text,
  media:
    m.deletedAt || !m.media
      ? null
      : {
          id: m.media.id,
          url: m.media.url,
          thumbnailUrl: m.media.thumbnailUrl,
          mimeType: m.media.mimeType,
          size: m.media.size,
          fileName: m.media.fileName,
          width: m.media.width,
          height: m.media.height,
          durationMs: m.media.durationMs,
          waveform: m.media.waveform,
        },
  replyTo: m.replyTo
    ? {
        id: m.replyTo.id,
        senderId: m.replyTo.senderId,
        type: m.replyTo.type,
        text: m.replyTo.deletedAt ? null : m.replyTo.text,
      }
    : null,
  reactions: m.reactions.map((r) => ({ userId: r.userId, emoji: r.emoji })),
  status: messageStatus(m),
  editedAt: m.editedAt,
  deletedAt: m.deletedAt,
  createdAt: m.createdAt,
});
