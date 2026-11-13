import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  OTP_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  CLIENT_ORIGINS: z.string().default('http://localhost:3000'),
  PUBLIC_URL: z.string().default('http://localhost:4000'),
});

export const env = schema.parse(process.env);
export const clientOrigins = env.CLIENT_ORIGINS.split(',').map((s) => s.trim());
