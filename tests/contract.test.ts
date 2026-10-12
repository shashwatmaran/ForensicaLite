/**
 * The analyzer <-> web app contract.
 *
 * case.ts is the single source of truth. schema/case.schema.json is generated
 * from it, and every case file the app could be handed — the bundled sample
 * and the analyzer's real output — is validated against that schema with
 * additionalProperties disallowed. A field renamed on one side and not the
 * other fails here rather than rendering as a silently empty column.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Ajv, { ValidateFunction } from 'ajv';
import { createGenerator } from 'ts-json-schema-generator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const schemaPath = join(root, 'schema', 'case.schema.json');
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));

let validate: ValidateFunction;

beforeAll(() => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  validate = ajv.compile(readJson(schemaPath));
});

const errorsOf = (data: unknown) =>
  validate(data) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);

describe('schema', () => {
  it('is up to date with src/types/case.ts', () => {
    const generated = createGenerator({
      path: join(root, 'src', 'types', 'case.ts'),
      tsconfig: join(root, 'tsconfig.app.json'),
      type: 'CaseFile',
    }).createSchema('CaseFile');

    // Compare as data, so line endings and key order in the file do not matter.
    expect(generated, 'run `npm run schema` and commit the result').toEqual(
      readJson(schemaPath)
    );
  });
});

describe('bundled sample case', () => {
  it('matches the schema', () => {
    const sample = readJson(join(root, 'public', 'samples', 'sample-case.json'));
    expect(errorsOf(sample)).toEqual([]);
  });

  it('would be rejected after a one-sided field rename', () => {
    // Guards the guard: an unknown key and a missing one must both fail.
    const sample = readJson(join(root, 'public', 'samples', 'sample-case.json'));
    const file = sample.files.entries[0];
    file.recordNo = file.recordNumber;
    delete file.recordNumber;
    const errors = errorsOf(sample).join('\n');
    expect(errors).toContain("must have required property 'recordNumber'");
    expect(errors).toContain('must NOT have additional properties');
  });
});

/**
 * The analyzer is run for real against the synthetic NTFS image. In CI a
 * missing interpreter is a failure; locally it skips with a reason, so the web
 * tests stay runnable on a machine without Python.
 */
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

const hasPython = (() => {
  try {
    execFileSync(python, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    if (process.env.CI) throw new Error(`Python interpreter '${python}' not found in CI`);
    return false;
  }
})();

describe.skipIf(!hasPython)('analyzer output', () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'forensica-contract-'));
    execFileSync(python, ['-m', 'tests.emit_case', outDir], {
      cwd: join(root, 'analyzer'),
      stdio: 'pipe',
    });
  }, 60_000);

  afterAll(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it.each(['synthetic-full.json', 'synthetic-triaged.json'])('%s matches the schema', (name) => {
    expect(errorsOf(readJson(join(outDir, name)))).toEqual([]);
  });
});
