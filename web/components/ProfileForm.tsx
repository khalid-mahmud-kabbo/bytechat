'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import Avatar from './Avatar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import type { User } from '@/lib/types';

type Props = { submitLabel: string; onDone: () => void };

export default function ProfileForm({ submitLabel, onDone }: Props) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [name, setName] = useState(user?.name ?? '');
  const [about, setAbout] = useState(user?.about ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pickAvatar(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const res = await api<{ media: { url: string } }>('/media', { method: 'POST', body: form });
      setAvatarUrl(res.media.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api<{ user: User }>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, about, avatarUrl }),
      });
      setUser(res.user);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex justify-center">
        <label className="relative cursor-pointer">
          <Avatar name={name || user?.phone || 'U'} src={avatarUrl} size={96} />
          <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-brand text-white shadow">
            <Camera size={16} />
          </span>
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} />
        </label>
      </div>

      <label className="block text-sm font-medium">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          required
          placeholder="Your name"
          className="mt-1 h-12 w-full rounded-xl border border-line bg-app px-4 font-normal outline-none focus:border-brand"
        />
      </label>

      <label className="block text-sm font-medium">
        About
        <input
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={140}
          className="mt-1 h-12 w-full rounded-xl border border-line bg-app px-4 font-normal outline-none focus:border-brand"
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button disabled={busy || !name.trim()} className="h-12 w-full rounded-xl bg-brand font-semibold text-white disabled:opacity-60">
        {busy ? 'Please wait...' : submitLabel}
      </button>
    </form>
  );
}
