import type { Request, RequestHandler } from 'express';
import * as service from './auth.service';

const meta = (req: Request) => ({ userAgent: req.get('user-agent'), ip: req.ip });

export const requestOtp: RequestHandler = async (req, res) => {
  await service.requestOtp(req.body.phone);
  res.json({ message: 'OTP sent' });
};

export const verifyOtp: RequestHandler = async (req, res) => {
  res.json(await service.verifyOtp(req.body.phone, req.body.code, meta(req)));
};

export const refresh: RequestHandler = async (req, res) => {
  res.json(await service.refresh(req.body.refreshToken, meta(req)));
};

export const logout: RequestHandler = async (req, res) => {
  await service.logout(req.body.refreshToken);
  res.json({ message: 'Logged out' });
};
