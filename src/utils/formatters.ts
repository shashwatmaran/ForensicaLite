import { RecoveryConfidence, Severity } from '../types';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 bytes';

  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const formatNumber = (num: number): string => new Intl.NumberFormat().format(num);

/**
 * Timestamps are rendered in UTC, always, with the zone stated explicitly.
 * Local-time rendering is a genuine hazard in forensic work: a reader in a
 * different zone than the examiner will silently draw wrong conclusions about
 * event ordering across a case.
 */
export const formatUtc = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'invalid timestamp';

  const pad = (n: number, width = 2) => String(n).padStart(width, '0');

  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}` +
    `.${pad(date.getUTCMilliseconds(), 3)} UTC`
  );
};

/** Date only, UTC — for grouping and axis labels. */
export const formatUtcDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'invalid date';
  return date.toISOString().slice(0, 10);
};

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
};

/** Most severe first — the order findings should always be presented in. */
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

// Colour is reserved for severity, so these are the only coloured classes in
// the interface. The `sev-*` tokens live in tailwind.config.js.
const SEV_TEXT: Record<Severity, string> = {
  critical: 'text-sev-critical',
  high: 'text-sev-high',
  medium: 'text-sev-medium',
  low: 'text-sev-low',
  info: 'text-sev-info',
};

const SEV_BG: Record<Severity, string> = {
  critical: 'bg-sev-critical',
  high: 'bg-sev-high',
  medium: 'bg-sev-medium',
  low: 'bg-sev-low',
  info: 'bg-sev-info',
};

export const severityText = (severity: Severity) => SEV_TEXT[severity] ?? SEV_TEXT.info;
export const severityBg = (severity: Severity) => SEV_BG[severity] ?? SEV_BG.info;

const RECOVERY_LABELS: Record<RecoveryConfidence, string> = {
  full: 'Fully recoverable',
  partial: 'Partially recoverable',
  'metadata-only': 'Metadata only',
};

export const formatRecoveryConfidence = (confidence: RecoveryConfidence): string =>
  RECOVERY_LABELS[confidence] ?? confidence;

const RECOVERY_STYLES: Record<RecoveryConfidence, string> = {
  full: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/30',
  partial: 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/30',
  'metadata-only': 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
};

export const getRecoveryStyle = (confidence: RecoveryConfidence): string =>
  RECOVERY_STYLES[confidence] ?? RECOVERY_STYLES['metadata-only'];

/** "timestomp" -> "Timestomp", "alternate-data-stream" -> "Alternate data stream" */
/** Filesystem acronyms stay capitalised: "MFT modified", not "Mft modified". */
const ACRONYMS = new Set(['mft', 'usn', 'ads', 'si', 'fn']);

export const humanizeSlug = (slug: string): string => {
  const words = slug
    .split('-')
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word));
  const spaced = words.join(' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
