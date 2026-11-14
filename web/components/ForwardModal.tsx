'use client';

import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import Avatar from './Avatar';
import { api } from '@/lib/api';
import { messagePreview } from '@/lib/format';
import { useChatStore } from '@/lib/chat-store';
import type { Message } from '@/lib/types';

export default function ForwardModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const chats = useChatStore((s) => s.chats);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const list = useMemo(
    () => chats.filter((c) => !c.archivedAt && c.title.toLowerCase().includes(q.trim().toLowerCase())),
    [chats, q],
  );

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 10 ? [...p, id] : p));

  async function send() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ sent: number; failed: number }>('/chats/forward', {
        method: 'POST',
        body: JSON.stringify({ messageId: message.id, chatIds: picked }),
      });
      if (res.failed > 0) setError(`${res.failed} chat(s) could not receive the message`);
      else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not forward');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-3xl bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Forward to...</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-soft">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3 truncate rounded-xl bg-app px-3 py-2 text-sm text-muted">{messagePreview(message)}</div>

        <label className="mb-2 flex h-11 items-center gap-2 rounded-xl bg-app px-3 text-muted">
          <Search size={18} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>

        <div className="min-h-[120px] flex-1 space-y-1 overflow-y-auto">
          {list.map((c) => (
            <button key={c.id} onClick={() => toggle(c.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-soft">
              <Avatar name={c.title} src={c.avatarUrl} size={40} group={c.type === 'GROUP' && !c.avatarUrl} />
              <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
              {picked.includes(c.id) && <Check size={18} className="text-brand" />}
            </button>
          ))}
          {list.length === 0 && <p className="p-4 text-center text-sm text-muted">No chats found</p>}
        </div>

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button
          onClick={send}
          disabled={busy || picked.length === 0}
          className="mt-3 h-11 rounded-xl bg-brand font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Sending...' : `Send${picked.length ? ` to ${picked.length}` : ''}`}
        </button>
        <p className="mt-2 text-center text-xs text-muted">Up to 10 chats at once</p>
      </div>
    </div>
  );
}
