import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CaseFile } from '../types';
import { buildFindingsCsv, buildReportHtml, escapeHtml } from './report';

const sample = (): CaseFile =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../public/samples/sample-case.json'), 'utf-8')
  );

describe('buildReportHtml', () => {
  it('is a self-contained document with no scripts or external assets', () => {
    const html = buildReportHtml(sample());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script|<link|src=|https?:\/\//i);
  });

  it('includes every finding, most severe first', () => {
    const data = sample();
    const html = buildReportHtml(data);
    for (const finding of data.findings) {
      expect(html).toContain(escapeHtml(finding.title));
      expect(html).toContain(finding.detectedBy);
    }
    const critical = html.indexOf('>critical<');
    const low = html.indexOf('>low<');
    if (critical !== -1 && low !== -1) expect(critical).toBeLessThan(low);
  });

  it('escapes attacker-controlled names instead of injecting them', () => {
    const data = sample();
    data.findings[0].filePath = 'E:\\<img src=x onerror=alert(1)>.txt';
    const html = buildReportHtml(data);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('discloses a truncated record set rather than implying completeness', () => {
    const data = sample();
    data.files.truncated = true;
    data.files.totalCount = 99999;
    expect(buildReportHtml(data)).toMatch(/triaged subset/);
  });

  it('states the generation time in UTC', () => {
    const html = buildReportHtml(sample(), new Date('2026-10-12T08:30:00Z'));
    expect(html).toContain('2026-10-12 08:30:00.000 UTC');
  });
});

describe('buildFindingsCsv', () => {
  it('has a header row and one row per finding', () => {
    const data = sample();
    const lines = buildFindingsCsv(data).trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'id,severity,type,detectedBy,confidence,recordNumber,filePath,title,evidence'
    );
    expect(lines).toHaveLength(data.findings.length + 1);
  });

  it('quotes cells containing commas and quotes', () => {
    const data = sample();
    data.findings = [{ ...data.findings[0], title: 'a "quoted", title' }];
    expect(buildFindingsCsv(data)).toContain('"a ""quoted"", title"');
  });

  it('neutralises spreadsheet formula injection in file paths', () => {
    const data = sample();
    data.findings = [{ ...data.findings[0], filePath: '=HYPERLINK("http://x")' }];
    const row = buildFindingsCsv(data).split('\r\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});
