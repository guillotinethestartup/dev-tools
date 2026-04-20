import { useCallback, useEffect, useState } from 'react';
import styles from './DevChatPane.module.css';
import { useGitStatus } from './useGitStatus';
import type { Quadrant, GitFileStatus } from './devChatProtocol';

export const GIT_LIST_DEFAULT_W = 420;
export const GIT_DIFF_W = 720;
const MIN_GIT_LIST_W = 220;
const MIN_GIT_DIFF_W = 360;

function iconSideFor(quadrant: Quadrant): 'left' | 'right' {
  return quadrant === 'top-left' || quadrant === 'bottom-left' ? 'right' : 'left';
}

interface Props {
  quadrant: Quadrant;
  onClose: () => void;
  onDiffOpenChange: (open: boolean) => void;
}

export function GitPanel({ quadrant, onClose, onDiffOpenChange }: Props) {
  const gitStatus = useGitStatus();
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [expandedDiff, setExpandedDiff] = useState<{ repo: string; file: string } | null>(null);
  const [diffContent, setDiffContent] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [listW, setListW] = useState(GIT_LIST_DEFAULT_W);

  const iconSide = iconSideFor(quadrant);
  const diffOpen = !!expandedDiff;

  useEffect(() => {
    onDiffOpenChange(diffOpen);
  }, [diffOpen, onDiffOpenChange]);

  useEffect(() => {
    if (gitStatus.repos.length === 0 && !gitStatus.loading) gitStatus.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDiff = useCallback(
    async (repo: string, file: GitFileStatus) => {
      setExpandedDiff({ repo, file: file.path });
      setDiffContent('');
      setDiffLoading(true);
      const diff = await gitStatus.fetchDiff(repo, file.path, file.staged && !file.unstaged, 99999);
      setDiffContent(diff);
      setDiffLoading(false);
    },
    [gitStatus],
  );

  const closeDiff = useCallback(() => {
    setExpandedDiff(null);
    setDiffContent('');
  }, []);

  useEffect(() => {
    if (!expandedDiff) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDiff();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandedDiff, closeDiff]);

  const startSplitDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = listW;
      const maxW = GIT_LIST_DEFAULT_W + GIT_DIFF_W - MIN_GIT_DIFF_W;
      const handleMove = (ev: MouseEvent) => {
        const raw = ev.clientX - startX;
        const delta = iconSide === 'right' ? -raw : raw;
        setListW(Math.max(MIN_GIT_LIST_W, Math.min(maxW, startW + delta)));
      };
      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [listW, iconSide],
  );

  return (
    <div className={styles.gitSplit} data-icon-side={iconSide}>
      <div
        className={styles.gitSplitList}
        style={diffOpen ? { width: listW, flex: '0 0 auto' } : undefined}
      >
        <div className={styles.sidePanelHeader}>
          <span className={styles.sidePanelTitle}>Git</span>
          <button className={styles.sidePanelClose} onClick={onClose} aria-label="Close panel">
            ×
          </button>
        </div>
        <div className={styles.logTab}>
          <div className={styles.logContent}>
            {gitStatus.loading && gitStatus.repos.length === 0 ? (
              <div className={styles.empty}>Loading git status...</div>
            ) : gitStatus.error ? (
              <div className={styles.empty}>Error: {gitStatus.error}</div>
            ) : gitStatus.repos.length === 0 ? (
              <div className={styles.empty}>No repositories found.</div>
            ) : (
              gitStatus.repos.map((repo) => {
                const isExpanded = expandedRepos.has(repo.name);
                const fileCount = repo.files.length;
                return (
                  <div key={repo.name} className={styles.gitRepo}>
                    <button
                      className={styles.gitRepoHeader}
                      onClick={() => {
                        setExpandedRepos((prev) => {
                          const next = new Set(prev);
                          if (next.has(repo.name)) next.delete(repo.name);
                          else next.add(repo.name);
                          return next;
                        });
                      }}
                    >
                      <span className={styles.gitRepoToggle}>{isExpanded ? '▼' : '▶'}</span>
                      <span className={styles.gitRepoName}>{repo.name}</span>
                      <span className={styles.gitBranch}>{repo.branch}</span>
                      {(repo.ahead > 0 || repo.behind > 0) && (
                        <span className={styles.gitAheadBehind}>
                          {repo.ahead > 0 && `↑${repo.ahead}`}
                          {repo.ahead > 0 && repo.behind > 0 && ' '}
                          {repo.behind > 0 && `↓${repo.behind}`}
                        </span>
                      )}
                      {fileCount > 0 && <span className={styles.gitFileCount}>{fileCount}</span>}
                    </button>
                    {isExpanded && (
                      <div className={styles.gitFileList}>
                        {fileCount === 0 ? (
                          <div className={styles.gitClean}>Working tree clean</div>
                        ) : (
                          repo.files.map((file) => {
                            const isActive =
                              expandedDiff?.repo === repo.name && expandedDiff?.file === file.path;
                            return (
                              <button
                                key={file.path}
                                className={styles.gitFileRow}
                                data-active={isActive}
                                onClick={() => openDiff(repo.name, file)}
                              >
                                <span className={styles.gitStatusDot} data-status={file.status} />
                                <span className={styles.gitFilePath}>{file.path}</span>
                                <span className={styles.gitStagedLabel}>
                                  {file.staged && file.unstaged
                                    ? 'staged+unstaged'
                                    : file.staged
                                    ? 'staged'
                                    : ''}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className={styles.logActions}>
            <button
              className={styles.attachBtn}
              onClick={() => gitStatus.refresh()}
              disabled={gitStatus.loading}
            >
              {gitStatus.loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>
      {diffOpen && expandedDiff && (
        <>
          <div
            className={styles.gitSplitter}
            onMouseDown={startSplitDrag}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize diff pane"
          />
          <div className={styles.gitSplitDiff}>
            <button
              className={styles.diffFloatingClose}
              onClick={closeDiff}
              aria-label="Close diff"
              title="Close diff (Esc)"
            >
              ×
            </button>
            <div
              className={styles.diffPanelBody}
              data-selection-source="diff"
              data-selection-file={expandedDiff.file}
            >
              {diffLoading ? (
                <div className={styles.gitDiffLoading}>Loading diff...</div>
              ) : diffContent ? (
                <pre className={styles.diffPanelPre}>
                  <DiffLines text={diffContent} />
                </pre>
              ) : (
                <div className={styles.gitDiffLoading}>No diff available</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DiffLines({ text }: { text: string }) {
  const lines = text.split('\n');
  let newLn = 0;
  let oldLn = 0;
  return (
    <>
      {lines.map((line, i) => {
        let type: 'add' | 'del' | 'hunk' | 'ctx' | 'meta' = 'ctx';
        let thisNew: number | undefined;
        let thisOld: number | undefined;
        if (line.startsWith('@@')) {
          type = 'hunk';
          const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
          if (m) {
            oldLn = parseInt(m[1], 10);
            newLn = parseInt(m[2], 10);
          }
        } else if (
          line.startsWith('+++') ||
          line.startsWith('---') ||
          line.startsWith('diff ') ||
          line.startsWith('index ')
        ) {
          type = 'meta';
        } else if (line.startsWith('+')) {
          type = 'add';
          thisNew = newLn++;
        } else if (line.startsWith('-')) {
          type = 'del';
          thisOld = oldLn++;
        } else {
          thisNew = newLn++;
          thisOld = oldLn++;
        }
        return (
          <span
            key={i}
            className={styles.gitDiffLine}
            data-type={type}
            data-line-new={thisNew}
            data-line-old={thisOld}
          >
            {line}
            {'\n'}
          </span>
        );
      })}
    </>
  );
}
