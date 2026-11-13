import crypto from 'crypto';
import { env } from '../config/env';

export const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

export const hashOtp = (phone: string, code: string) =>
  crypto.createHmac('sha256', env.OTP_SECRET).update(`${phone}:${code}`).digest('hex');

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export async function sendOtpSms(phone: string, code: string) {
  if (env.NODE_ENV !== 'production') {
    console.log(`[DEV OTP] ${phone} -> ${code}`);
    return;
  }
  // TODO: connect your SMS gateway here (Twilio / local BD SMS provider)
  throw new Error('SMS provider not configured');
}
