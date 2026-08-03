import React from 'react';
import clsx from 'clsx';
import { CaseFile } from '../../types';
import { formatDuration, formatFileSize, formatNumber, formatUtc } from '../../utils/formatters';
import { Field, Panel, PanelHeader, severityText } from '../ui/primitives';

/**
 * The case at a glance.
 *
 * Leads with $Boot geometry rather than a feature summary: the cluster size,
 * $MFT offset and record size are the numbers every later figure is derived
 * from, and showing them is how a reader checks the tool read the volume
 * correctly in the first place.
 */

const Metric: React.FC<{
  label: string;
  value: string;
  tone?: string;
  note?: string;
}> = ({ label, value, tone, note }) => (
  <div className="px-4 py-3 first:pl-0">
    <p className="field-label">{label}</p>
    <p
      className={clsx(
        'mt-1 font-mono text-xl leading-none',
        tone ?? 'text-ink-50 light:text-ink-900'
      )}
    >
      {value}
    </p>
    {note && <p className="mt-1.5 text-2xs text-ink-500">{note}</p>}
  </div>
);

const Overview: React.FC<{ data: CaseFile }> = ({ data }) => {
  const { volume, scan, statistics, findings, generator } = data;

  const critical = statistics.findingsBySeverity.critical ?? 0;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap divide-x divide-ink-800 px-4 light:divide-ink-100">
          <Metric
            label="MFT records"
            value={formatNumber(statistics.fileCounts.total)}
            note={`${formatNumber(scan.mftRecordsParsed)} parsed of ${formatNumber(volume.mftRecordsTotal)} slots`}
          />
          <Metric
            label="Deleted"
            value={formatNumber(statistics.fileCounts.deleted)}
            note={`${formatNumber(scan.filesRecovered)} recoverable`}
          />
          <Metric
            label="Timestomped"
            value={formatNumber(statistics.fileCounts.timestomped)}
            tone={statistics.fileCounts.timestomped > 0 ? severityText('critical') : undefined}
            note="records with altered $SI"
          />
          <Metric
            label="Hidden streams"
            value={formatNumber(statistics.fileCounts.withAlternateStreams)}
            note="records carrying ADS"
          />
          <Metric
            label="Findings"
            value={formatNumber(findings.length)}
            tone={critical > 0 ? severityText('critical') : undefined}
            note={critical > 0 ? `${critical} critical` : 'none critical'}
          />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Volume" meta="$Boot" />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 px-4 py-3.5 sm:grid-cols-3">
            <Field label="Label">{volume.label ?? '—'}</Field>
            <Field label="Mount" mono>
              {volume.driveLetter ?? 'image'}
            </Field>
            <Field label="File system">{volume.fileSystem}</Field>
            <Field label="Serial" mono>
              {volume.serialNumber ?? '—'}
            </Field>
            <Field label="Capacity" mono>
              {formatFileSize(volume.totalBytes)}
            </Field>
            <Field label="Clusters" mono>
              {formatNumber(volume.totalClusters)}
            </Field>
            <Field label="Bytes / sector" mono>
              {formatNumber(volume.bytesPerSector)}
            </Field>
            <Field label="Sectors / cluster" mono>
              {formatNumber(volume.sectorsPerCluster)}
            </Field>
            <Field label="Bytes / cluster" mono>
              {formatNumber(volume.bytesPerCluster)}
            </Field>
            <Field label="$MFT cluster" mono>
              {formatNumber(volume.mftStartCluster)}
            </Field>
            <Field label="Record size" mono>
              {volume.mftRecordSize} B
            </Field>
            <Field label="Volume created" mono>
              {volume.createdAt ? formatUtc(volume.createdAt) : '—'}
            </Field>
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="Acquisition" meta={`${generator.tool} ${generator.version}`} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 px-4 py-3.5 sm:grid-cols-3">
            <Field label="Case" mono>
              {scan.caseId}
            </Field>
            <Field label="Host">{scan.hostname ?? '—'}</Field>
            <Field label="Operator" mono>
              {scan.operator ?? '—'}
            </Field>
            <Field label="Started" mono>
              {formatUtc(scan.startedAt)}
            </Field>
            <Field label="Completed" mono>
              {formatUtc(scan.completedAt)}
            </Field>
            <Field label="Duration" mono>
              {formatDuration(scan.durationSeconds)}
            </Field>
            <Field label="Records in use" mono>
              {formatNumber(scan.mftRecordsInUse)}
            </Field>
            <Field label="Records deleted" mono>
              {formatNumber(scan.mftRecordsDeleted)}
            </Field>
            <Field label="Schema" mono>
              v{data.schemaVersion}
            </Field>
          </dl>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Parse errors"
          meta={scan.errors.length === 0 ? 'none' : formatNumber(scan.errors.length)}
        />
        {scan.errors.length === 0 ? (
          <p className="px-4 py-3.5 text-xs text-ink-400 light:text-ink-500">
            Every record parsed without error. A forensic tool that cannot read something should say
            so — absence of evidence is itself evidence — so this panel is always present.
          </p>
        ) : (
          <ul className="divide-y divide-ink-800 light:divide-ink-100">
            {scan.errors.map((error, index) => (
              <li key={index} className="flex gap-3 px-4 py-2">
                <span className="shrink-0 font-mono text-2xs text-sev-high">
                  {error.stage}
                  {error.recordNumber !== null && `#${error.recordNumber}`}
                </span>
                <span className="min-w-0-fix flex-1 text-xs text-ink-300 light:text-ink-600">
                  {error.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};

export default Overview;
