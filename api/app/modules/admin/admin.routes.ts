import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAdmin } from '../../middleware/admin';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { getIo } from '../../socket/io';
import { ApiError } from '../../utils/ApiError';

// NOTE: the admin API never returns message text or media - only counts and account data.

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', async (_req, res) => {
  const day = new Date(Date.now() - 24 * 3600_000);
  const week = new Date(Date.now() - 7 * 24 * 3600_000);

  const [users, online, newUsers7d, messages, messages24h, directChats, groupChats, calls24h, activeStories, banned, daily] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isOnline: true } }),
      prisma.user.count({ where: { createdAt: { gte: week } } }),
      prisma.message.count(),
      prisma.message.count({ where: { createdAt: { gte: day } } }),
      prisma.chat.count({ where: { type: 'DIRECT' } }),
      prisma.chat.count({ where: { type: 'GROUP' } }),
      prisma.callLog.count({ where: { startedAt: { gte: day } } }),
      prisma.story.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.$queryRaw<{ day: Date; count: number }[]>`
        SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count
        FROM "Message"
        WHERE "createdAt" > now() - interval '7 days'
        GROUP BY 1 ORDER BY 1`,
    ]);

  res.json({
    users,
    online,
    newUsers7d,
    banned,
    messages,
    messages24h,
    directChats,
    groupChats,
    calls24h,
    activeStories,
    messagesPerDay: daily,
  });
});

router.get('/users', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);

  const where = q
    ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { phone: { contains: q } }] }
    : {};

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        isBanned: true,
        isOnline: true,
        lastSeenAt: true,
        createdAt: true,
        _count: { select: { messages: true, memberships: true } },
      },
    }),
  ]);
  res.json({ total, page, pageSize, users: rows });
});

const patchSchema = z.object({
  isBanned: z.boolean().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

router.patch('/users/:id', validateBody(patchSchema), async (req, res) => {
  const id = req.params.id;
  if (id === req.userId) throw new ApiError(400, 'You cannot change your own account here');

  const user = await prisma.user.update({ where: { id }, data: req.body, select: { id: true, isBanned: true, role: true } });

  if (user.isBanned) {
    // kick the banned user out right now: kill every session and every open socket
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    getIo().in(`user:${id}`).disconnectSockets(true);
  }
  res.json({ user });
});

router.get('/chats', async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const [total, rows] = await Promise.all([
    prisma.chat.count(),
    prisma.chat.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        name: true,
        createdAt: true,
        lastMessageAt: true,
        _count: { select: { members: true, messages: true } },
      },
    }),
  ]);
  res.json({ total, page, pageSize, chats: rows });
});

export default router;
