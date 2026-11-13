'use client';

import { useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { markChatRead } from '@/lib/chat-actions';
import { useChatStore } from '@/lib/chat-store';
import { getSocket } from '@/lib/socket';
import type { Chat, Message, User } from '@/lib/types';

/** Mounted once. Connects the socket and keeps the chat store in sync with the server. */
export default function RealtimeBridge() {
  const token = useAuth((s) => s.accessToken);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    const store = useChatStore;
    const me = () => useAuth.getState().user?.id;
    const typingTimers = new Map<string, number>();
    let authRetries = 0;

    async function loadChats() {
      try {
        const { chats } = await api<{ chats: Chat[] }>('/chats');
        store.getState().setChats(chats);
      } catch {
        /* retried on the next connect */
      }
    }

    async function loadChat(chatId: string) {
      try {
        const { chat } = await api<{ chat: Chat }>(`/chats/${chatId}`);
        store.getState().upsertChat(chat);
        return true;
      } catch (err) {
        // removed from the group / chat no longer exists
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) store.getState().removeChat(chatId);
        return false;
      }
    }

    async function reloadActiveMessages() {
      const id = store.getState().activeChatId;
      if (!id) return;
      try {
        const r = await api<{ messages: Message[]; hasMore: boolean }>(`/chats/${id}/messages?limit=40`);
        store.getState().setMessages(id, r.messages, r.hasMore);
      } catch {
        /* ignore */
      }
    }

    const viewing = (chatId: string) =>
      store.getState().activeChatId === chatId && document.visibilityState === 'visible';

    const onConnect = () => {
      authRetries = 0;
      void loadChats();
      void reloadActiveMessages(); // catch up on anything missed while offline
    };

    const onConnectError = async (err: Error) => {
      if (err.message !== 'unauthorized' || authRetries >= 3) return;
      authRetries += 1;
      try {
        await api('/users/me'); // triggers a token refresh if the access token expired
      } catch {
        /* api() clears the session when the refresh token is invalid */
      }
      if (useAuth.getState().accessToken) socket.connect();
    };

    const onNew = async (msg: Message) => {
      if (!store.getState().chats.some((c) => c.id === msg.chatId)) {
        if (!(await loadChat(msg.chatId))) return;
      }
      const mine = msg.senderId === me();
      const isViewing = viewing(msg.chatId);
      store.getState().addMessage(msg, { incrementUnread: !mine && !isViewing });
      if (!mine && isViewing) socket.emit('chat:read', { chatId: msg.chatId });
    };

    const onUpdated = (msg: Message) => store.getState().updateMessage(msg);
    const onStatus = ({ updates }: { updates: { id: string; chatId: string; status: Message['status'] }[] }) =>
      store.getState().applyStatuses(updates);
    const onChatUpdated = ({ chatId }: { chatId: string }) => void loadChat(chatId);
    const onChatRead = ({ chatId }: { chatId: string }) => store.getState().clearUnread(chatId);
    const onPresence = (p: { userId: string; isOnline: boolean; lastSeenAt: string | null }) =>
      store.getState().setPresence(p.userId, p.isOnline, p.lastSeenAt);

    const onTyping = ({ chatId, userId, isTyping }: { chatId: string; userId: string; isTyping: boolean }) => {
      const key = `${chatId}:${userId}`;
      window.clearTimeout(typingTimers.get(key));
      store.getState().setTyping(chatId, userId, isTyping);
      if (isTyping) {
        // safety net in case the "stopped typing" event is lost
        typingTimers.set(key, window.setTimeout(() => store.getState().setTyping(chatId, userId, false), 6000));
      }
    };

    const onVisible = () => {
      const id = store.getState().activeChatId;
      const chat = store.getState().chats.find((c) => c.id === id);
      if (document.visibilityState === 'visible' && chat && chat.unread > 0) markChatRead(chat.id);
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('message:status', onStatus);
    socket.on('chat:updated', onChatUpdated);
    socket.on('chat:read', onChatRead);
    socket.on('presence:update', onPresence);
    socket.on('typing', onTyping);
    document.addEventListener('visibilitychange', onVisible);
    socket.connect();

    api<{ user: User }>('/users/me')
      .then((r) => useAuth.getState().setUser(r.user))
      .catch(() => {});

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:status', onStatus);
      socket.off('chat:updated', onChatUpdated);
      socket.off('chat:read', onChatRead);
      socket.off('presence:update', onPresence);
      socket.off('typing', onTyping);
      document.removeEventListener('visibilitychange', onVisible);
      typingTimers.forEach((t) => window.clearTimeout(t));
      socket.disconnect();
    };
  }, [token]);

  return null;
}
