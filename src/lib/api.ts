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

/** 原站也用 localStorage 里的设备标识做免登录试玩计数，不收集姓名 */
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
  trial: (id: string) =>
    request<{ limit: number; used: number; remaining: number }>(`/api/trial?deviceId=${encodeURIComponent(id)}`),
  consumeTrial: (id: string) =>
    request<{ allowed: boolean; remaining: number }>('/api/trial/consume', {
      method: 'POST', body: JSON.stringify({ deviceId: id }),
    }).catch((err: Error & { status?: number; data?: { remaining?: number } }) => {
      // 403 是业务结果不是异常：把 remaining 带回去给 UI
      if (err.status === 403) return { allowed: false, remaining: err.data?.remaining ?? 0 };
      throw err;
    }),
  submitScore: (payload: { game: string; nickname: string; score: number; durationMs: number; deviceId: string }) =>
    request<{ ok: boolean; stars: number; rank: number }>('/api/scores', {
      method: 'POST', body: JSON.stringify(payload),
    }),
  guest: (nickname: string) =>
    request<{ token: string; user: { nickname: string; plan: string } }>('/api/auth/guest', {
      method: 'POST', body: JSON.stringify({ nickname }),
    }),
};
