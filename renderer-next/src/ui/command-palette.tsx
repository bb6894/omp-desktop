import { useEffect, useMemo, useRef, useState } from "react";

interface Command {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

function fuzzyMatch(text: string, query: string): number {
  let ti = 0, qi = 0;
  let score = 0;
  while (ti < text.length && qi < query.length) {
    if (text[ti].toLowerCase() === query[qi].toLowerCase()) {
      score += qi === 0 && ti === 0 ? 10 : 1;
      qi++;
    }
    ti++;
  }
  return qi === query.length ? score : 0;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((c) => ({ ...c, score: fuzzyMatch(c.label, query) + fuzzyMatch(c.description, query) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (i + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[index]) filtered[index].action();
      onClose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="command-palette__overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette__input-wrap">
          <span className="command-palette__icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入命令或关键词..."
            autoFocus
          />
          <kbd className="command-palette__esc">ESC</kbd>
        </div>
        <ul className="command-palette__list">
          {filtered.length === 0 ? (
            <li className="command-palette__empty">未找到匹配的命令</li>
          ) : (
            filtered.map((cmd, i) => (
              <li
                key={cmd.id}
                className={`command-palette__item${i === index ? " command-palette__item--active" : ""}`}
                onClick={() => { cmd.action(); onClose(); }}
                onMouseEnter={() => setIndex(i)}
              >
                <div className="command-palette__item-left">
                  <span className="command-palette__item-label">{cmd.label}</span>
                  <span className="command-palette__item-desc">{cmd.description}</span>
                </div>
                {cmd.shortcut && (
                  <kbd className="command-palette__shortcut">{cmd.shortcut}</kbd>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
