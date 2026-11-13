import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateBody } from '../../middleware/validate';
import { logout, refresh, requestOtp, verifyOtp } from './auth.controller';
import { refreshSchema, requestOtpSchema, verifyOtpSchema } from './auth.schema';

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

const router = Router();
router.use(limiter);
router.post('/request-otp', validateBody(requestOtpSchema), requestOtp);
router.post('/verify-otp', validateBody(verifyOtpSchema), verifyOtp);
router.post('/refresh', validateBody(refreshSchema), refresh);
router.post('/logout', validateBody(refreshSchema), logout);

export default router;
