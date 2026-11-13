'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import ChatList from '@/components/ChatList';
import ChatWindow from '@/components/ChatWindow';
import ContactInfo from '@/components/ContactInfo';
import { useChatStore } from '@/lib/chat-store';

export default function ChatsPage() {
  const active = useChatStore((s) => s.chats.find((c) => c.id === s.activeChatId) ?? null);
  const setActive = useChatStore((s) => s.setActive);
  const [showInfo, setShowInfo] = useState(true);

  return (
    <div className="flex h-full">
      {/* on phones: list OR chat, never both */}
      <div className={`${active ? 'hidden md:flex' : 'flex'} h-full w-full md:w-auto`}>
        <ChatList />
      </div>

      {active ? (
        <>
          <ChatWindow
            key={active.id}
            chat={active}
            onBack={() => setActive(null)}
            onToggleInfo={() => setShowInfo((v) => !v)}
          />
          {showInfo && <ContactInfo chat={active} onClose={() => setShowInfo(false)} />}
        </>
      ) : (
        <div className="hidden flex-1 place-items-center bg-app text-center text-muted md:grid">
          <div>
            <MessageSquare className="mx-auto mb-3" size={44} />
            Select a chat to start messaging
          </div>
        </div>
      )}
    </div>
  );
}
