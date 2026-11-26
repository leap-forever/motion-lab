import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * 教学用最小持久化：内存对象 + 节流落盘 + 临时文件原子替换。
 * 由 server/store.mjs 迁移而来；逻辑等价，加了类型。
 *
 * 用 globalThis 缓存单例，避免 Next.js dev 热更新时重复打开 db.json、
 * 重复注册 SIGINT/SIGTERM。`next start` 常驻进程下也只初始化一次。
 */
export interface ScoreRecord {
  id: number;
  game: string;
  nickname: string;
  score: number;
  stars: number;
  durationMs: number;
  at: number;
  /** 只留在服务端做成绩归因，绝不下发到榜单 */
  deviceId: string;
}

export interface UserRecord {
  id: string;
  nickname: string;
  plan: string;
  createdAt: number;
}

export interface DbData {
  version: number;
  seq: number;
  scores: ScoreRecord[];
  users: Record<string, UserRecord>;
}

export interface Store {
  data: DbData;
  save: () => void;
  flush: () => Promise<void>;
}

const empty = (): DbData => ({ version: 1, seq: 1, scores: [], users: {} });

async function openStore(file: string): Promise<Store> {
  let data = empty();
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed && typeof parsed === 'object') data = { ...empty(), ...parsed };
  } catch {
    // 文件不存在或坏掉：从空库开始，不阻塞启动
  }
  // 旧版按天累计的试玩计数字段已废弃，读旧库时顺手清掉，不再落盘
  delete (data as unknown as Record<string, unknown>).trials;
  await mkdir(dirname(file), { recursive: true });

  let dirty = false;
  let timer: NodeJS.Timeout | null = null;

  async function flush() {
    if (!dirty) return;
    dirty = false;
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, file); // 原子替换，避免写一半时读到坏 JSON
  }

  function save() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush().catch((err) => console.error('[store] 落盘失败', err));
    }, 200);
    timer.unref?.();
  }

  process.on('SIGINT', () => { flush().finally(() => process.exit(0)); });
  process.on('SIGTERM', () => { flush().finally(() => process.exit(0)); });

  return { data, save, flush };
}

type GlobalWithStore = typeof globalThis & { __motionLabStore?: Promise<Store> };

const g = globalThis as GlobalWithStore;

/**
 * 取单例 store；首次调用打开 db.json。
 * Vercel 的项目目录只读，只能用 /tmp；本地仍用 data/ 方便查看和留存。
 */
const DATA_DIR = process.env.VERCEL
  ? '/tmp/motion-lab-data'
  : join(process.cwd(), 'data');

export function store(): Promise<Store> {
  if (!g.__motionLabStore) {
    g.__motionLabStore = openStore(join(DATA_DIR, 'db.json'));
  }
  return g.__motionLabStore;
}
