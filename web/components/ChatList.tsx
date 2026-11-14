'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, BellOff, MoreVertical, Pin, Search, SquarePen } from 'lucide-react';
import Avatar from './Avatar';
import NewChatModal from './NewChatModal';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { isMuted, MUTE_FOREVER, muteFor, setChatSettings } from '@/lib/chat-actions';
import { useChatStore } from '@/lib/chat-store';
import { formatListTime, messagePreview } from '@/lib/format';
import type { Chat } from '@/lib/types';

type Hit = { id: string; chatId: string; senderId: string; text: string; createdAt: string; chatTitle: string };

const HOUR = 3_600_000;

export default function ChatList() {
  const meId = useAuth((s) => s.user?.id);
  const chats = useChatStore((s) => s.chats);
  const loaded = useChatStore((s) => s.loaded);
  const activeId = useChatStore((s) => s.activeChatId);
  const typing = useChatStore((s) => s.typing);
  const setActive = useChatStore((s) => s.setActive);

  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Chat[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const loadArchived = () =>
    api<{ chats: Chat[] }>('/chats?archived=1')
      .then((r) => setArchived(r.chats))
      .catch(() => {});

  useEffect(() => {
    if (showArchived) void loadArchived();
  }, [showArchived]);

  // search inside message text (the title filter below is instant, this part asks the server)
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ messages: Hit[] }>(`/chats/search/messages?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.messages))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const source = showArchived ? archived : chats.filter((c) => !c.archivedAt);
  const filtered = useMemo(
    () => source.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, q],
  );

  async function act(chat: Chat, patch: Parameters<typeof setChatSettings>[1]) {
    setMenuFor(null);
    await setChatSettings(chat.id, patch).catch(() => {});
    if (showArchived) void loadArchived();
  }

  async function openHit(h: Hit) {
    if (!useChatStore.getState().chats.some((c) => c.id === h.chatId)) {
      try {
        const { chat } = await api<{ chat: Chat }>(`/chats/${h.chatId}`);
        useChatStore.getState().upsertChat(chat);
      } catch {
        return;
      }
    }
    useChatStore.getState().setJump({ chatId: h.chatId, messageId: h.id });
    setActive(h.chatId);
  }

  return (
    <section className="flex h-full w-full flex-col border-r border-line bg-panel md:w-[360px] md:shrink-0">
      <div className="flex items-center gap-3 p-4">
        {showArchived && (
          <button onClick={() => setShowArchived(false)} aria-label="Back" className="rounded-lg p-1">
            <ArrowLeft size={20} />
          </button>
        )}
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl bg-app px-3 text-muted">
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={showArchived ? 'Search archived chats...' : 'Search chats and messages...'}
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
        {!showArchived && (
          <button
            onClick={() => setShowArchived(true)}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-soft/60"
          >
            <Archive size={18} /> Archived chats
          </button>
        )}
        {showArchived && <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">Archived</p>}

        {filtered.map((c) => {
          const isTyping = (typing[c.id]?.length ?? 0) > 0;
          const muted = isMuted(c);
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setActive(c.id)}
              onKeyDown={(e) => e.key === 'Enter' && setActive(c.id)}
              className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                c.id === activeId ? 'bg-soft' : 'hover:bg-soft/60'
              }`}
            >
              <Avatar name={c.title} src={c.avatarUrl} online={c.peer?.isOnline} group={c.type === 'GROUP' && !c.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{c.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                    {muted && <BellOff size={12} />}
                    {formatListTime(c.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {isTyping ? (
                    <span className="truncate text-sm font-medium text-brand">typing...</span>
                  ) : (
                    <span className="truncate text-sm text-muted">{messagePreview(c.lastMessage, meId, c.type === 'GROUP')}</span>
                  )}
                  <span className="flex shrink-0 items-center gap-1">
                    {c.pinnedAt && <Pin size={13} className="text-muted" />}
                    {c.unread > 0 && (
                      <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-semibold text-white ${muted ? 'bg-muted' : 'bg-brand'}`}>
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === c.id ? null : c.id);
                }}
                aria-label="Chat options"
                className="absolute right-2 top-2 hidden rounded-full bg-panel p-1 shadow group-hover:block"
              >
                <MoreVertical size={16} />
              </button>

              {menuFor === c.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-9 z-20 w-48 overflow-hidden rounded-2xl border border-line bg-panel py-1 text-sm shadow-xl"
                  >
                    <button onClick={() => act(c, { pinned: !c.pinnedAt })} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-soft">
                      <Pin size={15} /> {c.pinnedAt ? 'Unpin chat' : 'Pin chat'}
                    </button>
                    {muted ? (
                      <button onClick={() => act(c, { mutedUntil: null })} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-soft">
                        <BellOff size={15} /> Unmute
                      </button>
                    ) : (
                      <>
                        <button onClick={() => act(c, { mutedUntil: muteFor(8 * HOUR) })} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-soft">
                          <BellOff size={15} /> Mute 8 hours
                        </button>
                        <button onClick={() => act(c, { mutedUntil: muteFor(7 * 24 * HOUR) })} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-soft">
                          <BellOff size={15} /> Mute 1 week
                        </button>
                        <button onClick={() => act(c, { mutedUntil: MUTE_FOREVER })} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-soft">
                          <BellOff size={15} /> Mute always
                        </button>
                      </>
                    )}
                    <button onClick={() => act(c, { archived: !c.archivedAt })} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-soft">
                      {c.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                      {c.archivedAt ? 'Unarchive' : 'Archive chat'}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {loaded && filtered.length === 0 && hits.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">
            {q ? 'No chats found' : showArchived ? 'No archived chats' : 'No chats yet. Tap the pen icon to start one.'}
          </p>
        )}

        {hits.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Messages</p>
            {hits.map((h) => (
              <button key={h.id} onClick={() => void openHit(h)} className="block w-full rounded-2xl px-3 py-2.5 text-left hover:bg-soft/60">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{h.chatTitle}</span>
                  <span className="shrink-0 text-xs text-muted">{formatListTime(h.createdAt)}</span>
                </span>
                <span className="line-clamp-2 text-sm text-muted">{h.text}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {showNew && <NewChatModal mode="chat" onClose={() => setShowNew(false)} />}
    </section>
  );
}
