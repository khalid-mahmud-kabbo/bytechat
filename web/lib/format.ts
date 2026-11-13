import type { Message } from './types';

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (iso: string) => Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);

export function formatListTime(iso: string) {
  const diff = daysAgo(iso);
  if (diff <= 0) return formatTime(iso);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return new Date(iso).toLocaleDateString([], { weekday: 'long' });
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });
}

export function dayLabel(iso: string) {
  const diff = daysAgo(iso);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}

export function lastSeenText(iso: string | null) {
  if (!iso) return 'offline';
  const diff = daysAgo(iso);
  if (diff <= 0) return `last seen today at ${formatTime(iso)}`;
  if (diff === 1) return `last seen yesterday at ${formatTime(iso)}`;
  return `last seen ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

export function formatDuration(ms: number | null | undefined) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function messagePreview(m: Message | null, meId?: string, withYou = false) {
  if (!m) return 'No messages yet';
  const prefix = withYou && m.senderId === meId ? 'You: ' : '';
  if (m.deletedAt) return `${prefix}🚫 This message was deleted`;
  switch (m.type) {
    case 'IMAGE':
      return `${prefix}📷 Photo`;
    case 'VIDEO':
      return `${prefix}🎥 Video`;
    case 'VOICE':
      return `${prefix}🎤 Voice message · ${formatDuration(m.media?.durationMs)}`;
    case 'AUDIO':
      return `${prefix}🎵 Audio`;
    case 'DOCUMENT':
      return `${prefix}📄 ${m.media?.fileName ?? 'Document'}`;
    default:
      return `${prefix}${m.text ?? ''}`;
  }
}
