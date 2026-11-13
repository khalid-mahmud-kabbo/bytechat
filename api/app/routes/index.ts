import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import chatRoutes from '../modules/chats/chats.routes';
import mediaRoutes from '../modules/media/media.routes';
import userRoutes from '../modules/users/users.routes';

const router = Router();
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/chats', chatRoutes);
router.use('/media', mediaRoutes);

export default router;
