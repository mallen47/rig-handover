import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const NORMAL = '2026-01-01';
const EMPTY = '2026-01-02';
const BAD = '2026-01-03';
const MISSING = '2026-01-04';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-routes-'));
  // Written out of job order on purpose: rows must come back sorted by job.
  const normal = [
    line('2026-01-01T23:10:00+01:00', 'delta-ok', 'ok', 'rook'),
    line('2026-01-01T23:20:00+01:00', 'charlie-ship', 'fail', 'rook', 'boom'),
    line('2026-01-01T23:30:00+01:00', 'bravo-build', 'retry', 'lane-07'),
    line('2026-01-01T23:31:00+01:00', 'bravo-build', 'retry', 'lane-07'),
    line('2026-01-01T23:32:00+01:00', 'bravo-build', 'retry', 'lane-07'),
    line('2026-01-01T23:33:00+01:00', 'bravo-build', 'ok', 'lane-07'),
    line('2026-01-01T23:40:00+01:00', 'alpha-sync', 'ok', null),
  ];
  fs.writeFileSync(path.join(dir, `${NORMAL}.jsonl`), normal.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, `${EMPTY}.jsonl`), '');
  fs.writeFileSync(
    path.join(dir, `${BAD}.jsonl`),
    [line('2026-01-03T23:00:00+01:00', 'echo-job', 'ok', 'rook'), '{"at":"2026-01-03T23:05:00+01:00","job":"trunc'].join('\n') + '\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-01-01T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

type ApiBody = {
  night: string;
  rows: { job: string; owner: string | null }[];
  badLines: number;
};

describe('GET /digest/:night', () => {
  it('renders the table for a night with a file', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest ${NORMAL}`);
    expect(html).toContain('<table');
    for (const job of ['alpha-sync', 'bravo-build', 'charlie-ship', 'delta-ok']) expect(html).toContain(job);
    expect(html).toContain('—');
    expect(html).not.toContain('nothing ran');
    expect(html).not.toContain('did not parse');
  });

  it('marks rows with retries >= 3 or a last status of fail with class="warn"', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    // bravo-build (3 retries) and charlie-ship (fail); alpha-sync and delta-ok are clean.
    expect(html.split('class="warn"').length - 1).toBe(2);
  });

  it('says nothing ran for an empty file, with no table', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('reports a line that did not parse', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line did not parse');
    expect(html).toContain('echo-job');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns night, rows sorted by job and badLines', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiBody;
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-sync', 'bravo-build', 'charlie-ship', 'delta-ok']);
  });

  it('gives a null owner as null, not as the dash', async () => {
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as ApiBody;
    expect(body.rows.find((r) => r.job === 'alpha-sync')?.owner).toBeNull();
    expect(body.rows.find((r) => r.job === 'delta-ok')?.owner).toBe('rook');
  });

  it('returns no rows for the empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('counts the line that did not parse', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiBody;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['echo-job']);
  });

  it('answers 404 with a JSON error for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });
});

describe('page and JSON agree', () => {
  it('lists the jobs in the page in the same order as the JSON rows', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as ApiBody;
    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
