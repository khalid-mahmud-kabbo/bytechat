import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { clientOrigins, env } from './config/env';
import routes from './routes';
import { UPLOAD_DIR } from './modules/media/media.routes';
import { errorHandler, notFound } from './middleware/error';

export const app = express();

app.set('trust proxy', 1); // Railway/Render sit behind a proxy
// cross-origin: the web app (another origin) must be allowed to display uploaded images
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: clientOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));
app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);
