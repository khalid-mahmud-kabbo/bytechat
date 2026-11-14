import { z } from 'zod';
import type { Media } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { lite, userSelect } from '../../lib/serializers';
import { emitToUsers } from '../../socket/emit';
import { ApiError } from '../../utils/ApiError';

const TTL_MS = 24 * 60 * 60 * 1000;

const createSchema = z.object({
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO']),
  text: z.string().trim().max(700).optional(),
  bgColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  mediaId: z.string().optional(),
});

/** People I may see (and who may see me): direct chats with at least one message, minus blocks. */
async function visiblePosterIds(userId: string): Promise<string[]> {
  const peers = await prisma.chatMember.findMany({
    where: {
      userId: { not: userId },
      leftAt: null,
      chat: { type: 'DIRECT', lastMessageId: { not: null }, members: { some: { userId, leftAt: null } } },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  const ids = peers.map((p) => p.userId);
  if (ids.length === 0) return [];
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId, blockedId: { in: ids } }, { blockedId: userId, blockerId: { in: ids } }] },
  });
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  return ids.filter((id) => !blocked.has(id));
}

const serializeMedia = (m: Media | null) =>
  m ? { id: m.id, url: m.url, mimeType: m.mimeType, width: m.width, height: m.height, durationMs: m.durationMs } : null;

export async function createStory(userId: string, raw: unknown) {
  const input = createSchema.parse(raw);

  if (input.type === 'TEXT') {
    if (!input.text) throw new ApiError(400, 'Write something first');
  } else {
    if (!input.mediaId) throw new ApiError(400, 'mediaId is required');
    const media = await prisma.media.findUnique({
      where: { id: input.mediaId },
      include: { story: { select: { id: true } }, message: { select: { id: true } } },
    });
    if (!media || media.uploaderId !== userId) throw new ApiError(400, 'Invalid media');
    if (media.story || media.message) throw new ApiError(400, 'Media already used');
    const okMime = input.type === 'IMAGE' ? media.mimeType.startsWith('image/') : media.mimeType.startsWith('video/');
    if (!okMime) throw new ApiError(400, 'File type does not match the status type');
  }

  const story = await prisma.story.create({
    data: {
      userId,
      type: input.type,
      text: input.text || null,
      bgColor: input.bgColor ?? null,
      mediaId: input.type === 'TEXT' ? null : (input.mediaId ?? null),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
    select: { id: true },
  });

  emitToUsers([userId, ...(await visiblePosterIds(userId))], 'story:new', { userId });
  return story.id;
}

export async function getFeed(userId: string) {
  const posters = await visiblePosterIds(userId);
  const stories = await prisma.story.findMany({
    where: { userId: { in: [userId, ...posters] }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
    include: {
      media: true,
      user: { select: userSelect },
      views: { where: { viewerId: userId }, select: { viewerId: true } },
      _count: { select: { views: true } },
    },
  });

  type Group = {
    user: ReturnType<typeof lite>;
    isMine: boolean;
    stories: {
      id: string;
      type: string;
      text: string | null;
      bgColor: string | null;
      media: ReturnType<typeof serializeMedia>;
      createdAt: Date;
      expiresAt: Date;
      viewed: boolean;
      viewCount: number | null;
    }[];
    hasUnviewed: boolean;
    latestAt: Date;
  };

  const groups = new Map<string, Group>();
  for (const s of stories) {
    const mine = s.userId === userId;
    let g = groups.get(s.userId);
    if (!g) {
      g = { user: lite(s.user), isMine: mine, stories: [], hasUnviewed: false, latestAt: s.createdAt };
      groups.set(s.userId, g);
    }
    const viewed = mine || s.views.length > 0;
    g.stories.push({
      id: s.id,
      type: s.type,
      text: s.text,
      bgColor: s.bgColor,
      media: serializeMedia(s.media),
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      viewed,
      viewCount: mine ? s._count.views : null,
    });
    if (!viewed) g.hasUnviewed = true;
    g.latestAt = s.createdAt;
  }

  return [...groups.values()].sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
    return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
  });
}

export async function viewStory(userId: string, storyId: string) {
  const story = await prisma.story.findFirst({
    where: { id: storyId, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });
  if (!story) throw new ApiError(404, 'Status not found');
  if (story.userId === userId) return;
  if (!(await visiblePosterIds(userId)).includes(story.userId)) throw new ApiError(403, 'Not allowed');
  await prisma.storyView.upsert({
    where: { storyId_viewerId: { storyId, viewerId: userId } },
    update: {},
    create: { storyId, viewerId: userId },
  });
}

export async function getViews(userId: string, storyId: string) {
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
  if (!story || story.userId !== userId) throw new ApiError(404, 'Status not found');
  const views = await prisma.storyView.findMany({
    where: { storyId },
    orderBy: { viewedAt: 'desc' },
    include: { viewer: { select: userSelect } },
  });
  return views.map((v) => ({ viewer: lite(v.viewer), viewedAt: v.viewedAt }));
}

export async function deleteStory(userId: string, storyId: string) {
  const res = await prisma.story.deleteMany({ where: { id: storyId, userId } });
  if (res.count === 0) throw new ApiError(404, 'Status not found');
  emitToUsers([userId, ...(await visiblePosterIds(userId))], 'story:new', { userId });
}

export const deleteExpiredStories = () => prisma.story.deleteMany({ where: { expiresAt: { lt: new Date() } } });
