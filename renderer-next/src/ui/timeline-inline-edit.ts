/**
 * Inline editing support for user messages in timeline.
 * Tracks which entry is being edited and provides edit/retry operations.
 */

export type InlineEditState = {
  /** The entryId of the message being edited */
  entryId: string;
  /** The current text value in the textarea */
  text: string;
};

export type TimelineEditAction =
  | { kind: "start-edit"; entryId: string; text: string }
  | { kind: "update-edit"; entryId: string; text: string }
  | { kind: "cancel-edit" }
  | { kind: "submit-edit"; entryId: string; newText: string };

export interface InlineEditHandlers {
  onStartEdit: (entryId: string, text: string) => void;
  onUpdateEdit: (entryId: string, text: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (entryId: string, newText: string) => void;
}

export function createInlineEditReducer(
  handlers: InlineEditHandlers
): (action: TimelineEditAction) => void {
  return (action) => {
    switch (action.kind) {
      case "start-edit":
        handlers.onStartEdit(action.entryId, action.text);
        break;
      case "update-edit":
        handlers.onUpdateEdit(action.entryId, action.text);
        break;
      case "cancel-edit":
        handlers.onCancelEdit();
        break;
      case "submit-edit":
        handlers.onSubmitEdit(action.entryId, action.newText);
        break;
    }
  };
}

/** Generate a stable edit key from an entryId */
export function editKey(entryId: string): string {
  return `edit:${entryId}`;
}
