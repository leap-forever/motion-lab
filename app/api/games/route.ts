import { json } from '@/lib/http';
import { GAMES } from '@/lib/games';

export async function GET() {
  return json({ games: GAMES });
}
