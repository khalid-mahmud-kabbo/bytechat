import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

/** Use after requireAuth. Checks the role in the database on every request. */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true, isBanned: true } });
  if (!user || user.isBanned || user.role !== 'ADMIN') throw new ApiError(403, 'Admins only');
  next();
};
