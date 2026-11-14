export type User = {
  id: string;
  phone: string;
  name: string | null;
  about: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN';
  isOnline: boolean;
  lastSeenAt: string | null;
};

export type LiteUser = {
  id: string;
  name: string | null;
  phone: string;
  avatarUrl: string | null;
  about: string;
  isOnline: boolean;
  lastSeenAt: string | null;
};

export type Member = LiteUser & { role: 'MEMBER' | 'ADMIN' | 'OWNER' };

export type MediaInfo = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  size: number;
  fileName: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[];
};

export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT' | 'SYSTEM';

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  clientId: string | null;
  type: MessageType;
  text: string | null;
  media: MediaInfo | null;
  replyTo: { id: string; senderId: string; type: MessageType; text: string | null } | null;
  reactions: { userId: string; emoji: string }[];
  status: MessageStatus;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  // client-only flags
  pending?: boolean;
  failed?: boolean;
};

export type Chat = {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string;
  avatarUrl: string | null;
  description: string | null;
  peer: LiteUser | null;
  members: Member[];
  myRole: 'MEMBER' | 'ADMIN' | 'OWNER';
  pinnedAt: string | null;
  mutedUntil: string | null;
  unread: number;
  lastMessage: Message | null;
  lastMessageAt: string;
  createdAt: string;
};

export type StoryItem = {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO';
  text: string | null;
  bgColor: string | null;
  media: { id: string; url: string; mimeType: string; width: number | null; height: number | null; durationMs: number | null } | null;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewCount: number | null;
};

export type StoryGroup = {
  user: LiteUser;
  isMine: boolean;
  stories: StoryItem[];
  hasUnviewed: boolean;
  latestAt: string;
};

export type CallLogItem = {
  id: string;
  type: 'AUDIO' | 'VIDEO';
  status: 'RINGING' | 'ACCEPTED' | 'ENDED' | 'MISSED' | 'DECLINED' | 'CANCELED';
  direction: 'incoming' | 'outgoing';
  peer: LiteUser;
  startedAt: string;
  durationSec: number | null;
  missed: boolean;
};
