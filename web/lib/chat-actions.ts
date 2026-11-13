import { api } from './api';
import { useAuth } from './auth-store';
import { useChatStore } from './chat-store';
import { getSocket } from './socket';
import type { MediaInfo, Message } from './types';

type SendPayload = {
  chatId: string;
  clientId: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT';
  text?: string;
  mediaId?: string;
  replyToId?: string;
};
type SendAck = { ok: true; data: Message } | { ok: false; error: string };

// clientId -> function that (re)tries the whole send. Same clientId = server never duplicates.
const jobs = new Map<string, () => void>();

function emitSend(payload: SendPayload) {
  getSocket()
    .timeout(20_000)
    .emit('message:send', payload, (err: Error | null, res?: SendAck) => {
      const store = useChatStore.getState();
      if (err || !res || !res.ok) {
        store.patchPending(payload.chatId, payload.clientId, { pending: false, failed: true });
        return;
      }
      jobs.delete(payload.clientId);
      store.addMessage(res.data, { incrementUnread: false });
    });
}

function optimistic(chatId: string, over: Partial<Message> & { clientId: string; type: Message['type'] }, replyTo?: Message | null): Message {
  const me = useAuth.getState().user!;
  return {
    id: over.clientId,
    chatId,
    senderId: me.id,
    text: null,
    media: null,
    reactions: [],
    status: 'sent',
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    pending: true,
    replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, type: replyTo.type, text: replyTo.text } : null,
    ...over,
  };
}

export function sendText(chatId: string, text: string, replyTo?: Message | null) {
  const clientId = crypto.randomUUID();
  useChatStore.getState().addMessage(optimistic(chatId, { clientId, type: 'TEXT', text }, replyTo), { incrementUnread: false });
  const run = () => emitSend({ chatId, clientId, type: 'TEXT', text, replyToId: replyTo?.id });
  jobs.set(clientId, run);
  run();
}

export type MediaMeta = {
  fileName: string;
  voice?: boolean;
  width?: number;
  height?: number;
  durationMs?: number;
  waveform?: number[];
};

export function sendMedia(chatId: string, file: Blob, meta: MediaMeta, replyTo?: Message | null) {
  const clientId = crypto.randomUUID();
  const mime = file.type || 'application/octet-stream';
  const localMedia: MediaInfo = {
    id: clientId,
    url: URL.createObjectURL(file), // preview while uploading
    thumbnailUrl: null,
    mimeType: mime,
    size: file.size,
    fileName: meta.fileName,
    width: meta.width ?? null,
    height: meta.height ?? null,
    durationMs: meta.durationMs ?? null,
    waveform: meta.waveform ?? [],
  };
  const type: Message['type'] = meta.voice
    ? 'VOICE'
    : mime.startsWith('image/')
      ? 'IMAGE'
      : mime.startsWith('video/')
        ? 'VIDEO'
        : mime.startsWith('audio/')
          ? 'AUDIO'
          : 'DOCUMENT';

  useChatStore.getState().addMessage(optimistic(chatId, { clientId, type, media: localMedia }, replyTo), { incrementUnread: false });

  let mediaId: string | null = null; // upload only once, even if the send is retried
  const run = async () => {
    useChatStore.getState().patchPending(chatId, clientId, { pending: true, failed: false });
    try {
      if (!mediaId) {
        const form = new FormData();
        form.append('file', file, meta.fileName);
        if (meta.width) form.append('width', String(meta.width));
        if (meta.height) form.append('height', String(meta.height));
        if (meta.durationMs) form.append('durationMs', String(meta.durationMs));
        if (meta.waveform) form.append('waveform', JSON.stringify(meta.waveform));
        const res = await api<{ media: { id: string } }>('/media', { method: 'POST', body: form });
        mediaId = res.media.id;
      }
      emitSend({ chatId, clientId, type: meta.voice ? 'VOICE' : 'DOCUMENT', mediaId, replyToId: replyTo?.id });
    } catch {
      useChatStore.getState().patchPending(chatId, clientId, { pending: false, failed: true });
    }
  };
  jobs.set(clientId, () => void run());
  void run();
}

export function retrySend(clientId: string) {
  const store = useChatStore.getState();
  const msg = Object.values(store.messages).flat().find((m) => m.clientId === clientId);
  if (msg) store.patchPending(msg.chatId, clientId, { pending: true, failed: false });
  jobs.get(clientId)?.();
}

export const deleteMessage = (messageId: string) => getSocket().emit('message:delete', { messageId });
export const editMessage = (messageId: string, text: string) => getSocket().emit('message:edit', { messageId, text });
export const reactToMessage = (messageId: string, emoji: string) => getSocket().emit('message:react', { messageId, emoji });
export const sendTyping = (chatId: string, isTyping: boolean) => getSocket().emit('typing', { chatId, isTyping });
export const markChatRead = (chatId: string) => {
  useChatStore.getState().clearUnread(chatId);
  getSocket().emit('chat:read', { chatId });
};

export function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
