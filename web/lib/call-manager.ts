import { api } from './api';
import { IDLE, useCallStore } from './call-store';
import { getSocket } from './socket';
import type { LiteUser } from './types';

// 1-to-1 WebRTC. Server = signalling only. Caller creates the offer once the callee accepted.

type Ack = { ok: true; data?: { callId?: string } } | { ok: false; error: string };

let pc: RTCPeerConnection | null = null;
let queue: Promise<void> = Promise.resolve(); // signals are handled strictly in order
let iceServers: RTCIceServer[] | null = null;
let noticeTimer: number | undefined;

const store = () => useCallStore.getState();

async function getIce(): Promise<RTCIceServer[]> {
  if (!iceServers) {
    try {
      iceServers = (await api<{ iceServers: RTCIceServer[] }>('/calls/ice')).iceServers;
    } catch {
      iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  }
  return iceServers;
}

function getMedia(type: 'AUDIO' | 'VIDEO') {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' ? { facingMode: 'user' } : false });
}

function cleanup(notice?: string) {
  store().localStream?.getTracks().forEach((t) => t.stop());
  pc?.close();
  pc = null;
  queue = Promise.resolve();
  store().set({ ...IDLE, notice: notice ?? null });
  window.clearTimeout(noticeTimer);
  if (notice) noticeTimer = window.setTimeout(() => store().set({ notice: null }), 3500);
}

async function createPeer(callId: string, stream: MediaStream) {
  const peer = new RTCPeerConnection({ iceServers: await getIce() });
  stream.getTracks().forEach((t) => peer.addTrack(t, stream));

  const remote = new MediaStream();
  store().set({ remoteStream: remote });
  peer.ontrack = (e) => remote.addTrack(e.track);
  peer.onicecandidate = (e) => {
    if (e.candidate) getSocket().emit('call:signal', { callId, data: { candidate: e.candidate.toJSON() } });
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'connected') store().set({ phase: 'connected', connectedAt: Date.now() });
    if (peer.connectionState === 'failed') {
      hangUp();
      cleanup('Connection lost');
    }
  };
  pc = peer;
  return peer;
}

function fail(message: string) {
  cleanup(message);
}

export async function startCall(peer: LiteUser, type: 'AUDIO' | 'VIDEO') {
  if (store().phase !== 'idle') return;
  let stream: MediaStream;
  try {
    stream = await getMedia(type);
  } catch {
    store().set({ notice: 'Allow microphone/camera access to make calls' });
    return;
  }
  store().set({ phase: 'calling', peer, type, incoming: false, localStream: stream, cameraOff: type === 'AUDIO', notice: null });

  getSocket()
    .timeout(15_000)
    .emit('call:start', { calleeId: peer.id, type }, (err: Error | null, res?: Ack) => {
      if (err || !res || !res.ok) return fail(res && !res.ok ? res.error : 'Could not start the call');
      store().set({ callId: res.data?.callId ?? null });
    });
}

export async function acceptCall() {
  const s = store();
  if (s.phase !== 'ringing' || !s.callId) return;
  let stream: MediaStream;
  try {
    stream = await getMedia(s.type);
  } catch {
    declineCall();
    store().set({ notice: 'Allow microphone/camera access to answer calls' });
    return;
  }
  store().set({ phase: 'connecting', localStream: stream, cameraOff: s.type === 'AUDIO' });
  await createPeer(s.callId, stream); // ready BEFORE the caller's offer can arrive
  getSocket()
    .timeout(15_000)
    .emit('call:accept', { callId: s.callId }, (err: Error | null, res?: Ack) => {
      if (err || !res || !res.ok) fail('Could not connect the call');
    });
}

export function declineCall() {
  const { callId } = store();
  if (callId) getSocket().emit('call:end', { callId });
  cleanup();
}

export function hangUp() {
  const { callId } = store();
  if (callId) getSocket().emit('call:end', { callId });
  cleanup();
}

export function toggleMute() {
  const s = store();
  const next = !s.muted;
  s.localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
  s.set({ muted: next });
}

export function toggleCamera() {
  const s = store();
  if (s.type !== 'VIDEO') return;
  const next = !s.cameraOff;
  s.localStream?.getVideoTracks().forEach((t) => (t.enabled = !next));
  s.set({ cameraOff: next });
}

async function handleSignal(callId: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
  if (!pc || store().callId !== callId) return;
  if (data.description) {
    await pc.setRemoteDescription(data.description);
    if (data.description.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket().emit('call:signal', { callId, data: { description: pc.localDescription } });
    }
  } else if (data.candidate) {
    await pc.addIceCandidate(data.candidate).catch(() => {});
  }
}

/** Registers the socket listeners. Returns the cleanup function. */
export function initCallListeners() {
  const socket = getSocket();

  const onIncoming = (p: { callId: string; type: 'AUDIO' | 'VIDEO'; caller: LiteUser }) => {
    if (store().phase !== 'idle') {
      socket.emit('call:end', { callId: p.callId }); // already busy -> decline
      return;
    }
    store().set({ phase: 'ringing', callId: p.callId, peer: p.caller, type: p.type, incoming: true, notice: null });
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`Incoming ${p.type === 'VIDEO' ? 'video' : 'voice'} call`, {
        body: p.caller.name ?? p.caller.phone,
        tag: 'incoming-call',
      });
    }
  };

  const onAccepted = async ({ callId }: { callId: string }) => {
    const s = store();
    if (s.callId !== callId || !s.localStream || s.incoming) return;
    store().set({ phase: 'connecting' });
    const peer = await createPeer(callId, s.localStream);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('call:signal', { callId, data: { description: peer.localDescription } });
  };

  const onSignal = ({ callId, data }: { callId: string; data: Parameters<typeof handleSignal>[1] }) => {
    queue = queue.then(() => handleSignal(callId, data)).catch((e) => console.error('[call signal]', e));
  };

  const onEnded = ({ callId, reason }: { callId: string; reason: string }) => {
    const s = store();
    if (s.callId !== callId && !(s.phase === 'calling' && !s.callId)) return;
    const notice =
      reason === 'declined' ? 'Call declined' : reason === 'missed' ? 'No answer' : reason === 'disconnected' ? 'Call disconnected' : undefined;
    cleanup(s.incoming && reason === 'missed' ? 'Missed call' : notice);
  };

  const onHandled = ({ callId }: { callId: string }) => {
    const s = store();
    if (s.phase === 'ringing' && s.callId === callId) cleanup(); // answered on another device
  };

  socket.on('call:incoming', onIncoming);
  socket.on('call:accepted', onAccepted);
  socket.on('call:signal', onSignal);
  socket.on('call:ended', onEnded);
  socket.on('call:handled', onHandled);
  return () => {
    socket.off('call:incoming', onIncoming);
    socket.off('call:accepted', onAccepted);
    socket.off('call:signal', onSignal);
    socket.off('call:ended', onEnded);
    socket.off('call:handled', onHandled);
  };
}
