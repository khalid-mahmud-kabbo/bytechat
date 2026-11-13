import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { generateOtp, hashOtp, safeEqual, sendOtpSms } from '../../lib/otp';
import { signAccessToken } from '../../lib/jwt';
import { publicUser } from '../../lib/serializers';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_OTP_PER_HOUR = 5;

type Meta = { userAgent?: string; ip?: string };

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const invalidOtp = () => new ApiError(400, 'Invalid or expired code', 'OTP_INVALID');

async function issueTokens(userId: string, meta: Meta) {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      userAgent: meta.userAgent?.slice(0, 255),
      ip: meta.ip,
    },
  });
  return { accessToken: signAccessToken(userId), refreshToken };
}

export async function requestOtp(phone: string) {
  const recent = await prisma.otpCode.count({
    where: { phone, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= MAX_OTP_PER_HOUR) {
    throw new ApiError(429, 'Too many OTP requests. Try again later.', 'OTP_RATE_LIMIT');
  }
  const code = generateOtp();
  await prisma.otpCode.create({
    data: { phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  await sendOtpSms(phone, code);
}

export async function verifyOtp(phone: string, code: string, meta: Meta) {
  const record = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record || record.attempts >= MAX_ATTEMPTS) throw invalidOtp();

  if (!safeEqual(record.codeHash, hashOtp(phone, code))) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw invalidOtp();
  }

  // consume atomically so one code can never be used twice
  const consumed = await prisma.otpCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) throw invalidOtp();

  const user = await prisma.user.upsert({ where: { phone }, update: {}, create: { phone } });
  if (user.isBanned) throw new ApiError(403, 'Account suspended', 'BANNED');

  const tokens = await issueTokens(user.id, meta);
  return { user: publicUser(user), isNewUser: !user.name, ...tokens };
}

export async function refresh(token: string, meta: Meta) {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!row) throw new ApiError(401, 'Invalid refresh token', 'REFRESH_INVALID');

  if (row.revokedAt) {
    // a rotated token was reused -> assume theft, kill every session of this user
    await prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_INVALID');
  }
  if (row.expiresAt < new Date() || row.user.isBanned) {
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_INVALID');
  }

  const rotated = await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (rotated.count === 0) throw new ApiError(401, 'Invalid refresh token', 'REFRESH_INVALID');

  return issueTokens(row.userId, meta);
}

export async function logout(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
