/**
 * Exportable report.
 *
 * The web app is an instrument for reading a case; this is the document an
 * examiner hands to someone else. It is a single self-contained HTML file —
 * no scripts, no external assets — so it opens offline, survives being
 * emailed, and prints to PDF from any browser.
 *
 * Every number in it comes straight from the case file. Where the case file is
 * a triaged subset, the report says so in the same words the analyzer used:
 * an export that silently implied completeness would misrepresent the scan.
 */

import { CaseFile, Finding, MftFile, Severity } from '../types';
import {
  SEVERITY_ORDER,
  formatDuration,
  formatFileSize,
  formatNumber,
  formatRecoveryConfidence,
  formatUtc,
} from './formatters';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const e = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === '' ? '—' : escapeHtml(String(value));

const SEVERITY_COLOUR: Record<Severity, string> = {
  critical: '#b42318',
  high: '#c4320a',
  medium: '#b54708',
  low: '#175cd3',
  info: '#475467',
};

const bySeverity = (a: Finding, b: Finding) =>
  SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);

const definitionList = (rows: [string, string | number | null][]) =>
  `<dl class="facts">${rows
    .map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`)
    .join('')}</dl>`;

const findingSection = (finding: Finding) => `
  <article class="finding" style="border-left-color:${SEVERITY_COLOUR[finding.severity]}">
    <header>
      <span class="sev" style="color:${SEVERITY_COLOUR[finding.severity]}">${e(finding.severity)}</span>
      <h3>${e(finding.title)}</h3>
    </header>
    <p class="path">${e(finding.filePath)}${
      finding.recordNumber !== null ? ` <span class="muted">· MFT #${finding.recordNumber}</span>` : ''
    }</p>
    <p>${e(finding.description)}</p>
    <table>
      <thead><tr><th>Evidence</th><th>Value</th><th>Note</th></tr></thead>
      <tbody>${finding.evidence
        .map(
          (item) =>
            `<tr><td>${e(item.label)}</td><td class="mono">${e(item.value)}</td><td>${e(item.note)}</td></tr>`
        )
        .join('')}</tbody>
    </table>
    <p class="muted small">Finding ${e(finding.id)} · detector <span class="mono">${e(
      finding.detectedBy
    )}</span> · ${e(finding.confidence)} confidence</p>
  </article>`;

const deletedRow = (file: MftFile) => `
  <tr>
    <td class="mono">#${file.recordNumber}</td>
    <td class="mono">${e(file.filePath ?? file.fileName)}</td>
    <td class="num">${e(formatFileSize(file.size))}</td>
    <td>${e(file.recovery ? formatRecoveryConfidence(file.recovery.confidence) : null)}</td>
    <td class="mono small">${e(
      file.streams.find((s) => s.name === '')?.hash?.value ?? null
    )}</td>
  </tr>`;

const adsRows = (files: MftFile[]) =>
  files.flatMap((file) =>
    file.streams
      .filter((stream) => stream.name !== '')
      .map(
        (stream) => `
  <tr>
    <td class="mono">#${file.recordNumber}</td>
    <td class="mono">${e(file.filePath ?? file.fileName)}:${e(stream.name)}</td>
    <td class="num">${e(formatFileSize(stream.size))}</td>
    <td>${e(stream.residency)}</td>
    <td class="mono small">${e(stream.hash?.value ?? null)}</td>
  </tr>`
      )
  );

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #101828; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #344054; border-bottom: 1px solid #d0d5dd; padding-bottom: 6px; margin: 36px 0 14px; }
  h3 { font-size: 15px; margin: 0; }
  .mono, td.mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; word-break: break-all; }
  .muted { color: #667085; } .small { font-size: 11px; }
  .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px 24px; margin: 0; }
  .facts dt { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #667085; }
  .facts dd { margin: 2px 0 0; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { text-align: left; vertical-align: top; padding: 5px 8px; border-bottom: 1px solid #eaecf0; }
  th { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #475467; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .finding { border-left: 3px solid; padding: 4px 0 4px 14px; margin: 0 0 22px; break-inside: avoid; }
  .finding header { display: flex; gap: 10px; align-items: baseline; }
  .sev { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  .path { margin: 4px 0; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; word-break: break-all; }
  .notice { border: 1px solid #fedf89; background: #fffaeb; padding: 8px 12px; border-radius: 4px; }
  footer { margin-top: 48px; font-size: 11px; color: #667085; border-top: 1px solid #eaecf0; padding-top: 12px; }
  @media print { main { padding: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
`;

