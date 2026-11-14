'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import Avatar from './Avatar';
import { acceptCall, declineCall, hangUp, initCallListeners, toggleCamera, toggleMute } from '@/lib/call-manager';
import { useAuth } from '@/lib/auth-store';
import { useCallStore } from '@/lib/call-store';
import { startRingback, startRingtone, stopRingtone, unlockAudio } from '@/lib/ringtone';

const pad = (n: number) => String(n).padStart(2, '0');

export default function CallOverlay() {
  const token = useAuth((s) => s.accessToken);
  const c = useCallStore();
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!token) return;
    return initCallListeners();
  }, [token]);

  // browsers block sound until the first click/key press, so unlock audio once
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // ringing -> ringtone, calling -> ringback tone, anything else -> silence
  useEffect(() => {
    if (c.phase === 'ringing') startRingtone();
    else if (c.phase === 'calling') startRingback();
    return () => stopRingtone();
  }, [c.phase]);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = c.remoteStream;
  }, [c.remoteStream, c.phase]);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = c.localStream;
  }, [c.localStream, c.phase]);

  useEffect(() => {
    if (c.phase !== 'connected') return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [c.phase]);

  if (c.phase === 'idle') {
    return c.notice ? (
      <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-black/80 px-5 py-2 text-sm text-white shadow-lg">
        {c.notice}
      </div>
    ) : null;
  }

  const video = c.type === 'VIDEO';
  const secs = c.connectedAt ? Math.floor((Date.now() - c.connectedAt) / 1000) : 0;
  const status =
    c.phase === 'calling'
      ? 'Calling...'
      : c.phase === 'ringing'
        ? `Incoming ${video ? 'video' : 'voice'} call`
        : c.phase === 'connecting'
          ? 'Connecting...'
          : `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
  const name = c.peer?.name ?? c.peer?.phone ?? 'Unknown';
  const showRemoteVideo = video && c.phase === 'connected';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-gradient-to-b from-[#0b3d2a] to-[#05140e] p-8 text-white">
      {/* remote media element: always mounted so audio plays, only visible for video calls */}
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={showRemoteVideo ? 'absolute inset-0 h-full w-full object-cover' : 'pointer-events-none absolute h-0 w-0 opacity-0'}
      />
      {showRemoteVideo && <div className="absolute inset-0 bg-black/20" />}

      <div className="relative z-10 mt-10 flex flex-col items-center gap-3 text-center">
        {!showRemoteVideo && <Avatar name={name} src={c.peer?.avatarUrl} size={120} />}
        <div className="text-2xl font-bold drop-shadow">{name}</div>
        <div className="text-white/80 drop-shadow">{status}</div>
      </div>

      {video && c.localStream && (
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={`absolute right-4 top-4 z-10 h-40 w-28 rounded-2xl border border-white/30 object-cover shadow-xl ${c.cameraOff ? 'opacity-30' : ''}`}
        />
      )}

      <div className="relative z-10 mb-6 flex items-center gap-6">
        {c.phase === 'ringing' ? (
          <>
            <button onClick={declineCall} className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg" aria-label="Decline">
              <PhoneOff size={28} />
            </button>
            <button onClick={() => void acceptCall()} className="grid h-16 w-16 animate-pulse place-items-center rounded-full bg-green-500 shadow-lg" aria-label="Accept">
              {video ? <Video size={28} /> : <Phone size={28} />}
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleMute} className={`grid h-14 w-14 place-items-center rounded-full ${c.muted ? 'bg-white text-black' : 'bg-white/20'}`} aria-label="Mute">
              {c.muted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            {video && (
              <button onClick={toggleCamera} className={`grid h-14 w-14 place-items-center rounded-full ${c.cameraOff ? 'bg-white text-black' : 'bg-white/20'}`} aria-label="Camera">
                {c.cameraOff ? <VideoOff size={24} /> : <Video size={24} />}
              </button>
            )}
            <button onClick={hangUp} className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg" aria-label="Hang up">
              <PhoneOff size={28} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
