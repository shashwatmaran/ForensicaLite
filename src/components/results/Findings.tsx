import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Finding, Severity } from '../../types';
import { SEVERITY_ORDER, formatUtc, humanizeSlug, severityBg } from '../../utils/formatters';
import {
  EmptyState,
  Mono,
  Disclosure,
  Panel,
  PanelHeader,
  PathText,
  Segmented,
  SegmentedOption,
  SeverityMark,
} from '../ui/primitives';

/**
 * Findings, ordered by severity, each expandable to its evidence.
 *
 * A finding is only worth as much as the values it rests on, so the evidence
 * table is the substance and the verdict is the summary. The detector id is
 * always visible: naming the rule that fired makes a conclusion auditable
 * rather than something to take on trust.
 */

/** Evidence values are strings; ones that are ISO instants read as UTC like everywhere else. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const EvidenceTable: React.FC<{ finding: Finding }> = ({ finding }) => (
  <div className="overflow-x-auto border-t border-ink-800 bg-ink-950/40 light:border-ink-100 light:bg-ink-25">
    <table className="w-full min-w-[30rem] text-left">
      <tbody>
        {finding.evidence.map((item, index) => (
          <tr
            key={index}
            className="border-b border-ink-850 last:border-0 light:border-ink-50"
          >
            <th
              scope="row"
              className="w-48 py-2 pl-14 pr-3 align-top text-xs font-normal text-ink-400"
            >
              {item.label}
            </th>
            <td className="py-2 pr-3 align-top font-mono text-xs text-ink-100 light:text-ink-900">
              {ISO_TIMESTAMP.test(item.value) ? formatUtc(item.value) : item.value}
            </td>
            <td className="py-2 pr-4 align-top text-xs text-ink-400">{item.note ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const FindingRow: React.FC<{ finding: Finding }> = ({ finding }) => {
  const [open, setOpen] = useState(false);

  return (
    <li>
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-850 light:hover:bg-ink-25"
      >
        <Disclosure open={open} className="mt-1" />
        <span
          className={clsx('mt-0.5 h-10 w-0.5 shrink-0', severityBg(finding.severity))}
          aria-hidden
        />

        <span className="min-w-0-fix flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-sm font-medium text-ink-50 light:text-ink-900">
              {finding.title}
            </span>
            <SeverityMark severity={finding.severity} />
          </span>

          <span className="mt-1 block">
            <PathText path={finding.filePath} className="text-xs" />
          </span>

          {/* What fired, on which record, how sure: read left to right
              under the title, not stranded at the far edge of the row. */}
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-2xs text-ink-400">
            {finding.recordNumber !== null && (
              <>
                <Mono className="text-2xs">MFT #{finding.recordNumber}</Mono>
                <span aria-hidden>·</span>
              </>
            )}
            <Mono className="text-2xs">{finding.detectedBy}</Mono>
            <span aria-hidden>·</span>
            <span>{finding.confidence} confidence</span>
          </span>
        </span>

        <span className="mt-0.5 shrink-0 text-2xs text-ink-500 transition-colors group-hover:text-ink-300 light:group-hover:text-ink-800">
          {finding.evidence.length} evidence {finding.evidence.length === 1 ? 'item' : 'items'}
        </span>
      </button>

      {open && (
        <div>
          <p className="max-w-3xl px-4 pb-3 pl-14 text-sm leading-relaxed text-ink-200 light:text-ink-700">
            {finding.description}
          </p>
          {finding.evidence.length > 0 && <EvidenceTable finding={finding} />}
        </div>
      )}
    </li>
  );
};

const Findings: React.FC<{ findings: Finding[] }> = ({ findings }) => {
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const types = useMemo(() => {
    const seen = new Map<string, number>();
    findings.forEach((f) => seen.set(f.type, (seen.get(f.type) ?? 0) + 1));
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [findings]);

  const ordered = useMemo(() => {
    const rank = new Map<Severity, number>(SEVERITY_ORDER.map((s, i) => [s, i]));
    const visible =
      typeFilter === 'all' ? findings : findings.filter((f) => f.type === typeFilter);

    return [...visible].sort((a, b) => {
      const bySeverity = (rank.get(a.severity) ?? 9) - (rank.get(b.severity) ?? 9);
      if (bySeverity !== 0) return bySeverity;
      return (a.recordNumber ?? 0) - (b.recordNumber ?? 0);
    });
  }, [findings, typeFilter]);

  if (findings.length === 0) {
    return (
      <Panel>
        <PanelHeader title="Findings" meta="0" />
        <EmptyState
          title="No findings were raised for this volume."
          detail="Absence of findings is not proof of a clean system. It means none of the configured detectors matched — which is a statement about the detectors, not the disk."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Findings" meta={`${ordered.length} of ${findings.length}`} />

        <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-2.5 light:border-ink-100">
          <Segmented>
            <SegmentedOption active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
              All
            </SegmentedOption>
            {types.map(([type, count]) => (
              <SegmentedOption
                key={type}
                active={typeFilter === type}
                onClick={() => setTypeFilter(type)}
              >
                {humanizeSlug(type)} {count}
              </SegmentedOption>
            ))}
          </Segmented>

          <div className="ml-auto flex items-center gap-3">
            {SEVERITY_ORDER.map((severity) => {
              const count = findings.filter((f) => f.severity === severity).length;
              if (count === 0) return null;
              return (
                <span key={severity} className="inline-flex items-center gap-1.5">
                  <span className={clsx('h-2 w-0.5', severityBg(severity))} aria-hidden />
                  <span className="font-mono text-xs text-ink-200 light:text-ink-800">{count}</span>
                  <span className="text-xs text-ink-400">{severity}</span>
                </span>
              );
            })}
          </div>
        </div>

        <ul className="divide-y divide-ink-850 light:divide-ink-50">
          {ordered.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </ul>
      </Panel>
    </div>
  );
};

export default Findings;
