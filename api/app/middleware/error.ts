import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { message: 'Validation failed', details: err.flatten().fieldErrors } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 25 MB)' : 'Upload failed';
    res.status(400).json({ error: { message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
};
