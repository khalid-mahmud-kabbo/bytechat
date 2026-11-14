import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { notifyChatUpdated } from '../../socket/emit';
import {
  addMembers,
  createGroup,
  getChat,
  getMessages,
  getOrCreateDirect,
  getSharedMedia,
  listChats,
  removeMember,
  searchAllMessages,
  searchInChat,
  updateGroup,
  updateMySettings,
} from './chats.service';
import { forwardMessage } from '../messages/messages.service';

const directSchema = z.object({ userId: z.string().min(1) });
const groupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  memberIds: z.array(z.string().min(1)).min(1).max(255),
});
const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
const membersSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(100) });
const settingsSchema = z.object({
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  mutedUntil: z.coerce.date().nullable().optional(),
});

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json({ chats: await listChats(req.userId!, undefined, req.query.archived === '1') });
});

router.post('/direct', validateBody(directSchema), async (req, res) => {
  res.json({ chat: await getOrCreateDirect(req.userId!, req.body.userId) });
});

router.post('/group', validateBody(groupSchema), async (req, res) => {
  const chat = await createGroup(req.userId!, req.body.name, req.body.memberIds);
  await notifyChatUpdated(chat.id);
  res.json({ chat });
});

// NOTE: fixed paths must be declared before '/:id'
router.get('/search/messages', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  res.json({ messages: q.length >= 2 ? await searchAllMessages(req.userId!, q) : [] });
});

router.post('/forward', async (req, res) => {
  res.json(await forwardMessage(req.userId!, req.body));
});

router.get('/:id', async (req, res) => {
  res.json({ chat: await getChat(req.params.id, req.userId!) });
});

router.get('/:id/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  res.json({ messages: q.length >= 2 ? await searchInChat(req.params.id, req.userId!, q) : [] });
});

router.get('/:id/messages', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  res.json(await getMessages(req.params.id, req.userId!, before, limit));
});

router.get('/:id/media', async (req, res) => {
  const kind = req.query.kind === 'docs' ? 'docs' : 'media';
  res.json({ messages: await getSharedMedia(req.params.id, req.userId!, kind) });
});

router.patch('/:id', validateBody(updateGroupSchema), async (req, res) => {
  const chat = await updateGroup(req.userId!, req.params.id, req.body);
  await notifyChatUpdated(req.params.id);
  res.json({ chat });
});

router.patch('/:id/settings', validateBody(settingsSchema), async (req, res) => {
  res.json({ chat: await updateMySettings(req.userId!, req.params.id, req.body) });
});

router.post('/:id/members', validateBody(membersSchema), async (req, res) => {
  const chat = await addMembers(req.userId!, req.params.id, req.body.userIds);
  await notifyChatUpdated(req.params.id);
  res.json({ chat });
});

router.delete('/:id/members/:userId', async (req, res) => {
  await removeMember(req.userId!, req.params.id, req.params.userId);
  await notifyChatUpdated(req.params.id, [req.params.userId]); // the removed user must refetch too
  res.json({ ok: true });
});

export default router;
