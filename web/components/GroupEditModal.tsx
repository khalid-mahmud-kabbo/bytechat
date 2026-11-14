'use client';

import { useState } from 'react';
import { Camera, X } from 'lucide-react';
import Avatar from './Avatar';
import { api } from '@/lib/api';
import { useChatStore } from '@/lib/chat-store';
import type { Chat } from '@/lib/types';

export default function GroupEditModal({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const [name, setName] = useState(chat.title);
  const [description, setDescription] = useState(chat.description ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(chat.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  async function save() {
    setBusy(true);
    setError('');
    try {
      const { chat: updated } = await api<{ chat: Chat }>(`/chats/${chat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description: description.trim() || null, avatarUrl }),
      });
      useChatStore.getState().upsertChat(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-3xl bg-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit group</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-soft">
            <X size={20} />
          </button>
        </div>

        <div className="flex justify-center">
          <label className="relative cursor-pointer">
            <Avatar name={name || 'Group'} src={avatarUrl} size={88} group={!avatarUrl} />
            <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-brand text-white shadow">
              <Camera size={16} />
            </span>
            <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => pickAvatar(e.target.files?.[0])} />
          </label>
        </div>

        <label className="block text-sm font-medium">
          Group name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="mt-1 h-11 w-full rounded-xl border border-line bg-app px-3 font-normal outline-none focus:border-brand"
          />
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full resize-none rounded-xl border border-line bg-app px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <button onClick={save} disabled={busy || !name.trim()} className="h-11 w-full rounded-xl bg-brand font-semibold text-white disabled:opacity-60">
          {busy ? 'Please wait...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
