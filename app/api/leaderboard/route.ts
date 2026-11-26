import { json, clean } from '@/lib/http';
import { store } from '@/lib/store';

/**
 * GET /api/leaderboard?game=&period=week|all
 * 只回昵称/分数/星级，绝不回设备标识 —— 和原站「只显示昵称」一个口径。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const gameId = clean(url.searchParams.get('game') || 'fruit-slash', 40);
  const period = url.searchParams.get('period') === 'all' ? 'all' : 'week';
  const since = period === 'week' ? Date.now() - 7 * 86400_000 : 0;

  const { data } = await store();
  const rows = data.scores
    .filter((r) => r.game === gameId && r.at >= since)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 20)
    .map(({ nickname, score, stars, at, game }) => ({ nickname, score, stars, at, game }));

  return json({ game: gameId, period, rows });
}
