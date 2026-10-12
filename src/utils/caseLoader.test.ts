import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCaseFile } from './caseLoader';
import { SCHEMA_VERSION } from '../types';

const sampleText = readFileSync(
  resolve(__dirname, '../../public/samples/sample-case.json'),
  'utf-8'
);

const withChange = (change: (root: Record<string, unknown>) => void) => {
  const root = JSON.parse(sampleText);
  change(root);
  return JSON.stringify(root);
};

describe('loadCaseFile', () => {
  it('accepts the bundled sample case', () => {
    const result = loadCaseFile(sampleText);
    expect(result.error).toBeNull();
    expect(result.data?.scan.caseId).toBe('CASE-2026-0725-E');
  });

  it('rejects text that is not JSON', () => {
    expect(loadCaseFile('{ nope').error).toMatch(/not valid JSON/);
  });

  it('rejects JSON that is not an object', () => {
    expect(loadCaseFile('[1, 2]').error).toMatch(/JSON object/);
  });

  it('rejects a file with no schema version as not a case file', () => {
    expect(loadCaseFile('{"hello": "world"}').error).toMatch(/does not look like/);
  });

  it('tells the user to update the app for a newer schema', () => {
    const text = withChange((root) => (root.schemaVersion = SCHEMA_VERSION + 1));
    expect(loadCaseFile(text).error).toMatch(/newer than this build — update the web app/);
  });

  it('tells the user to re-run the analyzer for an older schema', () => {
    const text = withChange((root) => (root.schemaVersion = SCHEMA_VERSION - 1));
    expect(loadCaseFile(text).error).toMatch(/re-run the current version/);
  });

  it('names every structural problem at once', () => {
    const text = withChange((root) => {
      delete root.volume;
      root.files = { entries: [] };
    });
    const { error } = loadCaseFile(text);
    expect(error).toMatch(/'volume' is missing/);
    expect(error).toMatch(/'files' is not a valid collection/);
  });
});
