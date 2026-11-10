// Plan morning-digest § 1. The contract every part of § 2 builds against.

/** Status of one line in `runs/<night>.jsonl`. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of the run log. */
export type RunLine = {
  at: string; // ISO 8601 with the log's own offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One job of the night, summed over all its lines. */
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line that had one
  firstAt: string;
  lastAt: string;
};

/** A night's digest. Rows sorted by job. */
export type DigestNight = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[];
  badLines: number; // lines that did not parse; counted, never thrown
};

/** A night name is `YYYY-MM-DD`; anything else never reaches the file system. */
export const NIGHT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads `<runsDir>/<night>.jsonl`.
 * Returns null when the night is not a valid name or has no file (404).
 * An empty file returns `{ rows: [], badLines: 0 }` ("nothing ran").
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
