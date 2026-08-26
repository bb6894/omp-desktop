import { useState } from "react";
import type { InteractionResponse } from "../../../protocol/domain";
import type { TimelineEntry } from "../lib/event-reducer";

type AskEntry = Extract<TimelineEntry, { kind: "ask" }>;

/**
 * Method-aware interaction cards. Response shapes follow the Runtime wire
 * contract (rpc-mode.ts): confirm reads top-level `confirmed`, value dialogs
 * read top-level `value`; `cancelled:true` resolves with the dialog default.
 * Stale, expired, duplicate, or cross-session answers fail closed at the
 * Host — this component only renders and submits.
 */
export function AskBubble({
  entry,
  busy,
  onAnswer
}: {
  entry: AskEntry;
  busy: boolean;
  onAnswer: (interactionId: string, response: InteractionResponse) => void;
}) {
  const [textValue, setTextValue] = useState("");
  if (entry.answered) {
    return (
      <div className="ask-bubble ask-bubble--answered">
        <span className="tl-role">已处理</span>
        <p className="tl-text">{entry.title}</p>
      </div>
    );
  }
  const answer = (response: InteractionResponse) => onAnswer(entry.id, response);
  const method = entry.method ?? "input";
  return (
    <div className="ask-bubble" role="group" aria-label="待你处理">
      <span className="tl-role">等待你处理</span>
      <p className="tl-text">{entry.title}</p>
      {entry.message && <p className="ask-bubble__message">{entry.message}</p>}
      <div className="ask-bubble__controls">
        {method === "confirm" && (
          <>
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => answer({ confirmed: true })}
            >
              允许
            </button>
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={() => answer({ confirmed: false })}
            >
              拒绝
            </button>
          </>
        )}
        {method === "select" && (entry.options ?? []).map((option) => (
          <button
            key={option}
            type="button"
            className="button"
            disabled={busy}
            onClick={() => answer({ value: option })}
          >
            {option}
          </button>
        ))}
        {(method === "input" || method === "editor") && (
          <>
            {method === "editor" ? (
              <textarea
                className="ask-bubble__input ask-bubble__input--area"
                value={textValue}
                rows={4}
                disabled={busy}
                onChange={(event) => setTextValue(event.currentTarget.value)}
              />
            ) : (
              <input
                className="ask-bubble__input"
                value={textValue}
                placeholder={entry.placeholder ?? ""}
                disabled={busy}
                onChange={(event) => setTextValue(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && textValue.trim()) answer({ value: textValue.trim() });
                }}
              />
            )}
            <button
              type="button"
              className="button button--primary"
              disabled={busy || !textValue.trim()}
              onClick={() => answer({ value: textValue.trim() })}
            >
              提交
            </button>
          </>
        )}
        <button
          type="button"
          className="button button--ghost"
          disabled={busy}
          title="忽略此次请求，Agent 将收到取消"
          onClick={() => answer({ cancelled: true })}
        >
          取消
        </button>
      </div>
    </div>
  );
}
