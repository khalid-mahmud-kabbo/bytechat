import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { iceServers, listCalls } from './calls.service';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json({ calls: await listCalls(req.userId!) });
});

router.get('/ice', (_req, res) => {
  res.json({ iceServers: iceServers() });
});

export default router;
