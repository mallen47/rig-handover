import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NIGHT_PATTERN } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

/** Counts parsed lines by status for one night. Bad lines are skipped. Null when the file can't be read. */
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  if (!NIGHT_PATTERN.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const { at, job, status, owner, error } = value as Record<string, unknown>;
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue;
    if (typeof job !== 'string' || job === '') continue;
    if (owner !== null && typeof owner !== 'string') continue;
    if (error !== undefined && typeof error !== 'string') continue;
    if (status === 'ok' || status === 'retry' || status === 'fail') counts[status]++;
  }
  return counts;
}
