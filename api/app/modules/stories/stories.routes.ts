import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { createStory, deleteStory, getFeed, getViews, viewStory } from './stories.service';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json({ groups: await getFeed(req.userId!) });
});

router.post('/', async (req, res) => {
  res.json({ id: await createStory(req.userId!, req.body) });
});

router.post('/:id/view', async (req, res) => {
  await viewStory(req.userId!, req.params.id);
  res.json({ ok: true });
});

router.get('/:id/views', async (req, res) => {
  res.json({ views: await getViews(req.userId!, req.params.id) });
});

router.delete('/:id', async (req, res) => {
  await deleteStory(req.userId!, req.params.id);
  res.json({ ok: true });
});

export default router;
