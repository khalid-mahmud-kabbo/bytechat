'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CallOverlay from '@/components/CallOverlay';
import RealtimeBridge from '@/components/RealtimeBridge';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/lib/auth-store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuth((s) => s.accessToken);
  const user = useAuth((s) => s.user);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!ready) return;
    if (!token) router.replace('/login');
    else if (user && !user.name) router.replace('/setup'); // first login: pick a name first
  }, [ready, token, user, router]);

  if (!ready || !token || !user?.name) return null;

  return (
    <div className="flex h-dvh overflow-hidden">
      <RealtimeBridge />
      <CallOverlay />
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
