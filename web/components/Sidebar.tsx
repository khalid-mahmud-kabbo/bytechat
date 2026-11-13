'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { CircleDashed, LogOut, MessageSquare, Phone, Settings, User } from 'lucide-react';
import Avatar from './Avatar';
import { useAuth } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { useChatStore } from '@/lib/chat-store';
import { disconnectSocket } from '@/lib/socket';

const nav = [
  { href: '/chats', label: 'Chats', icon: MessageSquare },
  { href: '/status', label: 'Status', icon: CircleDashed },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/contacts', label: 'Contacts', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { user, refreshToken, clear } = useAuth();
  const totalUnread = useChatStore((s) => s.chats.reduce((n, c) => n + c.unread, 0));

  useEffect(() => setMounted(true), []);
  const dark = mounted && theme === 'dark';

  async function logout() {
    try {
      if (refreshToken) await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    } catch {}
    disconnectSocket();
    useChatStore.getState().reset();
    clear();
    router.replace('/login');
  }

  return (
    <aside className="hidden w-[190px] shrink-0 flex-col bg-gradient-to-b from-[#12a868] to-[#0a6e47] p-3 text-white md:flex">
      <div className="px-2 pb-5 pt-3 text-center">
        <div className="mx-auto mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-2xl font-black">B</div>
        <div className="text-xl font-bold">ByteChat</div>
      </div>

      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          const badge = href === '/chats' ? totalUnread : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <Icon size={19} />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-xs font-bold text-brand-dark">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-white/20 pt-3">
        <button
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          className="flex w-full items-center justify-between px-2 text-sm"
          aria-label="Toggle dark mode"
        >
          <span>Dark Mode</span>
          <span className={`relative h-5 w-9 rounded-full transition ${dark ? 'bg-white' : 'bg-white/30'}`}>
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
                dark ? 'left-[18px] bg-brand-dark' : 'left-0.5 bg-white'
              }`}
            />
          </span>
        </button>

        <div className="flex items-center gap-2 px-1">
          <Avatar name={user?.name ?? user?.phone ?? 'U'} src={user?.avatarUrl} size={36} />
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate font-semibold">{user?.name ?? user?.phone}</div>
            <div className="text-white/70">Online</div>
          </div>
          <button onClick={logout} aria-label="Log out" className="rounded-lg p-1.5 hover:bg-white/10">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
