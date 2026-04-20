import styles from './DevChatPane.module.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
  isStreaming: boolean;
}

export function InputBar({ value, onChange, onSend, onCancel, onPaste, isStreaming }: Props) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputBox}>
        <textarea
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            isStreaming
              ? 'Send to interrupt and ask something new...'
              : 'Ask Claude about this app...'
          }
          rows={2}
        />
        {isStreaming ? (
          <button className={styles.cancelBtn} onClick={onCancel} title="Stop" aria-label="Stop">
            <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
              <rect x="0" y="0" width="10" height="10" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            className={styles.sendBtn}
            onClick={onSend}
            disabled={!value.trim()}
            title="Send"
            aria-label="Send"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
