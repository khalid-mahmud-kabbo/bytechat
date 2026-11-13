import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { lite, publicUser, userSelect } from '../../lib/serializers';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { ApiError } from '../../utils/ApiError';

const updateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  about: z.string().trim().max(140).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

// user search can be abused to discover phone numbers, so keep it tight
const searchLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

const router = Router();
router.use(requireAuth);

router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ user: publicUser(user) });
});

router.patch('/me', validateBody(updateSchema), async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.userId }, data: req.body });
  res.json({ user: publicUser(user) });
});

router.get('/search', searchLimiter, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json({ users: [] });
    return;
  }
  const digits = q.replace(/[^\d+]/g, '');
  const users = await prisma.user.findMany({
    where: {
      id: { not: req.userId },
      isBanned: false,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ],
    },
    select: userSelect,
    take: 20,
  });
  res.json({ users: users.map(lite) });
});

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
  if (!user) throw new ApiError(404, 'User not found');
  const block = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId: req.userId!, blockedId: user.id } },
  });
  res.json({ user: lite(user), blockedByMe: !!block });
});

router.post('/:id/block', async (req, res) => {
  if (req.params.id === req.userId) throw new ApiError(400, 'You cannot block yourself');
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: req.userId!, blockedId: req.params.id } },
    update: {},
    create: { blockerId: req.userId!, blockedId: req.params.id },
  });
  res.json({ ok: true });
});

router.delete('/:id/block', async (req, res) => {
  await prisma.block.deleteMany({ where: { blockerId: req.userId!, blockedId: req.params.id } });
  res.json({ ok: true });
});

export default router;
