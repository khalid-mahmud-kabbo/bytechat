'use client';

import { useRef, useState } from 'react';
import { AlertCircle, Check, CheckCheck, Clock, FileText, Forward, Pause, Pencil, Play, Reply, SmilePlus, Trash2 } from 'lucide-react';
import { formatDuration, formatSize, formatTime } from '@/lib/format';
import { deleteMessage, reactToMessage, retrySend } from '@/lib/chat-actions';
import type { Chat, MediaInfo, Message } from '@/lib/types';

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function Ticks({ m }: { m: Message }) {
  if (m.failed) return <AlertCircle size={14} className="text-red-500" />;
  if (m.pending) return <Clock size={13} className="text-muted" />;
  if (m.status === 'sent') return <Check size={14} className="text-muted" />;
  return <CheckCheck size={14} className={m.status === 'read' ? 'text-sky-500' : 'text-muted'} />;
}

function VoicePlayer({ media }: { media: MediaInfo }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = media.waveform.length ? media.waveform : Array<number>(40).fill(20);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play();
  }

  return (
    <div className="flex w-64 items-center gap-3">
      <button onClick={toggle} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white" aria-label="Play voice message">
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <div className="flex h-8 flex-1 items-center gap-[2px]">
        {bars.map((v, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full ${i / bars.length < progress ? 'bg-brand' : 'bg-brand/35'}`}
            style={{ height: 4 + v * 0.24 }}
          />
        ))}
      </div>
      <span className="text-xs text-muted">{formatDuration(media.durationMs)}</span>
      <audio
        ref={ref}
        src={media.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const total = (media.durationMs ?? 0) / 1000 || e.currentTarget.duration;
          if (Number.isFinite(total) && total > 0) setProgress(Math.min(1, e.currentTarget.currentTime / total));
        }}
      />
    </div>
  );
}

type Props = {
  m: Message;
  chat: Chat;
  meId: string;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onForward: (m: Message) => void;
};

export default function MessageBubble({ m, chat, meId, onReply, onEdit, onForward }: Props) {
  const mine = m.senderId === meId;
  const [picker, setPicker] = useState(false);
  const sender = chat.type === 'GROUP' && !mine ? chat.members.find((x) => x.id === m.senderId) : null;
  const canAct = !m.pending && !m.failed && !m.deletedAt;

  const grouped = Object.entries(
    m.reactions.reduce<Record<string, string[]>>((acc, r) => {
      (acc[r.emoji] ??= []).push(r.userId);
      return acc;
    }, {}),
  );

  return (
    <div id={`msg-${m.id}`} className={`group flex transition-colors ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[78%] ${mine ? 'items-end' : 'items-start'}`}>
        {/* hover toolbar */}
        {canAct && (
          <div
            className={`absolute -top-4 z-10 hidden items-center gap-0.5 rounded-full border border-line bg-panel px-1 py-0.5 shadow group-hover:flex ${
              mine ? 'right-2' : 'left-2'
            }`}
          >
            <button title="Reply" onClick={() => onReply(m)} className="rounded-full p-1.5 hover:bg-soft"><Reply size={14} /></button>
            <button title="Forward" onClick={() => onForward(m)} className="rounded-full p-1.5 hover:bg-soft"><Forward size={14} /></button>
            <button title="React" onClick={() => setPicker((v) => !v)} className="rounded-full p-1.5 hover:bg-soft"><SmilePlus size={14} /></button>
            {mine && m.type === 'TEXT' && (
              <button title="Edit" onClick={() => onEdit(m)} className="rounded-full p-1.5 hover:bg-soft"><Pencil size={14} /></button>
            )}
            {mine && (
              <button
                title="Delete for everyone"
                onClick={() => confirm('Delete this message for everyone?') && deleteMessage(m.id)}
                className="rounded-full p-1.5 text-red-500 hover:bg-soft"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
        {picker && canAct && (
          <div className={`absolute -top-12 z-20 flex gap-1 rounded-full border border-line bg-panel px-2 py-1 shadow-lg ${mine ? 'right-0' : 'left-0'}`}>
            {QUICK.map((e) => (
              <button
                key={e}
                onClick={() => {
                  reactToMessage(m.id, e);
                  setPicker(false);
                }}
                className="text-lg hover:scale-125"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <div className={`rounded-2xl px-3.5 py-2 shadow-sm ${mine ? 'rounded-br-md bg-bubble-out' : 'rounded-bl-md bg-bubble-in'}`}>
          {sender && <div className="mb-0.5 text-xs font-semibold text-brand">{sender.name ?? sender.phone}</div>}

          {m.replyTo && !m.deletedAt && (
            <div className="mb-1.5 rounded-lg border-l-4 border-brand bg-black/5 px-2 py-1 text-xs dark:bg-white/5">
              <div className="font-semibold text-brand">
                {m.replyTo.senderId === meId ? 'You' : (chat.members.find((x) => x.id === m.replyTo!.senderId)?.name ?? 'Message')}
              </div>
              <div className="line-clamp-2 text-muted">
                {m.replyTo.text ?? (m.replyTo.type === 'TEXT' ? 'Deleted message' : `[${m.replyTo.type.toLowerCase()}]`)}
              </div>
            </div>
          )}

          {m.deletedAt ? (
            <span className="italic text-muted">🚫 This message was deleted</span>
          ) : (
            <>
              {m.type === 'TEXT' && <span className="whitespace-pre-wrap break-words">{m.text}</span>}

              {m.type === 'IMAGE' && m.media && (
                <a href={m.media.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.media.url}
                    alt={m.media.fileName ?? 'Photo'}
                    width={m.media.width ?? undefined}
                    height={m.media.height ?? undefined}
                    className="mb-1 max-h-80 max-w-full rounded-xl object-cover"
                  />
                </a>
              )}

              {m.type === 'VIDEO' && m.media && (
                <video src={m.media.url} controls preload="metadata" className="mb-1 max-h-80 max-w-full rounded-xl" />
              )}

              {m.type === 'VOICE' && m.media && <VoicePlayer media={m.media} />}

              {m.type === 'AUDIO' && m.media && <audio src={m.media.url} controls className="w-64 max-w-full" />}

              {m.type === 'DOCUMENT' && m.media && (
                <a href={m.media.url} target="_blank" rel="noreferrer" className="flex w-60 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-soft text-brand-dark dark:text-brand">
                    <FileText size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{m.media.fileName ?? 'Document'}</span>
                    <span className="text-xs text-muted">{formatSize(m.media.size)}</span>
                  </span>
                </a>
              )}

              {m.type !== 'TEXT' && m.text && <div className="mt-1 whitespace-pre-wrap break-words">{m.text}</div>}
            </>
          )}

          <span className="ml-3 inline-flex translate-y-1 items-center gap-1 align-bottom text-[11px] text-muted">
            {m.editedAt && !m.deletedAt && <span>edited</span>}
            {formatTime(m.createdAt)}
            {mine && <Ticks m={m} />}
          </span>
        </div>

        {m.failed && m.clientId && (
          <button onClick={() => retrySend(m.clientId!)} className="mt-1 text-xs font-medium text-red-500">
            Failed to send · Tap to retry
          </button>
        )}

        {grouped.length > 0 && (
          <div className={`-mt-1 flex gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
            {grouped.map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => reactToMessage(m.id, emoji)}
                className={`rounded-full border px-1.5 py-0.5 text-xs shadow-sm ${
                  users.includes(meId) ? 'border-brand bg-soft' : 'border-line bg-panel'
                }`}
              >
                {emoji} {users.length > 1 ? users.length : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
