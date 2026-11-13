'use client';

import { useRef, useState } from 'react';

export type VoiceResult = { blob: Blob; durationMs: number; waveform: number[] };

const BARS = 40;

function downsample(peaks: number[]): number[] {
  if (peaks.length === 0) return Array(BARS).fill(8);
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const from = Math.floor((i * peaks.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / BARS));
    const slice = peaks.slice(from, to);
    out.push(Math.round(slice.reduce((a, b) => a + b, 0) / slice.length));
  }
  return out;
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const state = useRef<{
    mr: MediaRecorder;
    stream: MediaStream;
    ctx: AudioContext;
    peaks: number[];
    sampler: number;
    ticker: number;
    startedAt: number;
    chunks: Blob[];
  } | null>(null);

  function cleanup() {
    const s = state.current;
    if (!s) return;
    clearInterval(s.sampler);
    clearInterval(s.ticker);
    s.stream.getTracks().forEach((t) => t.stop());
    s.ctx.close().catch(() => {});
    state.current = null;
    setRecording(false);
    setSeconds(0);
  }

  async function start(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

      // sample the loudness 10x per second -> becomes the waveform of the message
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const peaks: number[] = [];
      const sampler = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let max = 0;
        for (const v of buf) max = Math.max(max, Math.abs(v - 128));
        peaks.push(Math.min(100, Math.round((max / 128) * 160)));
      }, 100);

      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.start();

      const startedAt = Date.now();
      const ticker = window.setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 500);
      state.current = { mr, stream, ctx, peaks, sampler, ticker, startedAt, chunks };
      setRecording(true);
      return true;
    } catch {
      alert('Microphone access was blocked. Allow it in the browser to send voice messages.');
      return false;
    }
  }

  function stop(): Promise<VoiceResult | null> {
    const s = state.current;
    if (!s) return Promise.resolve(null);
    return new Promise((resolve) => {
      s.mr.onstop = () => {
        const durationMs = Date.now() - s.startedAt;
        const result = { blob: new Blob(s.chunks, { type: s.mr.mimeType || 'audio/webm' }), durationMs, waveform: downsample(s.peaks) };
        cleanup();
        resolve(durationMs < 600 ? null : result); // ignore accidental taps
      };
      s.mr.stop();
    });
  }

  function cancel() {
    const s = state.current;
    if (!s) return;
    s.mr.onstop = null;
    if (s.mr.state !== 'inactive') s.mr.stop();
    cleanup();
  }

  return { recording, seconds, start, stop, cancel };
}
