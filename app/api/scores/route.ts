import { json, clean, readJson } from '@/lib/http';
import { GAMES, starsFor } from '@/lib/games';
import { store } from '@/lib/store';

/**
 * POST /api/scores —— 上报成绩，服务端算星级与排名。
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (err) {
    return json({ error: String((err as Error).message) }, 400);
  }

  const game = GAMES.find((g) => g.id === body.game);
  if (!game) return json({ error: 'UNKNOWN_GAME' }, 400);

  const nickname = clean(body.nickname, 16) || '小玩家';
  const score = Math.max(0, Math.min(9999, Math.round(Number(body.score) || 0)));
  const durationMs = Math.max(0, Math.min(3600_000, Math.round(Number(body.durationMs) || 0)));

  const { data, save } = await store();
  const record = {
    id: data.seq++,
    game: game.id,
    nickname,
    score,
    stars: starsFor(game, score),
    durationMs,
    at: Date.now(),
    // deviceId 只留在服务端做成绩归因；绝不下发到榜单
    deviceId: clean(body.deviceId, 64),
  };
  data.scores.push(record);
  if (data.scores.length > 5000) data.scores.splice(0, data.scores.length - 5000);
  save();

  const rank = data.scores.filter((r) => r.game === game.id && r.score > score).length + 1;
  return json({ ok: true, id: record.id, stars: record.stars, rank }, 201);
}
