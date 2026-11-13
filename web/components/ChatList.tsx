'use client';

import { useMemo, useState } from 'react';
import { Search, SquarePen } from 'lucide-react';
import Avatar from './Avatar';
import NewChatModal from './NewChatModal';
import { formatListTime, messagePreview } from '@/lib/format';
import { useAuth } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';

export default function ChatList() {
  const meId = useAuth((s) => s.user?.id);
  const chats = useChatStore((s) => s.chats);
  const loaded = useChatStore((s) => s.loaded);
  const activeId = useChatStore((s) => s.activeChatId);
  const typing = useChatStore((s) => s.typing);
  const setActive = useChatStore((s) => s.setActive);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(
    () => chats.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())),
    [chats, q],
  );

  return (
    <section className="flex h-full w-full flex-col border-r border-line bg-panel md:w-[360px] md:shrink-0">
      <div className="flex items-center gap-3 p-4">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl bg-app px-3 text-muted">
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats..."
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>
        <button
          onClick={() => setShowNew(true)}
          className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white"
          aria-label="New chat"
        >
          <SquarePen size={19} />
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {filtered.map((c) => {
          const isTyping = (typing[c.id]?.length ?? 0) > 0;
          return (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                c.id === activeId ? 'bg-soft' : 'hover:bg-soft/60'
              }`}
            >
              <Avatar name={c.title} src={c.avatarUrl} online={c.peer?.isOnline} group={c.type === 'GROUP' && !c.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{c.title}</span>
                  <span className="shrink-0 text-xs text-muted">{formatListTime(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {isTyping ? (
                    <span className="truncate text-sm font-medium text-brand">typing...</span>
                  ) : (
                    <span className="truncate text-sm text-muted">{messagePreview(c.lastMessage, meId, c.type === 'GROUP')}</span>
                  )}
                  {c.unread > 0 && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white">
                      {c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {loaded && filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">
            {q ? 'No chats found' : 'No chats yet. Tap the pen icon to start one.'}
          </p>
        )}
      </div>

      {showNew && <NewChatModal mode="chat" onClose={() => setShowNew(false)} />}
    </section>
  );
}
