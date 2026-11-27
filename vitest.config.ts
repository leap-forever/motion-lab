import { defineConfig } from 'vitest/config';

/** 命中判定是纯几何函数，用 node 环境即可，不需要 jsdom / 浏览器 API */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
