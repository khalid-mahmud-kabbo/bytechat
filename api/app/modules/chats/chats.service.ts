import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { lite, messageInclude, serializeMessage, userSelect } from '../../lib/serializers';
import { invalidateMembers } from '../../socket/emit';

export async function assertMember(chatId: string, userId: string) {
  const m = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
  if (!m || m.leftAt) throw new ApiError(403, 'You are not a member of this chat');
  return m;
}

async function assertAdmin(chatId: string, userId: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
  if (!chat || chat.type !== 'GROUP') throw new ApiError(400, 'This is not a group chat');
  const m = await assertMember(chatId, userId);
  if (m.role === 'MEMBER') throw new ApiError(403, 'Only group admins can do this');
  return m;
}

/** Chat list (or one chat) shaped for the UI: title, peer, members, unread, last message. */
export async function listChats(userId: string, onlyChatId?: string, archived = false) {
  const memberships = await prisma.chatMember.findMany({
    where: {
      userId,
      leftAt: null,
      ...(onlyChatId ? { chatId: onlyChatId } : { archivedAt: archived ? { not: null } : null }),
    },
    include: {
      chat: {
        include: {
          members: { where: { leftAt: null }, include: { user: { select: userSelect } } },
          lastMessage: { include: messageInclude },
        },
      },
    },
  });

  // an empty direct chat created by somebody else must stay hidden until they write
  const visible = memberships.filter(
    (m) => !(m.chat.type === 'DIRECT' && !m.chat.lastMessageId && m.chat.createdById !== userId),
  );

  // unread = incoming messages newer than my lastReadAt (one cheap COUNT per chat)
  const unread = await Promise.all(
    visible.map((m) =>
      prisma.message.count({
        where: { chatId: m.chatId, senderId: { not: userId }, createdAt: { gt: m.lastReadAt }, deletedAt: null },
      }),
    ),
  );

  const items = visible.map((m, i) => {
    const chat = m.chat;
    const direct = chat.type === 'DIRECT';
    const peer = direct ? (chat.members.find((x) => x.userId !== userId)?.user ?? null) : null;
    return {
      id: chat.id,
      type: chat.type,
      title: direct ? (peer?.name ?? peer?.phone ?? 'Unknown') : (chat.name ?? 'Group'),
      avatarUrl: direct ? (peer?.avatarUrl ?? null) : chat.avatarUrl,
      description: chat.description,
      peer: peer ? lite(peer) : null,
      members: chat.members.map((x) => ({ ...lite(x.user), role: x.role })),
      myRole: m.role,
      pinnedAt: m.pinnedAt,
      mutedUntil: m.mutedUntil,
      archivedAt: m.archivedAt,
      unread: unread[i],
      lastMessage: chat.lastMessage ? serializeMessage(chat.lastMessage) : null,
      lastMessageAt: chat.lastMessageAt ?? chat.createdAt,
      createdAt: chat.createdAt,
    };
  });

  items.sort((a, b) => {
    if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
  return items;
}

export async function getChat(chatId: string, userId: string) {
  const [chat] = await listChats(userId, chatId);
  if (!chat) throw new ApiError(404, 'Chat not found');
  return chat;
}

export async function getOrCreateDirect(userId: string, otherId: string) {
  if (userId === otherId) throw new ApiError(400, 'You cannot chat with yourself');
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true, isBanned: true } });
  if (!other || other.isBanned) throw new ApiError(404, 'User not found');

  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] },
  });
  if (blocked) throw new ApiError(403, 'You cannot message this user');

  // one chat per pair, guaranteed by the unique directKey
  const directKey = [userId, otherId].sort().join(':');
  const chat = await prisma.chat.upsert({
    where: { directKey },
    update: {},
    create: {
      type: 'DIRECT',
      directKey,
      createdById: userId,
      members: { create: [{ userId }, { userId: otherId }] },
    },
    select: { id: true },
  });
  return getChat(chat.id, userId);
}

export async function createGroup(userId: string, name: string, memberIds: string[]) {
  const ids = Array.from(new Set(memberIds.filter((id) => id !== userId)));
  if (ids.length < 1) throw new ApiError(400, 'Add at least one member');
  const users = await prisma.user.findMany({ where: { id: { in: ids }, isBanned: false }, select: { id: true } });
  if (users.length !== ids.length) throw new ApiError(400, 'Some users were not found');

  const chat = await prisma.chat.create({
    data: {
      type: 'GROUP',
      name,
      createdById: userId,
      members: { create: [{ userId, role: 'OWNER' }, ...ids.map((id) => ({ userId: id }))] },
    },
    select: { id: true },
  });
  return getChat(chat.id, userId);
}

export async function updateGroup(
  userId: string,
  chatId: string,
  data: { name?: string; description?: string | null; avatarUrl?: string | null },
) {
  await assertAdmin(chatId, userId);
  await prisma.chat.update({ where: { id: chatId }, data });
  return getChat(chatId, userId);
}

