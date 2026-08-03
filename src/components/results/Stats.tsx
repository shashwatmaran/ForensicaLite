import React, { useMemo } from 'react';
import { Statistics } from '../../types';
import { formatFileSize, formatNumber, humanizeSlug } from '../../utils/formatters';
import { Panel, PanelHeader } from '../ui/primitives';

/**
 * Distribution panels.
 *
 * Rendered as labelled bars rather than a doughnut chart: a reader wants to
 * compare categories and read exact counts, and a horizontal bar with the
 * number printed beside it does both. Pie slices do neither well.
 */

const BarRow: React.FC<{
  label: string;
  count: number;
  total: number;
  note?: string;
  accent?: boolean;
}> = ({ label, count, total, note, accent = false }) => {
  const share = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="grid grid-cols-[9rem_1fr_4rem] items-center gap-3 px-4 py-1.5">
      <span className="truncate text-xs text-ink-200 light:text-ink-800" title={label}>
        {label}
      </span>
      <span
        className="h-1.5 overflow-hidden rounded-sm bg-ink-850 light:bg-ink-50"
        role="presentation"
      >
        <span
          className={
            accent
              ? 'block h-full bg-accent-500 light:bg-accent-600'
              : 'block h-full bg-ink-600 light:bg-ink-300'
          }
          style={{ width: `${Math.max(share, count > 0 ? 1.5 : 0)}%` }}
        />
      </span>
      <span className="text-right font-mono text-xs text-ink-300 light:text-ink-600">
        {formatNumber(count)}
      </span>
      {note && <span className="col-span-3 -mt-0.5 text-2xs text-ink-500">{note}</span>}
    </div>
  );
};

const Stats: React.FC<{ statistics: Statistics }> = ({ statistics }) => {
  const fileTypes = useMemo(
    () =>
      Object.entries(statistics.fileTypes)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]),
    [statistics.fileTypes]
  );

  const typeTotal = fileTypes.reduce((sum, [, count]) => sum + count, 0);
  const sizeTotal = statistics.sizeBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

  const counts = statistics.fileCounts;

  const countRows: { label: string; value: number; note?: string }[] = [
    { label: 'Total records', value: counts.total },
    { label: 'Active', value: counts.active },
    { label: 'Deleted', value: counts.deleted },
    { label: 'Directories', value: counts.directories },
    { label: 'With hidden streams', value: counts.withAlternateStreams },
    { label: 'Timestomped', value: counts.timestomped },
    { label: 'Orphaned', value: counts.orphaned },
  ];

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Record counts" meta={formatNumber(counts.total)} />
        <dl className="grid gap-x-8 gap-y-0 px-0 py-2 sm:grid-cols-2">
          {countRows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 px-4 py-1.5"
            >
              <dt className="text-xs text-ink-300 light:text-ink-600">{row.label}</dt>
              <dd className="font-mono text-xs text-ink-50 light:text-ink-900">
                {formatNumber(row.value)}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="File types" meta={`${fileTypes.length} categories`} />
          <div className="py-2">
            {fileTypes.length === 0 ? (
              <p className="px-4 py-3 text-xs text-ink-500">No categorised records.</p>
            ) : (
              fileTypes.map(([category, count]) => (
                <BarRow
                  key={category}
                  label={humanizeSlug(category)}
                  count={count}
                  total={typeTotal}
                />
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Size distribution" meta={formatNumber(sizeTotal)} />
          <div className="py-2">
            {statistics.sizeBuckets.map((bucket, index) => (
              <BarRow
                key={bucket.label}
                label={bucket.label}
                count={bucket.count}
                total={sizeTotal}
                accent={index === 0}
              />
            ))}
          </div>
          <p className="border-t border-ink-800 px-4 py-2.5 text-2xs leading-relaxed text-ink-500 light:border-ink-100">
            The smallest bucket is the forensically interesting one. Files under roughly{' '}
            {formatFileSize(700)} are stored <em className="not-italic text-ink-300">resident</em> —
            their bytes live inside the MFT record rather than in disk clusters, so deletion leaves
            them intact and fully recoverable.
          </p>
        </Panel>
      </div>
    </div>
  );
};

export default Stats;
