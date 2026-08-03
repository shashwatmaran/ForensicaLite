import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Finding, Severity } from '../../types';
import { SEVERITY_ORDER, humanizeSlug } from '../../utils/formatters';
import {
  EmptyState,
  Mono,
  Panel,
  PanelHeader,
  PathText,
  Segmented,
  SegmentedOption,
  SeverityMark,
  severityBg,
} from '../ui/primitives';

/**
 * Findings, ordered by severity, each expandable to its evidence.
 *
 * A finding is only worth as much as the values it rests on, so the evidence
 * table is the substance and the verdict is the summary. The detector id is
 * always visible: naming the rule that fired makes a conclusion auditable
 * rather than something to take on trust.
 */

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
              className="w-44 py-1.5 pl-11 pr-3 align-top text-2xs font-normal text-ink-500"
            >
              {item.label}
            </th>
            <td className="py-1.5 pr-3 align-top font-mono text-xs text-ink-100 light:text-ink-900">
              {item.value}
            </td>
            <td className="py-1.5 pr-4 align-top text-2xs text-ink-500">{item.note ?? ''}</td>
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
        className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-850 light:hover:bg-ink-25"
      >
        <span
          className={clsx('mt-1 h-8 w-0.5 shrink-0', severityBg(finding.severity))}
          aria-hidden
        />

        <span className="min-w-0-fix flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-sm text-ink-50 light:text-ink-900">{finding.title}</span>
            <SeverityMark severity={finding.severity} />
          </span>

          <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="min-w-0-fix max-w-full flex-1 basis-64">
              <PathText path={finding.filePath} className="text-2xs" />
            </span>
            {finding.recordNumber !== null && (
              <Mono className="text-2xs text-ink-500">MFT #{finding.recordNumber}</Mono>
            )}
            <Mono className="text-2xs text-ink-500">{finding.detectedBy}</Mono>
            <span className="text-2xs text-ink-500">{finding.confidence} confidence</span>
          </span>
        </span>

        <span className="mt-0.5 shrink-0 font-mono text-2xs text-ink-600 transition-colors group-hover:text-ink-400">
          {open ? '−' : '+'}
          {finding.evidence.length}
        </span>
      </button>

      {open && (
        <div>
          <p className="px-4 pb-3 pl-11 text-xs leading-relaxed text-ink-300 light:text-ink-600">
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
        <PanelHeader title="Findings" meta={`${ordered.length} of ${findings.length}`}>
          <span />
        </PanelHeader>

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
                  <span className="font-mono text-2xs text-ink-400">{count}</span>
                  <span className="text-2xs text-ink-500">{severity}</span>
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
