import { useState, useCallback } from 'react';
import type { GitRepoStatus } from './devChatProtocol';

const BRIDGE_URL = 'http://localhost:9100';

export interface GitStatusResult {
  repos: GitRepoStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  fetchDiff: (repo: string, file: string, staged?: boolean, context?: number) => Promise<string>;
}

export function useGitStatus(): GitStatusResult {
  const [repos, setRepos] = useState<GitRepoStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BRIDGE_URL}/git/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRepos(data.repos);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDiff = useCallback(async (repo: string, file: string, staged = false, context?: number): Promise<string> => {
    const params = new URLSearchParams({ repo, file });
    if (staged) params.set('staged', 'true');
    if (context !== undefined) params.set('context', String(context));
    try {
      const res = await fetch(`${BRIDGE_URL}/git/diff?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.diff;
    } catch {
      return 'Failed to load diff';
    }
  }, []);

  return { repos, loading, error, refresh, fetchDiff };
}
