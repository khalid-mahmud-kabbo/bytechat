import { create } from 'zustand';
import type { Chat, Message, MessageStatus } from './types';

type StatusUpdate = { id: string; chatId: string; status: MessageStatus };
const rank: Record<MessageStatus, number> = { sent: 0, delivered: 1, read: 2 };

type ChatState = {
  chats: Chat[];
  loaded: boolean;
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  activeChatId: string | null;
  typing: Record<string, string[]>; // chatId -> userIds typing right now

  setChats: (chats: Chat[]) => void;
  upsertChat: (chat: Chat) => void;
  removeChat: (chatId: string) => void;
  setActive: (id: string | null) => void;
  setMessages: (chatId: string, msgs: Message[], hasMore: boolean) => void;
  prependMessages: (chatId: string, msgs: Message[], hasMore: boolean) => void;
  addMessage: (m: Message, opts: { incrementUnread: boolean }) => void;
  updateMessage: (m: Message) => void;
  patchPending: (chatId: string, clientId: string, patch: Partial<Message>) => void;
  applyStatuses: (updates: StatusUpdate[]) => void;
  clearUnread: (chatId: string) => void;
  setPresence: (userId: string, isOnline: boolean, lastSeenAt: string | null) => void;
  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  reset: () => void;
};

const sameMessage = (a: Message, b: Message) => a.id === b.id || (!!b.clientId && a.clientId === b.clientId);

export const useChatStore = create<ChatState>()((set) => ({
  chats: [],
  loaded: false,
  messages: {},
  hasMore: {},
  activeChatId: null,
  typing: {},

  setChats: (chats) => set({ chats, loaded: true }),

  upsertChat: (chat) =>
    set((s) => ({
      chats: s.chats.some((c) => c.id === chat.id)
        ? s.chats.map((c) => (c.id === chat.id ? { ...chat, unread: s.activeChatId === chat.id ? 0 : chat.unread } : c))
        : [chat, ...s.chats],
    })),

  removeChat: (chatId) =>
    set((s) => ({
      chats: s.chats.filter((c) => c.id !== chatId),
      activeChatId: s.activeChatId === chatId ? null : s.activeChatId,
    })),

  setActive: (id) => set({ activeChatId: id }),

  setMessages: (chatId, msgs, hasMore) =>
    set((s) => {
      // keep messages that are still being sent / failed locally
      const local = (s.messages[chatId] ?? []).filter(
        (m) => (m.pending || m.failed) && !msgs.some((x) => x.clientId && x.clientId === m.clientId),
      );
      return {
        messages: { ...s.messages, [chatId]: [...msgs, ...local] },
        hasMore: { ...s.hasMore, [chatId]: hasMore },
      };
    }),

  prependMessages: (chatId, msgs, hasMore) =>
    set((s) => {
      const current = s.messages[chatId] ?? [];
      const fresh = msgs.filter((m) => !current.some((c) => c.id === m.id));
      return {
        messages: { ...s.messages, [chatId]: [...fresh, ...current] },
        hasMore: { ...s.hasMore, [chatId]: hasMore },
      };
    }),

  addMessage: (m, { incrementUnread }) =>
    set((s) => {
      const list = s.messages[m.chatId];
      const existed = !!list?.some((x) => sameMessage(x, m));
      let nextList = list;
      if (list) nextList = existed ? list.map((x) => (sameMessage(x, m) ? m : x)) : [...list, m];

      return {
        messages: nextList ? { ...s.messages, [m.chatId]: nextList } : s.messages,
        chats: s.chats.map((c) =>
          c.id === m.chatId
            ? {
                ...c,
                lastMessage: m,
                lastMessageAt: m.createdAt,
                unread: c.unread + (incrementUnread && !existed ? 1 : 0),
              }
            : c,
        ),
      };
    }),

  updateMessage: (m) =>
    set((s) => ({
      messages: s.messages[m.chatId]
        ? { ...s.messages, [m.chatId]: s.messages[m.chatId].map((x) => (x.id === m.id ? m : x)) }
        : s.messages,
      chats: s.chats.map((c) => (c.id === m.chatId && c.lastMessage?.id === m.id ? { ...c, lastMessage: m } : c)),
    })),

  patchPending: (chatId, clientId, patch) =>
    set((s) => ({
      messages: s.messages[chatId]
        ? {
            ...s.messages,
            [chatId]: s.messages[chatId].map((x) => (x.clientId === clientId && !x.deletedAt ? { ...x, ...patch } : x)),
          }
        : s.messages,
      chats: s.chats.map((c) =>
        c.id === chatId && c.lastMessage?.clientId === clientId ? { ...c, lastMessage: { ...c.lastMessage, ...patch } } : c,
      ),
    })),

  applyStatuses: (updates) =>
    set((s) => {
      const messages = { ...s.messages };
      let chats = s.chats;
      for (const u of updates) {
        const list = messages[u.chatId];
        if (list) {
          messages[u.chatId] = list.map((m) =>
            m.id === u.id && rank[u.status] > rank[m.status] ? { ...m, status: u.status } : m,
          );
        }
        chats = chats.map((c) =>
          c.id === u.chatId && c.lastMessage?.id === u.id && rank[u.status] > rank[c.lastMessage.status]
            ? { ...c, lastMessage: { ...c.lastMessage, status: u.status } }
            : c,
        );
      }
      return { messages, chats };
    }),

  clearUnread: (chatId) =>
    set((s) => ({ chats: s.chats.map((c) => (c.id === chatId && c.unread ? { ...c, unread: 0 } : c)) })),

  setPresence: (userId, isOnline, lastSeenAt) =>
    set((s) => ({
      chats: s.chats.map((c) => {
        const patch = (u: { id: string; isOnline: boolean; lastSeenAt: string | null }) =>
          u.id === userId ? { ...u, isOnline, lastSeenAt: lastSeenAt ?? u.lastSeenAt } : u;
        return {
          ...c,
          peer: c.peer ? patch(c.peer) : null,
          members: c.members.map((m) => ({ ...m, ...patch(m) })),
        };
      }),
    })),

  setTyping: (chatId, userId, isTyping) =>
    set((s) => {
      const current = s.typing[chatId] ?? [];
      const next = isTyping ? (current.includes(userId) ? current : [...current, userId]) : current.filter((u) => u !== userId);
      return { typing: { ...s.typing, [chatId]: next } };
    }),

  reset: () => set({ chats: [], loaded: false, messages: {}, hasMore: {}, activeChatId: null, typing: {} }),
}));
