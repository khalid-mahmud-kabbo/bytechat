import { create } from 'zustand';
import type { LiteUser } from './types';

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected';

export type CallData = {
  phase: CallPhase;
  callId: string | null;
  peer: LiteUser | null;
  type: 'AUDIO' | 'VIDEO';
  incoming: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  connectedAt: number | null;
  notice: string | null; // short message after a call ends ("Call declined"...)
};

type CallState = CallData & { set: (patch: Partial<CallData>) => void };

export const IDLE: Omit<CallData, 'notice'> = {
  phase: 'idle',
  callId: null,
  peer: null,
  type: 'AUDIO',
  incoming: false,
  localStream: null,
  remoteStream: null,
  muted: false,
  cameraOff: false,
  connectedAt: null,
};

export const useCallStore = create<CallState>()((set) => ({
  ...IDLE,
  notice: null,
  set: (patch) => set(patch),
}));
