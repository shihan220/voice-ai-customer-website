export type DecorativeBanglaLetter = {
  char: string;
  left: string;
  opacity: number;
  rotation: string;
  size: string;
  top: string;
};

type DecorativeBanglaLettersProps = {
  className?: string;
  letters: readonly DecorativeBanglaLetter[];
  tone?: string;
};

export function DecorativeBanglaLetters({
  className = '',
  letters,
  tone = '#373A40',
}: DecorativeBanglaLettersProps) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()}>
      {letters.map((letter) => (
        <span
          key={`${letter.char}-${letter.top}-${letter.left}`}
          className="absolute select-none font-semibold"
          style={{
            color: tone,
            fontSize: letter.size,
            left: letter.left,
            opacity: letter.opacity,
            top: letter.top,
            transform: `rotate(${letter.rotation})`,
          }}
        >
          {letter.char}
        </span>
      ))}
    </div>
  );
}
