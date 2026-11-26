import { json } from '@/lib/http';
import { BUILD, GAMES } from '@/lib/games';

export async function GET() {
  return json({ ok: true, build: BUILD, now: Date.now(), games: GAMES.length });
}
