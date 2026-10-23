import { activeTrials, type TrialRetention } from "./trial-history";
import type { TrialSample } from "./trial-run";

type StoredRun = TrialRetention & { sample: TrialSample };
type Bucket = { runs: StoredRun[]; sequence: number; media: Record<string, Blob> };
const database = "openhandle-phase2-trials";
let writes: Promise<unknown> = Promise.resolve();

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readBucket(key: string): Promise<Bucket | undefined> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function loadTrialHistory<T extends StoredRun>(key: string, onUrl: (url: string) => void): Promise<{ runs: T[]; sequence: number }> {
  const bucket = await readBucket(key);
  const runs = activeTrials((bucket?.runs ?? []) as T[]).map((run) => {
    const blob = bucket?.media[run.sample.id];
    const sample = blob ? { ...run.sample, previewUrl: URL.createObjectURL(blob) } : run.sample;
    if (blob) onUrl(sample.previewUrl);
    // A browser reload ends the local simulator; it cannot resume real execution.
    if (run.phase === "running") {
      const record = run as T & { records?: Record<string, { status: string; error?: string }>; failureReason?: string };
      return { ...record, sample, phase: "failed" as const, failureReason: "页面关闭或刷新，本轮模拟已中断", records: Object.fromEntries(Object.entries(record.records ?? {}).map(([id, value]) => [id, ["queued", "running"].includes(value.status) ? { ...value, status: "unexecuted", error: "页面刷新，本节点未完成" } : value])) };
    }
    return { ...run, sample };
  });
  return { runs, sequence: bucket?.sequence ?? 0 };
}
/** Serial writes prevent a slower media save from resurrecting a deleted round. */
export function saveTrialHistory(key: string, runs: StoredRun[], sequence: number): Promise<void> {
  const detached = JSON.parse(JSON.stringify(activeTrials(runs))) as StoredRun[];
  const operation = writes.catch(() => {}).then(async () => {
    const previous = await readBucket(key);
    const media: Record<string, Blob> = {};
    for (const run of detached) {
      if (run.sample.source !== "local" || media[run.sample.id]) continue;
      const existing = previous?.media[run.sample.id];
      if (existing) media[run.sample.id] = existing;
      else if (run.sample.previewUrl.startsWith("blob:")) media[run.sample.id] = await (await fetch(run.sample.previewUrl)).blob();
    }
    const db = await openStore();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put({ runs: detached, sequence, media }, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  });
  writes = operation;
  return operation;
}
