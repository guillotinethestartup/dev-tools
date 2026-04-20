import styles from './DevChatPane.module.css';
import type { ChatAttachments } from './devChatProtocol';
import type { TextSelectionApi } from './useTextSelection';

interface Props {
  attachments: ChatAttachments;
  selection: TextSelectionApi;
  onRemoveScreenshot: (index: number) => void;
  onDetachConsoleLogs: () => void;
  onDetachServerLogs: () => void;
}

export function ContextBar({
  attachments,
  selection,
  onRemoveScreenshot,
  onDetachConsoleLogs,
  onDetachServerLogs,
}: Props) {
  const hasScreenshots = (attachments.screenshots?.length ?? 0) > 0;
  const hasConsole = !!attachments.consoleLogs;
  const hasServer = !!attachments.serverLogs;
  const hasChips = selection.chips.length > 0;
  if (!hasScreenshots && !hasConsole && !hasServer && !hasChips) return null;

  return (
    <div className={styles.contextBar}>
      {selection.chips.map((c) => {
        const lineInfo =
          c.source === 'diff' && c.lineStart !== undefined
            ? c.lineEnd && c.lineEnd !== c.lineStart
              ? ` L${c.lineStart}-${c.lineEnd}`
              : ` L${c.lineStart}`
            : '';
        const label =
          c.source === 'diff' && c.file
            ? `diff: ${c.file.split('/').pop()}${lineInfo}`
            : `${c.source} selection`;
        return (
          <button
            key={c.id}
            className={styles.contextChip}
            data-active={true}
            onClick={() => selection.removeChip(c.id)}
            title={c.text}
          >
            {label}
            <span className={styles.chipX}>&times;</span>
          </button>
        );
      })}
      {attachments.screenshots?.map((_, i) => (
        <button
          key={`ss-${i}`}
          className={styles.contextChip}
          data-active={true}
          onClick={() => onRemoveScreenshot(i)}
          title="Click to remove"
        >
          Screenshot{attachments.screenshots!.length > 1 ? ` ${i + 1}` : ''}
          <span className={styles.chipX}>&times;</span>
        </button>
      ))}
      {hasConsole && (
        <button
          className={styles.contextChip}
          data-active={true}
          onClick={onDetachConsoleLogs}
          title="Click to remove"
        >
          Console logs
          <span className={styles.chipX}>&times;</span>
        </button>
      )}
      {hasServer && (
        <button
          className={styles.contextChip}
          data-active={true}
          onClick={onDetachServerLogs}
          title="Click to remove"
        >
          Server logs
          <span className={styles.chipX}>&times;</span>
        </button>
      )}
    </div>
  );
}
