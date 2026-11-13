'use client';

import { useEffect, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import Avatar from './Avatar';
import { api } from '@/lib/api';
import { useChatStore } from '@/lib/chat-store';
import type { Chat, LiteUser } from '@/lib/types';

type Props = {
  mode: 'chat' | 'add'; // 'add' = add members to an existing group
  chatId?: string;
  excludeIds?: string[];
  onClose: () => void;
};

export default function NewChatModal({ mode, chatId, excludeIds = [], onClose }: Props) {
  const [tab, setTab] = useState<'direct' | 'group'>('direct');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LiteUser[]>([]);
  const [picked, setPicked] = useState<LiteUser[]>([]);
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const multi = mode === 'add' || tab === 'group';

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ users: LiteUser[] }>(`/users/search?q=${encodeURIComponent(q.trim())}`);
        setResults(r.users.filter((u) => !excludeIds.includes(u.id)));
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function open(chat: Chat) {
    useChatStore.getState().upsertChat(chat);
    useChatStore.getState().setActive(chat.id);
    onClose();
  }

  async function startDirect(u: LiteUser) {
    setBusy(true);
    try {
      const { chat } = await api<{ chat: Chat }>('/chats/direct', { method: 'POST', body: JSON.stringify({ userId: u.id }) });
      open(chat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start chat');
      setBusy(false);
    }
  }

  function toggle(u: LiteUser) {
    setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));
  }

  async function submitMulti() {
    setBusy(true);
    setError('');
    try {
      if (mode === 'add' && chatId) {
        const { chat } = await api<{ chat: Chat }>(`/chats/${chatId}/members`, {
          method: 'POST',
          body: JSON.stringify({ userIds: picked.map((u) => u.id) }),
        });
        useChatStore.getState().upsertChat(chat);
        onClose();
      } else {
        const { chat } = await api<{ chat: Chat }>('/chats/group', {
          method: 'POST',
          body: JSON.stringify({ name: groupName, memberIds: picked.map((u) => u.id) }),
        });
        open(chat);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  }

  const canSubmit = picked.length > 0 && (mode === 'add' || groupName.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-3xl bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{mode === 'add' ? 'Add members' : tab === 'direct' ? 'New chat' : 'New group'}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-soft">
            <X size={20} />
          </button>
        </div>

        {mode === 'chat' && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-app p-1 text-sm font-medium">
            {(['direct', 'group'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setPicked([]);
                }}
                className={`rounded-lg py-2 ${tab === t ? 'bg-panel shadow-sm' : 'text-muted'}`}
              >
                {t === 'direct' ? 'Chat' : 'Group'}
              </button>
            ))}
          </div>
        )}

        {mode === 'chat' && tab === 'group' && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            maxLength={60}
            className="mb-3 h-11 rounded-xl border border-line bg-app px-3 outline-none focus:border-brand"
          />
        )}

        {picked.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {picked.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u)}
                className="flex items-center gap-1 rounded-full bg-soft px-3 py-1 text-sm"
              >
                {u.name ?? u.phone} <X size={14} />
              </button>
            ))}
          </div>
        )}

        <label className="mb-2 flex h-11 items-center gap-2 rounded-xl bg-app px-3 text-muted">
          <Search size={18} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or phone number"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>

        <div className="min-h-[120px] flex-1 space-y-1 overflow-y-auto">
          {results.map((u) => {
            const on = picked.some((x) => x.id === u.id);
            return (
              <button
                key={u.id}
                disabled={busy}
                onClick={() => (multi ? toggle(u) : startDirect(u))}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-soft"
              >
                <Avatar name={u.name ?? u.phone} src={u.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.name ?? u.phone}</div>
                  <div className="truncate text-xs text-muted">{u.name ? u.phone : u.about}</div>
                </div>
                {multi && on && <Check size={18} className="text-brand" />}
              </button>
            );
          })}
          {q.trim().length >= 2 && results.length === 0 && !error && (
            <p className="p-4 text-center text-sm text-muted">No users found</p>
          )}
          {q.trim().length < 2 && <p className="p-4 text-center text-sm text-muted">Type at least 2 characters</p>}
        </div>

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        {multi && (
          <button
            disabled={!canSubmit || busy}
            onClick={submitMulti}
            className="mt-3 h-11 rounded-xl bg-brand font-semibold text-white disabled:opacity-50"
          >
            {mode === 'add' ? `Add ${picked.length || ''} member(s)` : 'Create group'}
          </button>
        )}
      </div>
    </div>
  );
}
