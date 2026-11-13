import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +8801XXXXXXXXX');

export const requestOtpSchema = z.object({ phone });
export const verifyOtpSchema = z.object({ phone, code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits') });
export const refreshSchema = z.object({ refreshToken: z.string().min(20) });
