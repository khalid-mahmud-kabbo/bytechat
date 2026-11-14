'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { api } from '@/lib/api';
import { useChatStore } from '@/lib/chat-store';
import type { Chat, LiteUser } from '@/lib/types';

export default function ContactsPage() {
  const router = useRouter();
  const chats = useChatStore((s) => s.chats);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<LiteUser[]>([]);
  const [error, setError] = useState('');

  // people I already chat with
  const mine = useMemo(() => {
    const seen = new Map<string, LiteUser>();
    for (const c of chats) if (c.type === 'DIRECT' && c.peer) seen.set(c.peer.id, c.peer);
    return [...seen.values()].sort((a, b) => (a.name ?? a.phone).localeCompare(b.name ?? b.phone));
  }, [chats]);

  const searching = q.trim().length >= 2;
  const filteredMine = useMemo(
    () => (searching ? mine.filter((u) => `${u.name ?? ''} ${u.phone}`.toLowerCase().includes(q.trim().toLowerCase())) : mine),
    [mine, q, searching],
  );

  useEffect(() => {
    if (!searching) {
      setFound([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ users: LiteUser[] }>(`/users/search?q=${encodeURIComponent(q.trim())}`);
        setFound(r.users.filter((u) => !mine.some((m) => m.id === u.id)));
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, searching, mine]);

  async function open(u: LiteUser) {
    try {
      const { chat } = await api<{ chat: Chat }>('/chats/direct', { method: 'POST', body: JSON.stringify({ userId: u.id }) });
      useChatStore.getState().upsertChat(chat);
      useChatStore.getState().setActive(chat.id);
      router.push('/chats');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open chat');
    }
  }

  const Row = ({ u }: { u: LiteUser }) => (
    <button onClick={() => open(u)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-soft/60">
      <Avatar name={u.name ?? u.phone} src={u.avatarUrl} size={46} online={u.isOnline} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{u.name ?? u.phone}</span>
        <span className="block truncate text-xs text-muted">{u.name ? u.phone : u.about}</span>
      </span>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto bg-app p-6">
      <div className="mx-auto max-w-xl rounded-3xl bg-panel p-4 shadow-sm">
        <h1 className="px-3 pb-3 pt-2 text-2xl font-bold">Contacts</h1>
        <label className="mx-3 mb-3 flex h-11 items-center gap-2 rounded-xl bg-app px-3 text-muted">
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people by name or phone"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>

        {error && <p className="px-3 pb-2 text-sm text-red-500">{error}</p>}

        {filteredMine.length > 0 && <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Your contacts</div>}
        {filteredMine.map((u) => (
          <Row key={u.id} u={u} />
        ))}

        {found.length > 0 && <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">On ByteChat</div>}
        {found.map((u) => (
          <Row key={u.id} u={u} />
        ))}

        {filteredMine.length === 0 && found.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">
            {searching ? 'No people found' : 'People you chat with appear here. Search to find someone new.'}
          </p>
        )}
      </div>
    </div>
  );
}
