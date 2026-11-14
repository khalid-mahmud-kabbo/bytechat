'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Info, Mic, MoreVertical, Paperclip, Phone, Search, Send, Smile, Trash2, Video, X } from 'lucide-react';
import Avatar from './Avatar';
import EmojiPicker from './EmojiPicker';
import MessageBubble from './MessageBubble';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { startCall } from '@/lib/call-manager';
import { editMessage, imageSize, markChatRead, sendMedia, sendText, sendTyping } from '@/lib/chat-actions';
import { useChatStore } from '@/lib/chat-store';
import { dayLabel, lastSeenText, messagePreview } from '@/lib/format';
import { useVoiceRecorder } from '@/lib/use-voice-recorder';
import type { Chat, Message } from '@/lib/types';

const EMPTY: string[] = [];
const MAX_BYTES = 25 * 1024 * 1024;

type Props = { chat: Chat; onBack: () => void; onToggleInfo: () => void };

export default function ChatWindow({ chat, onBack, onToggleInfo }: Props) {
  const me = useAuth((s) => s.user)!;
  const messages = useChatStore((s) => s.messages[chat.id]);
  const hasMore = useChatStore((s) => !!s.hasMore[chat.id]);
  const typingIds = useChatStore((s) => s.typing[chat.id] ?? EMPTY);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const firstScroll = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const typingState = useRef<{ on: boolean; timer?: number }>({ on: false });
  const voice = useVoiceRecorder();

  // load the latest messages the first time this chat is opened
  useEffect(() => {
    let cancelled = false;
    if (!useChatStore.getState().messages[chat.id]) {
      api<{ messages: Message[]; hasMore: boolean }>(`/chats/${chat.id}/messages?limit=40`)
        .then((r) => !cancelled && useChatStore.getState().setMessages(chat.id, r.messages, r.hasMore))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [chat.id]);

  // opening a chat (or receiving while it is open) marks everything read
  useEffect(() => {
    if (chat.unread > 0 && document.visibilityState === 'visible') markChatRead(chat.id);
  }, [chat.id, chat.unread]);

  // keep the view pinned to the newest message unless the user scrolled up
  useEffect(() => {
    if (!stick.current) return;
    endRef.current?.scrollIntoView({ behavior: firstScroll.current ? 'auto' : 'smooth' });
    if (messages?.length) firstScroll.current = false;
  }, [messages?.length]);

  useEffect(() => () => stopTyping(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    const box = boxRef.current;
    if (box) stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  }

  async function loadOlder() {
    const first = messages?.find((m) => !m.pending && !m.failed);
    const box = boxRef.current;
    if (!first || !box) return;
    setLoadingOlder(true);
    stick.current = false;
    const prevHeight = box.scrollHeight;
    try {
      const r = await api<{ messages: Message[]; hasMore: boolean }>(
        `/chats/${chat.id}/messages?limit=40&before=${encodeURIComponent(first.createdAt)}`,
      );
      useChatStore.getState().prependMessages(chat.id, r.messages, r.hasMore);
      requestAnimationFrame(() => (box.scrollTop = box.scrollHeight - prevHeight)); // keep position
    } finally {
      setLoadingOlder(false);
    }
  }

  function stopTyping() {
    window.clearTimeout(typingState.current.timer);
    if (typingState.current.on) {
      typingState.current.on = false;
      sendTyping(chat.id, false);
    }
  }

  function onType(value: string) {
    setText(value);
    if (!value.trim()) return stopTyping();
    if (!typingState.current.on) {
      typingState.current.on = true;
      sendTyping(chat.id, true);
    }
    window.clearTimeout(typingState.current.timer);
    typingState.current.timer = window.setTimeout(stopTyping, 2500);
  }

  function submit() {
    const body = text.trim();
    if (!body) return;
    stick.current = true;
    if (editing) editMessage(editing.id, body);
    else sendText(chat.id, body, replyTo);
    setEditing(null);
    setReplyTo(null);
    setText('');
    setShowEmoji(false);
    stopTyping();
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    stick.current = true;
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        alert(`${file.name} is larger than 25 MB`);
        continue;
      }
      const size = await imageSize(file);
      sendMedia(chat.id, file, { fileName: file.name, width: size?.width, height: size?.height }, replyTo);
    }
    setReplyTo(null);
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  }

  async function sendVoice() {
    const r = await voice.stop();
    if (!r) return;
    stick.current = true;
    sendMedia(chat.id, r.blob, { fileName: 'voice-message', voice: true, durationMs: r.durationMs, waveform: r.waveform }, replyTo);
    setReplyTo(null);
  }

  function startEdit(m: Message) {
    setEditing(m);
    setReplyTo(null);
    setText(m.text ?? '');
  }

  const typingNames = typingIds.map((id) => chat.members.find((m) => m.id === id)?.name ?? 'Someone');
  const subtitle = typingIds.length
    ? chat.type === 'GROUP'
      ? `${typingNames[0]} is typing...`
      : 'typing...'
    : chat.type === 'GROUP'
      ? `${chat.members.length} members`
      : chat.peer?.isOnline
        ? '● Online'
        : lastSeenText(chat.peer?.lastSeenAt ?? null);
  const subtitleLive = typingIds.length > 0 || chat.peer?.isOnline;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-app">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1 md:hidden" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <Avatar name={chat.title} src={chat.avatarUrl} size={44} group={chat.type === 'GROUP' && !chat.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{chat.title}</div>
          <div className={`truncate text-xs ${subtitleLive ? 'font-medium text-brand' : 'text-muted'}`}>{subtitle}</div>
        </div>
        <div className="flex items-center gap-1 text-ink/80">
          <button className="rounded-full p-2.5 hover:bg-soft" title="Search (coming soon)">
            <Search size={20} />
          </button>
          {chat.peer && (
            <>
              <button onClick={() => void startCall(chat.peer!, 'VIDEO')} className="rounded-full p-2.5 hover:bg-soft" aria-label="Video call">
                <Video size={20} />
              </button>
              <button onClick={() => void startCall(chat.peer!, 'AUDIO')} className="rounded-full p-2.5 hover:bg-soft" aria-label="Voice call">
                <Phone size={20} />
              </button>
            </>
          )}
          <button onClick={onToggleInfo} className="hidden rounded-full p-2.5 hover:bg-soft xl:block" aria-label="Chat info">
            <Info size={20} />
          </button>
          <button className="rounded-full p-2.5 hover:bg-soft">
            <MoreVertical size={20} />
          </button>
        </div>
      </header>

      <div ref={boxRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto p-5">
        {hasMore && (
          <div className="text-center">
            <button onClick={loadOlder} disabled={loadingOlder} className="rounded-lg bg-panel px-3 py-1 text-xs font-medium text-brand shadow-sm">
              {loadingOlder ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}
        {!messages && <p className="text-center text-sm text-muted">Loading messages...</p>}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="text-center">
                  <span className="rounded-lg bg-panel px-3 py-1 text-xs font-medium text-muted shadow-sm">{dayLabel(m.createdAt)}</span>
                </div>
              )}
              <MessageBubble m={m} chat={chat} meId={me.id} onReply={setReplyTo} onEdit={startEdit} />
            </Fragment>
          );
        })}
        {messages && messages.length === 0 && <p className="pt-10 text-center text-sm text-muted">No messages yet. Say hi 👋</p>}
        <div ref={endRef} />
      </div>

      {(replyTo || editing) && (
        <div className="mx-4 flex items-center gap-3 rounded-t-2xl border-l-4 border-brand bg-panel px-4 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-brand">{editing ? 'Editing message' : `Replying to ${replyTo!.senderId === me.id ? 'yourself' : (chat.members.find((x) => x.id === replyTo!.senderId)?.name ?? 'message')}`}</div>
            <div className="truncate text-muted">{messagePreview(editing ?? replyTo)}</div>
          </div>
          <button
            onClick={() => {
              setReplyTo(null);
              setEditing(null);
              setText('');
            }}
            aria-label="Cancel"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <footer className="relative flex items-center gap-3 p-4">
        {showEmoji && <EmojiPicker onPick={(e) => onType(text + e)} />}

        {voice.recording ? (
          <div className="flex h-12 flex-1 items-center gap-3 rounded-2xl bg-panel px-4 shadow-sm">
            <button onClick={voice.cancel} aria-label="Cancel recording" className="text-red-500">
              <Trash2 size={20} />
            </button>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-sm">
              {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}
            </span>
            <span className="text-sm text-muted">Recording...</span>
          </div>
        ) : (
          <div className="flex h-12 flex-1 items-center gap-3 rounded-2xl bg-panel px-4 shadow-sm">
            <button onClick={() => setShowEmoji((v) => !v)} aria-label="Emoji" className="text-muted">
              <Smile size={22} />
            </button>
            <input
              value={text}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
              placeholder="Type a message..."
              className="flex-1 bg-transparent outline-none placeholder:text-muted"
            />
            <button onClick={() => fileRef.current?.click()} aria-label="Attach file" className="text-muted">
              <Paperclip size={20} />
            </button>
            <button onClick={() => cameraRef.current?.click()} aria-label="Camera" className="text-muted">
              <Camera size={20} />
            </button>
            <input ref={fileRef} type="file" multiple hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.zip" onChange={(e) => onFiles(e.target.files)} />
            <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => onFiles(e.target.files)} />
          </div>
        )}

        {voice.recording ? (
          <button onClick={sendVoice} className="grid h-12 w-12 place-items-center rounded-full bg-brand text-white" aria-label="Send voice message">
            <Send size={20} />
          </button>
        ) : text.trim() ? (
          <button onClick={submit} className="grid h-12 w-12 place-items-center rounded-full bg-brand text-white" aria-label="Send">
            <Send size={20} />
          </button>
        ) : (
          <button onClick={() => void voice.start()} className="grid h-12 w-12 place-items-center rounded-full bg-brand text-white" aria-label="Record voice message">
            <Mic size={20} />
          </button>
        )}
      </footer>
    </section>
  );
}
