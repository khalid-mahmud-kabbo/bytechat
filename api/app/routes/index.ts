import { Router } from 'express';
import adminRoutes from '../modules/admin/admin.routes';
import authRoutes from '../modules/auth/auth.routes';
import callRoutes from '../modules/calls/calls.routes';
import chatRoutes from '../modules/chats/chats.routes';
import mediaRoutes from '../modules/media/media.routes';
import pushRoutes from '../modules/push/push.routes';
import storyRoutes from '../modules/stories/stories.routes';
import userRoutes from '../modules/users/users.routes';

const router = Router();
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/chats', chatRoutes);
router.use('/media', mediaRoutes);
router.use('/stories', storyRoutes);
router.use('/calls', callRoutes);
router.use('/push', pushRoutes);
router.use('/admin', adminRoutes);

export default router;
