'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Pencil, Plus } from 'lucide-react';
import Avatar from '@/components/Avatar';
import StoryViewer from '@/components/StoryViewer';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatListTime } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import type { StoryGroup } from '@/lib/types';

const COLORS = ['#12a868', '#0b6e8a', '#7c3aed', '#db2777', '#ea580c', '#475569', '#b91c1c', '#0f766e'];

function Ring({ group, onOpen }: { group: StoryGroup; onOpen: () => void }) {
  const last = group.stories[group.stories.length - 1];
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-soft/60">
      <span className={`rounded-full p-[3px] ${group.hasUnviewed ? 'bg-brand' : 'bg-line'}`}>
        <span className="block rounded-full border-2 border-panel">
          <Avatar name={group.user.name ?? group.user.phone} src={group.user.avatarUrl} size={48} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{group.isMine ? 'My status' : (group.user.name ?? group.user.phone)}</span>
        <span className="text-xs text-muted">{formatListTime(last.createdAt)}</span>
      </span>
    </button>
  );
}

export default function StatusPage() {
  const me = useAuth((s) => s.user);
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ groups: StoryGroup[] }>('/stories');
      setGroups(r.groups);
    } catch {
      /* keep what we have */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const socket = getSocket();
    socket.on('story:new', load);
    return () => {
      socket.off('story:new', load);
    };
  }, [load]);

  const mine = groups.find((g) => g.isMine);
  const others = groups.filter((g) => !g.isMine);
  const recent = others.filter((g) => g.hasUnviewed);
  const viewed = others.filter((g) => !g.hasUnviewed);
  const open = groups.find((g) => g.user.id === openId) ?? null;

  async function postText() {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api('/stories', { method: 'POST', body: JSON.stringify({ type: 'TEXT', text: text.trim(), bgColor: color }) });
      setComposing(false);
      setText('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  }

  async function postMedia(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setError('Choose a photo or a video');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const { media } = await api<{ media: { id: string } }>('/media', { method: 'POST', body: form });
      await api('/stories', {
        method: 'POST',
        body: JSON.stringify({ type: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE', mediaId: media.id }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-app p-6">
      <div className="mx-auto max-w-xl rounded-3xl bg-panel p-4 shadow-sm">
        <h1 className="px-3 pb-3 pt-2 text-2xl font-bold">Status</h1>

        {/* my status */}
        {mine ? (
          <Ring group={mine} onOpen={() => setOpenId(mine.user.id)} />
        ) : (
          <div className="flex items-center gap-3 px-3 py-3">
            <div className="relative">
              <Avatar name={me?.name ?? me?.phone ?? 'Me'} src={me?.avatarUrl} size={52} />
              <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full border-2 border-panel bg-brand text-white">
                <Plus size={12} />
              </span>
            </div>
            <div>
              <div className="font-semibold">My status</div>
              <div className="text-xs text-muted">Disappears after 24 hours</div>
            </div>
          </div>
        )}

        <div className="flex gap-3 px-3 pb-4">
          <button
            onClick={() => setComposing(true)}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-soft disabled:opacity-60"
          >
            <Pencil size={16} /> Text
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-soft disabled:opacity-60"
          >
            <Camera size={16} /> {busy ? 'Uploading...' : 'Photo / Video'}
          </button>
          <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(e) => postMedia(e.target.files?.[0])} />
        </div>
        {error && <p className="px-3 pb-3 text-sm text-red-500">{error}</p>}

        {recent.length > 0 && <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent updates</div>}
        {recent.map((g) => (
          <Ring key={g.user.id} group={g} onOpen={() => setOpenId(g.user.id)} />
        ))}
        {viewed.length > 0 && <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">Viewed</div>}
        {viewed.map((g) => (
          <Ring key={g.user.id} group={g} onOpen={() => setOpenId(g.user.id)} />
        ))}
        {loaded && others.length === 0 && <p className="p-6 text-center text-sm text-muted">Status updates from people you chat with appear here.</p>}
      </div>

      {composing && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: color }}>
          <div className="flex items-center justify-between p-4 text-white">
            <button onClick={() => setComposing(false)} className="rounded-lg px-3 py-1.5 hover:bg-white/10">
              Cancel
            </button>
            <button onClick={postText} disabled={busy || !text.trim()} className="rounded-full bg-white px-5 py-2 font-semibold text-black disabled:opacity-50">
              {busy ? 'Posting...' : 'Post'}
            </button>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={700}
            placeholder="Type a status"
            className="flex-1 resize-none bg-transparent p-8 text-center text-3xl font-semibold text-white outline-none placeholder:text-white/60"
          />
          <div className="flex justify-center gap-3 p-5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={`h-8 w-8 rounded-full border-2 ${c === color ? 'border-white' : 'border-white/30'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      {open && <StoryViewer key={open.user.id} group={open} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
