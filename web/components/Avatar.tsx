import { Users } from 'lucide-react';

const colors = ['#2f9e6b', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1'];

function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % colors.length;
  return colors[h];
}

type Props = { name: string; src?: string | null; size?: number; online?: boolean; group?: boolean };

export default function Avatar({ name, src, size = 48, online, group }: Props) {
  const initials = name
    .replace(/^\+/, '')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <div
          className="grid h-full w-full place-items-center rounded-full font-semibold text-white"
          style={{ background: colorFor(name), fontSize: size * 0.36 }}
        >
          {group ? <Users size={size * 0.45} /> : initials || '?'}
        </div>
      )}
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-panel bg-brand" />}
    </div>
  );
}
