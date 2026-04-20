import styles from './DevChatPane.module.css';
import type { TextSelectionApi } from './useTextSelection';

interface Props {
  selection: TextSelectionApi;
}

export function SelectionOverlay({ selection }: Props) {
  const ui = selection.selectionUI;
  if (!ui) return null;
  return (
    <>
      <button
        data-screenshot-popover="true"
        className={styles.selectionPopover}
        style={{ left: ui.popover.x, top: ui.popover.y }}
        onMouseDown={(e) => {
          e.preventDefault();
          selection.attachCurrentSelection();
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        Attach selection
      </button>
      <div
        data-screenshot-popover="true"
        data-selection-handle="start"
        className={styles.selectionHandle}
        data-which="start"
        style={{ left: ui.start.x, top: ui.start.y }}
        onMouseDown={selection.onHandleMouseDown('start')}
      />
      <div
        data-screenshot-popover="true"
        data-selection-handle="end"
        className={styles.selectionHandle}
        data-which="end"
        style={{ left: ui.end.x, top: ui.end.y }}
        onMouseDown={selection.onHandleMouseDown('end')}
      />
    </>
  );
}
