'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

export default function NotificationToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      if (state === 'on') await disablePush();
      else await enablePush();
      setState(await pushState());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (state === null) return null;

  return (
    <div className="mt-8 border-t border-line pt-6">
      <h2 className="mb-1 font-semibold">Notifications</h2>
      <p className="mb-3 text-sm text-muted">Get a notification for new messages and missed calls when ByteChat is closed.</p>
      {state === 'unsupported' ? (
        <p className="text-sm text-muted">This browser does not support notifications.</p>
      ) : state === 'denied' ? (
        <p className="text-sm text-red-500">Notifications are blocked. Allow them in the browser&apos;s site settings, then reload.</p>
      ) : (
        <button
          onClick={toggle}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-soft disabled:opacity-60"
        >
          {state === 'on' ? <BellOff size={18} /> : <Bell size={18} />}
          {state === 'on' ? 'Turn off notifications' : 'Turn on notifications'}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
