import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NIGHT_PATTERN, type DigestRow, type ReadNight, type RunLine, type RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** Parses one raw line at the edge. Returns null for anything that is not a valid RunLine. */
function parseLine(raw: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status, owner };
  if (error !== undefined) line.error = error;
  return line;
}

function summarize(job: string, lines: RunLine[]): DigestRow {
  // Order by time; ties keep file order (Array.prototype.sort is stable).
  const ordered = [...lines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  let lastError: string | null = null;
  for (const line of ordered) if (line.error !== undefined) lastError = line.error;
  return {
    job,
    owner: last.owner,
    runs: ordered.length,
    retries: ordered.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT_PATTERN.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    const list = byJob.get(line.job);
    if (list) list.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.entries()]
    .map(([job, lines]) => summarize(job, lines))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines };
};
