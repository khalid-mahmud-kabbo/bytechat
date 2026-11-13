'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileForm from '@/components/ProfileForm';
import { useAuth } from '@/lib/auth-store';

export default function SetupPage() {
  const router = useRouter();
  const token = useAuth((s) => s.accessToken);
  const user = useAuth((s) => s.user);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!ready) return;
    if (!token) router.replace('/login');
    else if (user?.name) router.replace('/chats');
  }, [ready, token, user, router]);

  if (!ready || !token) return null;

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-[#12a868] to-[#0a6e47] p-4">
      <div className="w-full max-w-sm rounded-3xl bg-panel p-8 shadow-2xl">
        <h1 className="text-center text-2xl font-bold">Set up your profile</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted">Your name is shown to people you chat with</p>
        <ProfileForm submitLabel="Continue" onDone={() => router.replace('/chats')} />
      </div>
    </div>
  );
}
