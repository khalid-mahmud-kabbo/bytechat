'use client';

import { useEffect, useState } from 'react';
import { FileText, LogOut, MoreHorizontal, Phone, Search, UserPlus, Video, X } from 'lucide-react';
import Avatar from './Avatar';
import NewChatModal from './NewChatModal';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';
import { formatSize, lastSeenText } from '@/lib/format';
import type { Chat, Message } from '@/lib/types';

const actions = [
  { label: 'Audio', icon: Phone },
  { label: 'Video', icon: Video },
  { label: 'Search', icon: Search },
  { label: 'More', icon: MoreHorizontal },
];

export default function ContactInfo({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const meId = useAuth((s) => s.user?.id);
  const lastId = chat.lastMessage?.id;
  const [media, setMedia] = useState<Message[]>([]);
  const [docs, setDocs] = useState<Message[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const isGroup = chat.type === 'GROUP';
  const canManage = isGroup && chat.myRole !== 'MEMBER';

  // refresh the shared media whenever the chat changes or a new message arrives
  useEffect(() => {
    let off = false;
    api<{ messages: Message[] }>(`/chats/${chat.id}/media?kind=media`).then((r) => !off && setMedia(r.messages)).catch(() => {});
    api<{ messages: Message[] }>(`/chats/${chat.id}/media?kind=docs`).then((r) => !off && setDocs(r.messages)).catch(() => {});
    return () => {
      off = true;
    };
  }, [chat.id, lastId]);

  useEffect(() => {
    if (!chat.peer) return;
    api<{ blockedByMe: boolean }>(`/users/${chat.peer.id}`).then((r) => setBlocked(r.blockedByMe)).catch(() => {});
  }, [chat.peer]);

  async function toggleBlock() {
    if (!chat.peer) return;
    await api(`/users/${chat.peer.id}/block`, { method: blocked ? 'DELETE' : 'POST' });
    setBlocked(!blocked);
  }

  async function leave() {
    if (!meId || !confirm('Leave this group?')) return;
    await api(`/chats/${chat.id}/members/${meId}`, { method: 'DELETE' });
    useChatStore.getState().removeChat(chat.id);
  }

  async function removeMember(userId: string) {
    if (!confirm('Remove this member?')) return;
    await api(`/chats/${chat.id}/members/${userId}`, { method: 'DELETE' });
  }

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel p-5 xl:flex">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{isGroup ? 'Group Info' : 'Contact Info'}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-soft">
          <X size={20} />
        </button>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <Avatar name={chat.title} src={chat.avatarUrl} size={128} group={isGroup && !chat.avatarUrl} />
        <div className="mt-3 text-lg font-bold">{chat.title}</div>
        {isGroup ? (
          <div className="text-sm text-muted">{chat.members.length} members</div>
        ) : (
          <>
            <div className="text-sm text-muted">{chat.peer?.phone}</div>
            <div className={`text-sm ${chat.peer?.isOnline ? 'font-medium text-brand' : 'text-muted'}`}>
              {chat.peer?.isOnline ? '● Online' : lastSeenText(chat.peer?.lastSeenAt ?? null)}
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex justify-between">
        {actions.map(({ label, icon: Icon }) => (
          <button key={label} className="flex flex-col items-center gap-1.5 text-xs" title="Coming soon">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-soft text-brand-dark dark:text-brand">
              <Icon size={20} />
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <div className="font-semibold">{isGroup ? 'Description' : 'About'}</div>
        <p className="mt-1 text-sm text-muted">{(isGroup ? chat.description : chat.peer?.about) || '—'}</p>
      </div>

      <div className="mt-6">
        <div className="font-semibold">Media &amp; Docs</div>
        {media.length === 0 && docs.length === 0 && <p className="mt-2 text-sm text-muted">Nothing shared yet</p>}
        {media.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {media.slice(0, 6).map((m) => (
              <a key={m.id} href={m.media?.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl bg-app">
                {m.type === 'IMAGE' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.media?.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={m.media?.url} preload="metadata" className="h-full w-full object-cover" />
                )}
              </a>
            ))}
          </div>
        )}
        {docs.slice(0, 5).map((d) => (
          <a key={d.id} href={d.media?.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-3 rounded-xl p-2 hover:bg-soft">
            <FileText size={20} className="text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{d.media?.fileName}</span>
              <span className="text-xs text-muted">{d.media ? formatSize(d.media.size) : ''}</span>
            </span>
          </a>
        ))}
      </div>

      {isGroup ? (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Members</span>
            {canManage && (
              <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 text-sm font-medium text-brand">
                <UserPlus size={16} /> Add
              </button>
            )}
          </div>
          <div className="mt-2 space-y-1">
            {chat.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-soft">
                <Avatar name={m.name ?? m.phone} src={m.avatarUrl} size={36} online={m.isOnline} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.id === meId ? 'You' : (m.name ?? m.phone)}</span>
                {m.role !== 'MEMBER' && <span className="rounded-full bg-soft px-2 py-0.5 text-[10px] font-semibold text-brand">{m.role.toLowerCase()}</span>}
                {canManage && m.id !== meId && m.role !== 'OWNER' && (
                  <button onClick={() => removeMember(m.id)} aria-label="Remove member" className="text-muted hover:text-red-500">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={leave} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-medium text-red-500 hover:bg-soft">
            <LogOut size={16} /> Leave group
          </button>
        </div>
      ) : (
        <button onClick={toggleBlock} className="mt-6 w-full rounded-xl border border-line py-2.5 text-sm font-medium text-red-500 hover:bg-soft">
          {blocked ? 'Unblock' : 'Block'} {chat.title}
        </button>
      )}

      {showAdd && <NewChatModal mode="add" chatId={chat.id} excludeIds={chat.members.map((m) => m.id)} onClose={() => setShowAdd(false)} />}
    </aside>
  );
}
