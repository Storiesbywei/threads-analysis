import { useEffect, useRef, useState } from 'react';

interface TextScrambleProps {
  text: string;
  speed?: number;
  className?: string;
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*<>[]{}';

export function TextScramble({ text, speed = 30, className = '' }: TextScrambleProps) {
  const [display, setDisplay] = useState(text);
  const frameRef = useRef(0);
  const iterRef = useRef(0);

  useEffect(() => {
    iterRef.current = 0;
    const target = text;

    const update = () => {
      const chars = target.split('').map((char, i) => {
        if (i < iterRef.current) return char;
        return CHARS[Math.floor(Math.random() * CHARS.length)];
      });
      setDisplay(chars.join(''));

      if (iterRef.current < target.length) {
        iterRef.current += 1;
        frameRef.current = window.setTimeout(update, speed);
      }
    };

    frameRef.current = window.setTimeout(update, speed);
    return () => window.clearTimeout(frameRef.current);
  }, [text, speed]);

  return <span className={`font-mono whitespace-pre ${className}`}>{display}</span>;
}
