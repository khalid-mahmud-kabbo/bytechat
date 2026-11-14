import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const router = Router();
router.use(requireAuth);

router.get('/key', (_req, res) => {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY || null });
});

router.post('/subscribe', validateBody(subscribeSchema), async (req, res) => {
  const { endpoint, keys } = req.body;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.get('user-agent')?.slice(0, 255) },
  });
  res.json({ ok: true });
});

router.post('/unsubscribe', validateBody(z.object({ endpoint: z.string().url() })), async (req, res) => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: req.body.endpoint, userId: req.userId! } });
  res.json({ ok: true });
});

export default router;
