import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { nightCounts } from '../src/digest/counts.js';

describe('nightCounts', () => {
  it('counts lines by status and skips bad lines', () => {
    expect(nightCounts('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('counts an all-ok night', () => {
    const c = nightCounts('runs', '2026-10-27');
    expect(c).not.toBeNull();
    expect(c!.retry + c!.fail).toBe(0);
    expect(c!.ok).toBeGreaterThan(0);
  });

  it('returns null for a missing night', () => {
    expect(nightCounts('runs', '2000-01-01')).toBeNull();
  });
});

describe('board links', () => {
  it('links each night with its counts', async () => {
    const config = { adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: 'runs' };
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
  });
});
