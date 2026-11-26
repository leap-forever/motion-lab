import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 教学用最小持久化：内存对象 + 节流落盘 + 临时文件原子替换。
 * 原站后端真实实现看不到（只看到前端调用的 /api/auth/* 形状），
 * 这里用 JSON 文件代替数据库，目的是让「必要的后端服务」能零依赖跑起来。
 */
const empty = () => ({ version: 1, seq: 1, scores: [], users: {} });

export async function openStore(file) {
  let data = empty();
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed && typeof parsed === 'object') data = { ...empty(), ...parsed };
  } catch {
    // 文件不存在或坏掉：从空库开始，不阻塞启动
  }
  // 旧版按天累计的试玩计数字段已废弃，读旧库时顺手清掉，不再落盘
  delete data.trials;
  await mkdir(dirname(file), { recursive: true });

  let dirty = false;
  let timer = null;

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
