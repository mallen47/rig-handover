import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-runs-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs sorted by name and counts the truncated line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('sums retries and keeps the last status', () => {
    const row = night!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(row).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', owner: 'rook' });
    expect(row.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(row.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('keeps the failure and its error', () => {
    const row = night!.rows.find((r) => r.job === 'notes/backup')!;
    expect(row).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps a null owner', () => {
    const row = night!.rows.find((r) => r.job === 'digest/render')!;
    expect(row.owner).toBeNull();
    expect(row.lastError).toBeNull();
  });

  it('keeps the offset of the log', () => {
    const row = night!.rows.find((r) => r.job === 'lane/sync')!;
    expect(row.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row.lastAt).toBe('2026-10-29T05:00:04+01:00');
    expect(row.retries).toBe(1);
  });
});

describe('readNight edge cases', () => {
  it('returns null for a missing file', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
  });

  it('returns null for an invalid night name', () => {
    expect(readNight(tmp, '../x')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('reads an empty file as nothing ran', () => {
    writeFileSync(join(tmp, '2026-02-01.jsonl'), '');
    expect(readNight(tmp, '2026-02-01')).toEqual({ night: '2026-02-01', rows: [], badLines: 0 });
  });

  it('counts lines with a bad shape and ignores blank lines', () => {
    const lines = [
      '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"weird","owner":"x"}',
      '{"job":"a","status":"ok","owner":"x"}',
      '[1,2]',
      '',
    ];
    writeFileSync(join(tmp, '2026-02-02.jsonl'), lines.join('\n') + '\n');
    const night = readNight(tmp, '2026-02-02')!;
    expect(night.badLines).toBe(3);
    expect(night.rows).toHaveLength(1);
  });
});
