'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, Trash2, X } from 'lucide-react';
import Avatar from './Avatar';
import { api } from '@/lib/api';
import { formatListTime } from '@/lib/format';
import type { LiteUser, StoryGroup } from '@/lib/types';

const IMAGE_MS = 5000;

type Props = { group: StoryGroup; onClose: () => void; onChanged: () => void };

export default function StoryViewer({ group, onClose, onChanged }: Props) {
  const [idx, setIdx] = useState(() => {
    const first = group.stories.findIndex((s) => !s.viewed); // resume at the first unseen one
    return first >= 0 ? first : 0;
  });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState<{ viewer: LiteUser; viewedAt: string }[] | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const story = group.stories[idx];
  const name = group.isMine ? 'My status' : (group.user.name ?? group.user.phone);

  const next = () => (idx < group.stories.length - 1 ? (setIdx(idx + 1), setProgress(0)) : onClose());
  const prev = () => (idx > 0 ? (setIdx(idx - 1), setProgress(0)) : setProgress(0));

  // tell the server this status was seen
  useEffect(() => {
    if (!story || group.isMine || story.viewed) return;
    api(`/stories/${story.id}/view`, { method: 'POST' }).then(onChanged).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // progress bar for text/image statuses (videos report their own progress)
  useEffect(() => {
    if (!story || story.type === 'VIDEO' || paused || viewers) return;
    const started = Date.now() - progress * IMAGE_MS;
    const t = setInterval(() => {
      const p = (Date.now() - started) / IMAGE_MS;
      if (p >= 1) {
        clearInterval(t);
        next();
      } else setProgress(p);
    }, 50);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused, viewers]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  async function showViewers() {
    setViewers([]);
    try {
      const r = await api<{ views: { viewer: LiteUser; viewedAt: string }[] }>(`/stories/${story.id}/views`);
      setViewers(r.views);
    } catch {
      setViewers([]);
    }
  }

  async function remove() {
    if (!confirm('Delete this status?')) return;
    await api(`/stories/${story.id}`, { method: 'DELETE' });
    onChanged();
    if (group.stories.length === 1) onClose();
    else next();
  }

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95" onClick={onClose}>
      <div
        className="relative flex h-full max-h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-black sm:h-[92vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
      >
        {/* progress bars */}
        <div className="absolute left-0 right-0 top-0 z-20 flex gap-1 p-3">
          {group.stories.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full bg-white" style={{ width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>

        <div className="absolute left-0 right-0 top-4 z-20 flex items-center gap-3 px-4 pt-3 text-white">
          <Avatar name={group.user.name ?? group.user.phone} src={group.user.avatarUrl} size={38} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="text-xs text-white/70">{formatListTime(story.createdAt)}</div>
          </div>
          {group.isMine && (
            <button onClick={remove} aria-label="Delete status" className="rounded-full p-2 hover:bg-white/10">
              <Trash2 size={20} />
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-white/10">
            <X size={22} />
          </button>
        </div>

        {/* content */}
        <div className="relative flex flex-1 items-center justify-center">
          {story.type === 'TEXT' && (
            <div
              className="flex h-full w-full items-center justify-center p-8 text-center text-3xl font-semibold leading-snug text-white"
              style={{ background: story.bgColor ?? '#12a868' }}
            >
              <span className="whitespace-pre-wrap break-words">{story.text}</span>
            </div>
          )}
          {story.type === 'IMAGE' && story.media && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.media.url} alt="" className="max-h-full max-w-full object-contain" />
          )}
          {story.type === 'VIDEO' && story.media && (
            <video
              key={story.id}
              ref={videoRef}
              src={story.media.url}
              autoPlay
              playsInline
              className="max-h-full max-w-full"
              onTimeUpdate={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setProgress(e.currentTarget.currentTime / d);
              }}
              onEnded={next}
            />
          )}

          {/* tap zones */}
          <button className="absolute inset-y-16 left-0 w-1/3" onClick={prev} aria-label="Previous" />
          <button className="absolute inset-y-16 right-0 w-1/3" onClick={next} aria-label="Next" />
        </div>

        {story.type !== 'TEXT' && story.text && (
          <div className="absolute bottom-16 left-0 right-0 z-10 bg-gradient-to-t from-black/70 to-transparent p-4 text-center text-white">{story.text}</div>
        )}

        {group.isMine && (
          <button onClick={showViewers} className="z-20 flex items-center justify-center gap-2 py-4 text-sm text-white">
            <Eye size={18} /> {story.viewCount ?? 0} view{story.viewCount === 1 ? '' : 's'}
          </button>
        )}

        {viewers && (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[60%] overflow-y-auto rounded-t-3xl bg-panel p-4 text-ink">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Viewed by {viewers.length}</span>
              <button onClick={() => setViewers(null)} aria-label="Close list">
                <X size={20} />
              </button>
            </div>
            {viewers.length === 0 && <p className="py-4 text-center text-sm text-muted">No views yet</p>}
            {viewers.map((v) => (
              <div key={v.viewer.id} className="flex items-center gap-3 py-2">
                <Avatar name={v.viewer.name ?? v.viewer.phone} src={v.viewer.avatarUrl} size={36} />
                <span className="flex-1 truncate">{v.viewer.name ?? v.viewer.phone}</span>
                <span className="text-xs text-muted">{formatListTime(v.viewedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
