import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { ApiError } from '../utils/ApiError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Unauthorized');
  try {
    req.userId = verifyAccessToken(header.slice(7));
  } catch {
    throw new ApiError(401, 'Invalid or expired token', 'TOKEN_EXPIRED');
  }
  next();
};