export async function addMembers(userId: string, chatId: string, userIds: string[]) {
  await assertAdmin(chatId, userId);
  const users = await prisma.user.findMany({ where: { id: { in: userIds }, isBanned: false }, select: { id: true } });
  for (const u of users) {
    await prisma.chatMember.upsert({
      where: { chatId_userId: { chatId, userId: u.id } },
      update: { leftAt: null, joinedAt: new Date(), lastReadAt: new Date(), role: 'MEMBER' },
      create: { chatId, userId: u.id },
    });
  }
  invalidateMembers(chatId);
  return getChat(chatId, userId);
}

export async function removeMember(actorId: string, chatId: string, targetId: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
  if (!chat || chat.type !== 'GROUP') throw new ApiError(400, 'This is not a group chat');
  const actor = await assertMember(chatId, actorId);
  const target = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: targetId } } });
  if (!target || target.leftAt) throw new ApiError(404, 'Member not found');

  if (actorId !== targetId) {
    // removing somebody else
    if (actor.role === 'MEMBER') throw new ApiError(403, 'Only group admins can remove members');
    if (target.role === 'OWNER') throw new ApiError(403, 'The owner cannot be removed');
    if (actor.role === 'ADMIN' && target.role === 'ADMIN') throw new ApiError(403, 'Only the owner can remove an admin');
  }

  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId: targetId } },
    data: { leftAt: new Date() },
  });

  if (target.role === 'OWNER') {
    // the owner left: promote an admin, otherwise the longest-standing member
    const rest = await prisma.chatMember.findMany({ where: { chatId, leftAt: null }, orderBy: { joinedAt: 'asc' } });
    const next = rest.find((m) => m.role === 'ADMIN') ?? rest[0];
    if (next) await prisma.chatMember.update({ where: { id: next.id }, data: { role: 'OWNER' } });
  }
  invalidateMembers(chatId);
}

export async function updateMySettings(
  userId: string,
  chatId: string,
  data: { pinned?: boolean; mutedUntil?: Date | null; archived?: boolean },
) {
  await assertMember(chatId, userId);
  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: {
      ...(data.pinned !== undefined ? { pinnedAt: data.pinned ? new Date() : null } : {}),
      ...(data.mutedUntil !== undefined ? { mutedUntil: data.mutedUntil } : {}),
      ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
    },
  });
  return getChat(chatId, userId);
}

export async function getMessages(chatId: string, userId: string, before: string | undefined, limit: number) {
  await assertMember(chatId, userId);
  let beforeDate: Date | undefined;
  if (before) {
    beforeDate = new Date(before);
    if (Number.isNaN(beforeDate.getTime())) throw new ApiError(400, 'Invalid cursor');
  }
  const rows = await prisma.message.findMany({
    where: { chatId, ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: messageInclude,
  });
  return { messages: rows.reverse().map(serializeMessage), hasMore: rows.length === limit };
}

/** "Media, Links & Docs" panel */
export async function getSharedMedia(chatId: string, userId: string, kind: 'media' | 'docs') {
  await assertMember(chatId, userId);
  const rows = await prisma.message.findMany({
    where: {
      chatId,
      deletedAt: null,
      type: kind === 'media' ? { in: ['IMAGE', 'VIDEO'] } : 'DOCUMENT',
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: messageInclude,
  });
  return rows.map(serializeMessage);
}

/** Search the text messages of ONE chat I belong to. */
export async function searchInChat(chatId: string, userId: string, q: string) {
  await assertMember(chatId, userId);
  return prisma.message.findMany({
    where: { chatId, deletedAt: null, type: 'TEXT', text: { contains: q, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, senderId: true, text: true, createdAt: true },
  });
}

/** Search the text messages of EVERY chat I belong to. */
export async function searchAllMessages(userId: string, q: string) {
  const rows = await prisma.message.findMany({
    where: {
      deletedAt: null,
      type: 'TEXT',
      text: { contains: q, mode: 'insensitive' },
      chat: { members: { some: { userId, leftAt: null } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      chatId: true,
      senderId: true,
      text: true,
      createdAt: true,
      chat: {
        select: {
          type: true,
          name: true,
          members: { where: { leftAt: null }, select: { userId: true, user: { select: { name: true, phone: true } } } },
        },
      },
    },
  });
  return rows.map((r) => {
    const peer = r.chat.members.find((m) => m.userId !== userId)?.user;
    return {
      id: r.id,
      chatId: r.chatId,
      senderId: r.senderId,
      text: r.text,
      createdAt: r.createdAt,
      chatTitle: r.chat.type === 'DIRECT' ? (peer?.name ?? peer?.phone ?? 'Chat') : (r.chat.name ?? 'Group'),
    };
  });
}