export const buildReportHtml = (data: CaseFile, generatedAt: Date = new Date()): string => {
  const { generator, volume, scan, statistics, findings, files } = data;
  const sorted = [...findings].sort(bySeverity);
  const deleted = files.entries.filter((file) => file.status === 'deleted' && !file.isDirectory);
  const streams = adsRows(files.entries);

  const severityCounts = SEVERITY_ORDER.map(
    (severity) => [severity, statistics.findingsBySeverity[severity] ?? 0] as [string, number]
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ForensicaLite report — ${e(scan.caseId)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <p class="muted small">ForensicaLite examination report</p>
  <h1>Case ${e(scan.caseId)}</h1>
  <p class="muted">${e(volume.label ?? 'Unlabelled volume')}${
    volume.driveLetter ? ` (${e(volume.driveLetter)})` : ''
  } · ${e(formatFileSize(volume.totalBytes))} NTFS · scanned ${e(formatUtc(scan.completedAt))}</p>

  <h2>Summary</h2>
  ${definitionList([
    ['Findings', formatNumber(findings.length)],
    ...severityCounts.map(([severity, count]) => [severity, formatNumber(count)] as [string, string]),
    ['MFT records parsed', formatNumber(scan.mftRecordsParsed)],
    ['Records in use', formatNumber(scan.mftRecordsInUse)],
    ['Deleted records', formatNumber(scan.mftRecordsDeleted)],
    ['Files recovered', formatNumber(scan.filesRecovered)],
    ['Alternate streams', formatNumber(statistics.fileCounts.withAlternateStreams)],
    ['Scan errors', formatNumber(scan.errors.length)],
  ])}

  <h2>Scan provenance</h2>
  ${definitionList([
    ['Analyzer', `${generator.tool} ${generator.version}`],
    ['Analyzer built', generator.builtAt ? formatUtc(generator.builtAt) : null],
    ['Started', formatUtc(scan.startedAt)],
    ['Completed', formatUtc(scan.completedAt)],
    ['Duration', formatDuration(scan.durationSeconds)],
    ['Host', scan.hostname],
    ['Operator', scan.operator],
    ['Schema version', data.schemaVersion],
  ])}

  <h2>Volume geometry</h2>
  ${definitionList([
    ['Serial number', volume.serialNumber],
    ['Volume created', volume.createdAt ? formatUtc(volume.createdAt) : null],
    ['Bytes per sector', formatNumber(volume.bytesPerSector)],
    ['Sectors per cluster', formatNumber(volume.sectorsPerCluster)],
    ['Bytes per cluster', formatNumber(volume.bytesPerCluster)],
    ['Total clusters', formatNumber(volume.totalClusters)],
    ['$MFT start cluster', formatNumber(volume.mftStartCluster)],
    ['MFT record size', formatNumber(volume.mftRecordSize)],
    ['MFT record slots', formatNumber(volume.mftRecordsTotal)],
  ])}

  <h2>Findings · ${formatNumber(findings.length)}</h2>
  ${sorted.length === 0 ? '<p class="muted">No detector fired on this volume.</p>' : sorted.map(findingSection).join('')}

  <h2>Deleted files · ${formatNumber(deleted.length)}</h2>
  ${
    deleted.length === 0
      ? '<p class="muted">No deleted file records among the emitted records.</p>'
      : `<table><thead><tr><th>Record</th><th>Path</th><th>Size</th><th>Recovery</th><th>SHA-256</th></tr></thead><tbody>${deleted
          .map(deletedRow)
          .join('')}</tbody></table>`
  }

  <h2>Alternate data streams · ${formatNumber(streams.length)}</h2>
  ${
    streams.length === 0
      ? '<p class="muted">No named $DATA streams among the emitted records.</p>'
      : `<table><thead><tr><th>Record</th><th>Stream</th><th>Size</th><th>Residency</th><th>SHA-256</th></tr></thead><tbody>${streams.join(
          ''
        )}</tbody></table>`
  }

  ${
    files.truncated
      ? `<p class="notice small">Records listed are a triaged subset: ${formatNumber(
          files.includedCount
        )} of ${formatNumber(files.totalCount)}. ${e(files.inclusionPolicy)}</p>`
      : ''
  }

  <h2>Scan errors · ${formatNumber(scan.errors.length)}</h2>
  ${
    scan.errors.length === 0
      ? '<p class="muted">The analyzer reported no parse failures.</p>'
      : `<table><thead><tr><th>Stage</th><th>Record</th><th>Message</th></tr></thead><tbody>${scan.errors
          .map(
            (error) =>
              `<tr><td>${e(error.stage)}</td><td class="mono">${
                error.recordNumber !== null ? `#${error.recordNumber}` : '—'
              }</td><td>${e(error.message)}</td></tr>`
          )
          .join('')}</tbody></table>`
  }

  <footer>
    Generated ${e(formatUtc(generatedAt.toISOString()))} by the ForensicaLite web app from case file
    <span class="mono">${e(scan.caseId)}</span>. All timestamps are UTC. Hashes are SHA-256 of
    the stream content the analyzer could read; they support integrity verification and are not,
    by themselves, a chain of custody.
  </footer>
</main>
</body>
</html>
`;
};

const csvCell = (value: string | number | null): string => {
  const text = value === null ? '' : String(value);
  // Neutralise formula injection: a cell beginning with = + - @ is executed by
  // spreadsheet applications, and file paths are attacker-controlled input.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

export const buildFindingsCsv = (data: CaseFile): string => {
  const header = [
    'id',
    'severity',
    'type',
    'detectedBy',
    'confidence',
    'recordNumber',
    'filePath',
    'title',
    'evidence',
  ];
  const rows = [...data.findings].sort(bySeverity).map((finding) => [
    finding.id,
    finding.severity,
    finding.type,
    finding.detectedBy,
    finding.confidence,
    finding.recordNumber,
    finding.filePath,
    finding.title,
    finding.evidence.map((item) => `${item.label}: ${item.value}`).join(' | '),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
};
