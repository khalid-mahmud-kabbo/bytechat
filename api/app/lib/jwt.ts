import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const signAccessToken = (userId: string) =>
  jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });

/** Returns the userId or throws. */
export const verifyAccessToken = (token: string): string => {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  if (!payload.sub) throw new Error('Invalid token');
  return payload.sub;
};
