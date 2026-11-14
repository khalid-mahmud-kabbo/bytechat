'use client';

import { useEffect, useState } from 'react';
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Phone, Video } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { api } from '@/lib/api';
import { startCall } from '@/lib/call-manager';
import { formatDuration, formatListTime } from '@/lib/format';
import type { CallLogItem } from '@/lib/types';

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLogItem[] | null>(null);

  useEffect(() => {
    api<{ calls: CallLogItem[] }>('/calls')
      .then((r) => setCalls(r.calls))
      .catch(() => setCalls([]));
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-app p-6">
      <div className="mx-auto max-w-xl rounded-3xl bg-panel p-4 shadow-sm">
        <h1 className="px-3 pb-3 pt-2 text-2xl font-bold">Calls</h1>
        {calls === null && <p className="p-6 text-center text-sm text-muted">Loading...</p>}
        {calls?.length === 0 && <p className="p-6 text-center text-sm text-muted">No calls yet. Start one from a chat.</p>}
        {calls?.map((c) => {
          const Icon = c.missed ? PhoneMissed : c.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
          const name = c.peer.name ?? c.peer.phone;
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-soft/60">
              <Avatar name={name} src={c.peer.avatarUrl} size={46} />
              <div className="min-w-0 flex-1">
                <div className={`truncate font-semibold ${c.missed ? 'text-red-500' : ''}`}>{name}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Icon size={14} className={c.missed ? 'text-red-500' : 'text-brand'} />
                  {formatListTime(c.startedAt)}
                  {c.durationSec ? ` · ${formatDuration(c.durationSec * 1000)}` : ''}
                </div>
              </div>
              <button onClick={() => void startCall(c.peer, 'AUDIO')} className="rounded-full p-2.5 text-brand hover:bg-soft" aria-label="Voice call">
                <Phone size={20} />
              </button>
              <button onClick={() => void startCall(c.peer, 'VIDEO')} className="rounded-full p-2.5 text-brand hover:bg-soft" aria-label="Video call">
                <Video size={20} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
