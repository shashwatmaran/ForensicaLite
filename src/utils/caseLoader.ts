/**
 * Case file loading and validation.
 *
 * This replaces the old normalizer, which existed to guess at three
 * generations of drifting analyzer output. Now that the schema is a versioned
 * contract, the job is verification rather than reconciliation: either the
 * file matches the schema this build understands, or it is rejected with a
 * message that says exactly why.
 */

import { CaseFile, SCHEMA_VERSION } from '../types';

export interface LoadResult {
  data: CaseFile | null;
  error: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Shape check for the Collection<T> wrapper used by `files` and `timeline`. */
const isCollection = (value: unknown): boolean =>
  isObject(value) &&
  Array.isArray(value.entries) &&
  typeof value.includedCount === 'number' &&
  typeof value.totalCount === 'number';

/**
 * Structural validation. This is not a full deep validation of every record —
 * the analyzer and the app are built from the same schema, so the realistic
 * failure modes are "wrong file entirely" and "version mismatch", both of
 * which the checks below catch cheaply.
 */
const collectStructuralProblems = (root: Record<string, unknown>): string[] => {
  const problems: string[] = [];

  const requireObject = (key: string) => {
    if (!isObject(root[key])) problems.push(`'${key}' is missing or not an object`);
  };

  requireObject('generator');
  requireObject('volume');
  requireObject('scan');
  requireObject('statistics');

  if (!Array.isArray(root.findings)) {
    problems.push("'findings' is missing or not an array");
  }
  if (!isCollection(root.files)) {
    problems.push("'files' is not a valid collection (needs entries, includedCount, totalCount)");
  }
  if (!isCollection(root.timeline)) {
    problems.push("'timeline' is not a valid collection (needs entries, includedCount, totalCount)");
  }

  const scan = root.scan;
  if (isObject(scan) && typeof scan.caseId !== 'string') {
    problems.push("'scan.caseId' is missing or not a string");
  }

  return problems;
};

export const loadCaseFile = (content: string): LoadResult => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parse error';
    return { data: null, error: `File is not valid JSON — ${detail}` };
  }

  if (!isObject(parsed)) {
    return { data: null, error: 'Expected a JSON object at the top level of the case file.' };
  }

  const version = parsed.schemaVersion;

  if (typeof version !== 'number') {
    return {
      data: null,
      error:
        "No 'schemaVersion' field found. This does not look like a ForensicaLite case file — " +
        'make sure you are uploading the JSON produced by checkup.exe.',
    };
  }

  if (version !== SCHEMA_VERSION) {
    const direction = version > SCHEMA_VERSION ? 'newer than' : 'older than';
    return {
      data: null,
      error:
        `Case file uses schema version ${version}, but this app understands version ` +
        `${SCHEMA_VERSION}. The file is ${direction} this build — ` +
        (version > SCHEMA_VERSION
          ? 'update the web app.'
          : 're-run the current version of checkup.exe to regenerate it.'),
    };
  }

  const problems = collectStructuralProblems(parsed);

  if (problems.length > 0) {
    return {
      data: null,
      error: `Case file claims schema version ${version} but is malformed: ${problems.join('; ')}.`,
    };
  }

  return { data: parsed as unknown as CaseFile, error: null };
};
