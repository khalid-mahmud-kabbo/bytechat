'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import type { User } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+880');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (step === 'phone') {
        const r = await api<{ devOtp?: string }>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
if (r.devOtp) {
  setDevOtp(r.devOtp);
  setCode(r.devOtp); // auto-fill
}
setStep('code');
      } else {
        const res = await api<{ user: User; isNewUser: boolean; accessToken: string; refreshToken: string }>('/auth/verify-otp', {
          method: 'POST',
          body: JSON.stringify({ phone, code }),
        });
        setSession({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken });
        router.replace(res.isNewUser ? '/setup' : '/chats');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-[#12a868] to-[#0a6e47] p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl bg-panel p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-3xl font-black text-white">B</div>
          <h1 className="text-2xl font-bold">ByteChat</h1>
          <p className="mt-1 text-sm text-muted">
            {step === 'phone' ? 'Enter your phone number to continue' : `Enter the 6-digit code sent to ${phone}`}
          </p>
        </div>

        {step === 'phone' ? (
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="+8801XXXXXXXXX"
            className="h-12 w-full rounded-xl border border-line bg-app px-4 outline-none focus:border-brand"
          />
        ) : (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="123456"
            className="h-12 w-full rounded-xl border border-line bg-app px-4 text-center text-xl tracking-[0.4em] outline-none focus:border-brand"
          />
        )}

        {step === 'code' && devOtp && (
  <p className="rounded-xl bg-amber-100 px-3 py-2 text-center text-sm text-amber-900">
    Testing mode: no SMS gateway is set up. Your code is <b>{devOtp}</b>
  </p>
)}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          disabled={loading}
          className="h-12 w-full rounded-xl bg-brand font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? 'Please wait...' : step === 'phone' ? 'Send code' : 'Verify & continue'}
        </button>

        {step === 'code' && (
          <button type="button" onClick={() => setStep('phone')} className="w-full text-sm text-muted">
            Change number
          </button>
        )}
      </form>
    </div>
  );
}
