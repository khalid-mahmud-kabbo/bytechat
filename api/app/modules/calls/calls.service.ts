import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { lite, userSelect } from '../../lib/serializers';
import { emitToUsers, isOnline } from '../../socket/emit';
import { ApiError } from '../../utils/ApiError';
import { sendPushToUsers } from '../push/push.service';

// Calls are 1-to-1 WebRTC. The server only does signalling (ringing + relaying offer/answer/ICE);
// audio/video flows directly between the two browsers. Live state is kept in memory, history in the DB.

const RING_MS = 40_000;

type Active = {
  id: string;
  callerId: string;
  calleeId: string;
  type: 'AUDIO' | 'VIDEO';
  status: 'RINGING' | 'ACCEPTED';
  answeredAt?: Date;
  ringTimer?: NodeJS.Timeout;
};

const calls = new Map<string, Active>();
const busy = new Map<string, string>(); // userId -> callId

type FinalStatus = 'ENDED' | 'MISSED' | 'DECLINED' | 'CANCELED';

async function finish(call: Active, status: FinalStatus, reason: string) {
  if (!calls.has(call.id)) return;
  if (call.ringTimer) clearTimeout(call.ringTimer);
  calls.delete(call.id);
  busy.delete(call.callerId);
  busy.delete(call.calleeId);

  emitToUsers([call.callerId, call.calleeId], 'call:ended', { callId: call.id, reason });

  const endedAt = new Date();
  const durationSec = call.answeredAt ? Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000) : null;
  await prisma.callLog
    .update({ where: { id: call.id }, data: { status, endedAt, durationSec } })
    .catch((e) => console.error('[call log]', e));
}

async function onRingTimeout(callId: string) {
  const call = calls.get(callId);
  if (!call || call.status !== 'RINGING') return;
  await finish(call, 'MISSED', 'missed');
  const caller = await prisma.user.findUnique({ where: { id: call.callerId }, select: { name: true, phone: true } });
  void sendPushToUsers([call.calleeId], {
    title: 'Missed call',
    body: `${caller?.name ?? caller?.phone ?? 'Someone'} called you`,
    kind: 'missed_call',
  });
}

const startSchema = z.object({ calleeId: z.string().min(1), type: z.enum(['AUDIO', 'VIDEO']) });

export async function startCall(userId: string, raw: unknown) {
  const { calleeId, type } = startSchema.parse(raw);
  if (calleeId === userId) throw new ApiError(400, 'You cannot call yourself');
  if (busy.has(userId)) throw new ApiError(409, 'You are already in a call');

  const [caller, callee] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: userSelect }),
    prisma.user.findUnique({ where: { id: calleeId }, select: { ...userSelect, isBanned: true } }),
  ]);
  if (!caller || !callee || callee.isBanned) throw new ApiError(404, 'User not found');

  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: userId, blockedId: calleeId }, { blockerId: calleeId, blockedId: userId }] },
  });
  if (blocked) throw new ApiError(403, 'You cannot call this user');

  const log = await prisma.callLog.create({ data: { callerId: userId, calleeId, type } });
  const missed = (message: string) =>
    prisma.callLog
      .update({ where: { id: log.id }, data: { status: 'MISSED', endedAt: new Date() } })
      .then(() => new ApiError(409, message));

  if (busy.has(calleeId)) throw await missed(`${callee.name ?? 'This user'} is busy on another call`);
  if (!(await isOnline(calleeId))) {
    void sendPushToUsers([calleeId], {
      title: 'Missed call',
      body: `${caller.name ?? caller.phone} tried to call you`,
      kind: 'missed_call',
    });
    throw await missed('User is not available right now');
  }

  const call: Active = { id: log.id, callerId: userId, calleeId, type, status: 'RINGING' };
  call.ringTimer = setTimeout(() => void onRingTimeout(call.id), RING_MS);
  calls.set(call.id, call);
  busy.set(userId, call.id);
  busy.set(calleeId, call.id);

  emitToUsers([calleeId], 'call:incoming', { callId: call.id, type, caller: lite(caller) });
  return { callId: call.id };
}

function getCall(callId: string, userId: string) {
  const call = calls.get(callId);
  if (!call) throw new ApiError(404, 'Call not found');
  if (call.callerId !== userId && call.calleeId !== userId) throw new ApiError(403, 'Not your call');
  return call;
}

export async function acceptCall(userId: string, raw: unknown) {
  const { callId } = z.object({ callId: z.string() }).parse(raw);
  const call = getCall(callId, userId);
  if (call.calleeId !== userId || call.status !== 'RINGING') throw new ApiError(400, 'Call cannot be accepted');

  if (call.ringTimer) clearTimeout(call.ringTimer);
  call.status = 'ACCEPTED';
  call.answeredAt = new Date();
  await prisma.callLog.update({ where: { id: call.id }, data: { status: 'ACCEPTED', answeredAt: call.answeredAt } });

  emitToUsers([call.callerId], 'call:accepted', { callId: call.id });
  emitToUsers([call.calleeId], 'call:handled', { callId: call.id }); // stops ringing on the callee's other devices
}

/** Hang up / decline / cancel: one event, the server works out which one it is. */
export async function endCall(userId: string, raw: unknown) {
  const { callId } = z.object({ callId: z.string() }).parse(raw);
  const call = getCall(callId, userId);
  if (call.status === 'ACCEPTED') await finish(call, 'ENDED', 'ended');
  else if (userId === call.callerId) await finish(call, 'CANCELED', 'canceled');
  else await finish(call, 'DECLINED', 'declined');
}

export async function relaySignal(userId: string, raw: unknown) {
  const { callId, data } = z.object({ callId: z.string(), data: z.unknown() }).parse(raw);
  const call = getCall(callId, userId);
  if (JSON.stringify(data ?? null).length > 20_000) throw new ApiError(400, 'Signal too large');
  const other = call.callerId === userId ? call.calleeId : call.callerId;
  emitToUsers([other], 'call:signal', { callId, data });
}

/** The user's last socket closed (tab closed / network lost) while ringing or in a call. */
export async function endCallsForUser(userId: string) {
  const id = busy.get(userId);
  const call = id ? calls.get(id) : undefined;
  if (!call) return;
  const status: FinalStatus =
    call.status === 'ACCEPTED' ? 'ENDED' : userId === call.callerId ? 'CANCELED' : 'DECLINED';
  await finish(call, status, 'disconnected');
}

export async function listCalls(userId: string) {
  const rows = await prisma.callLog.findMany({
    where: { OR: [{ callerId: userId }, { calleeId: userId }] },
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: { caller: { select: userSelect }, callee: { select: userSelect } },
  });
  return rows.map((r) => {
    const outgoing = r.callerId === userId;
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      direction: outgoing ? 'outgoing' : 'incoming',
      peer: lite(outgoing ? r.callee : r.caller),
      startedAt: r.startedAt,
      durationSec: r.durationSec,
      missed: !outgoing && (r.status === 'MISSED' || r.status === 'CANCELED'),
    };
  });
}

export function iceServers() {
  const servers: { urls: string[]; username?: string; credential?: string }[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({
      urls: env.TURN_URLS.split(',').map((s) => s.trim()),
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }
  return servers;
}
