/// <reference lib="webworker" />
/**
 * 配装搜索的后台线程：主线程先发 init（搜索索引），之后每次 search 都在这里跑，
 * 结果分批回传，界面不会被卡住。换条件重新搜索时主线程直接终止本线程再开新的。
 */
import { searchBuilds, type SearchIndex, type SearchQuery, type SearchResult } from '../../lib/world/search';

export type WorkerRequest =
  { type: 'init'; index: SearchIndex } | { type: 'search'; id: number; query: SearchQuery };

export type WorkerResponse =
  | { type: 'batch'; id: number; results: SearchResult[] }
  | {
      type: 'done';
      id: number;
      ms: number;
      stats: ReturnType<typeof searchBuilds>;
    }
  | { type: 'error'; id: number; message: string };

let index: SearchIndex | null = null;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    index = msg.index;
    return;
  }
  const { id, query } = msg;
  if (!index) {
    post({ type: 'error', id, message: '搜索索引尚未加载' });
    return;
  }
  const t0 = performance.now();
  let batch: SearchResult[] = [];
  let last = t0;
  try {
    const stats = searchBuilds(index, query, (r) => {
      batch.push(r);
      // 每 200 个或每 50 ms 回传一次，先出来的方案先显示
      const now = performance.now();
      if (batch.length >= 200 || now - last > 50) {
        post({ type: 'batch', id, results: batch });
        batch = [];
        last = now;
      }
    });
    if (batch.length) post({ type: 'batch', id, results: batch });
    post({ type: 'done', id, ms: performance.now() - t0, stats });
  } catch (err) {
    post({ type: 'error', id, message: String(err) });
  }
};

function post(m: WorkerResponse) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
}
