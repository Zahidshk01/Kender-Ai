import { Suspense, lazy } from "react";

/**
 * emoji-picker-react is a large bundle. Loading it lazily keeps it out of the
 * initial page download — it only arrives when the picker is actually opened.
 */
const EmojiPicker = lazy(async () => {
  const mod = await import("emoji-picker-react");
  const { EmojiStyle, Theme } = mod;
  const Picker = mod.default;
  return {
    default: ({ onPick }: { onPick: (emoji: string) => void }) => (
      <Picker
        emojiStyle={EmojiStyle.APPLE}
        theme={Theme.DARK}
        lazyLoadEmojis
        skinTonesDisabled
        previewConfig={{ showPreview: false }}
        width={320}
        height={400}
        onEmojiClick={(data) => onPick(data.emoji)}
      />
    ),
  };
});

export function LazyEmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[400px] w-[320px] items-center justify-center rounded-2xl bg-surface text-xs text-muted-foreground">
          Loading emojis…
        </div>
      }
    >
      <EmojiPicker onPick={onPick} />
    </Suspense>
  );
}
