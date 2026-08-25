"use client";

interface MentionTextProps {
  text: string;
}

export function MentionText({ text }: MentionTextProps) {
  const parts = text.split(/(@\w+(?:\s\w+)?)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          return (
            <span
              key={i}
              className="inline-flex items-center bg-primary/15 text-primary font-medium rounded px-1 text-xs"
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
