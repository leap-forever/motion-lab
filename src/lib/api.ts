/** 后端 API 的薄封装。同源 /api，dev 下由 Vite proxy 转发到 8787。 */

export interface GameInfo {
  id: string; name: string; nameEn: string; age: number[]; type: string;
  energy: string; duration: number; stars: number[]; shot: string;
  desc: string; playable: boolean;
}

export interface ScoreRow {
  nickname: string; score: number; stars: number; at: number; game: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${(data as { error?: string }).error || 'REQUEST_FAILED'}`) as Error & { status: number; data: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

/** localStorage 里的设备标识只用于成绩归因；不收集姓名，也不做任何局数限制 */
export function deviceId(): string {
  const key = 'motion-lab:device';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() ?? String(Date.now());
    localStorage.setItem(key, id);
  }
  return id;
}

export const api = {
  health: () => request<{ ok: boolean; build: string }>('/api/health'),
  games: () => request<{ games: GameInfo[] }>('/api/games'),
  leaderboard: (game: string) =>
    request<{ rows: ScoreRow[] }>(`/api/leaderboard?game=${encodeURIComponent(game)}`),
  submitScore: (payload: { game: string; nickname: string; score: number; durationMs: number; deviceId: string }) =>
    request<{ ok: boolean; stars: number; rank: number }>('/api/scores', {
      method: 'POST', body: JSON.stringify(payload),
    }),
  guest: (nickname: string) =>
    request<{ token: string; user: { nickname: string; plan: string } }>('/api/auth/guest', {
      method: 'POST', body: JSON.stringify({ nickname }),
    }),
};
