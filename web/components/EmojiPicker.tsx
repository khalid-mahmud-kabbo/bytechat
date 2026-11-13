const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😅','😉','🙂',
  '😢','😭','😡','🥳','😴','🤗','😇','🙄','😬','🤩','😋','🤝',
  '👍','👎','👏','🙏','💪','👌','✌️','🤞','👋','🙌','❤️','💔',
  '🔥','✨','🎉','💯','✅','❌','⭐','🌹','☕','🍕','🎂','🚀',
];

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="absolute bottom-14 left-0 z-20 grid w-72 grid-cols-8 gap-1 rounded-2xl border border-line bg-panel p-2 shadow-xl">
      {EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} className="rounded-lg p-1 text-xl hover:bg-soft">
          {e}
        </button>
      ))}
    </div>
  );
}
