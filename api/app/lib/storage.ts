import fs from 'fs/promises';
import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// Cloudflare R2 / AWS S3 / any S3-compatible bucket. Used only when every S3_* value is set.
const s3 =
  env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_PUBLIC_URL
    ? new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        forcePathStyle: !!env.S3_ENDPOINT,
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      })
    : null;

export const storageMode: 's3' | 'local' = s3 ? 's3' : 'local';

/** Stores the file and returns its public URL. */
export async function saveFile(key: string, body: Buffer, contentType: string): Promise<string> {
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${env.S3_PUBLIC_URL!.replace(/\/$/, '')}/${key}`;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), body);
  return `${env.PUBLIC_URL}/uploads/${key}`;
}
