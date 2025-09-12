import { ForensicCase, ForensicFile, Statistics, SuspiciousFinding, TimelineEvent } from '../types';

const ensureString = (value: any, fallback: string = ''): string =>
  typeof value === 'string' ? value : fallback;

const ensureNumber = (value: any, fallback: number = 0): number =>
  typeof value === 'number' && isFinite(value) ? value : fallback;

const ensureBoolean = (value: any, fallback: boolean = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const ensureDateString = (value: any, fallbackISO: string): string => {
  const str = ensureString(value, '');
  const date = str ? new Date(str) : null;
  return date && !isNaN(date.getTime()) ? date.toISOString() : fallbackISO;
};

const coerceStatus = (status: any, deletedAt: string | null): 'active' | 'deleted' => {
  const s = ensureString(status).toLowerCase();
  if (s === 'active' || s === 'deleted') return s;
  return deletedAt ? 'deleted' : 'active';
};

const coerceSeverity = (severity: any): 'low' | 'medium' | 'high' => {
  const s = ensureString(severity).toLowerCase();
  return s === 'high' || s === 'medium' || s === 'low' ? (s as any) : 'low';
};

const coerceEvent = (event: any): TimelineEvent['event'] => {
  const e = ensureString(event).toLowerCase();
  if (e === 'file_created' || e === 'file_deleted' || e === 'file_modified') return e as any;
  return 'file_created';
};

export const normalizeForensicCase = (input: any): ForensicCase => {
  const nowISO = new Date().toISOString();

  const summary = input && typeof input === 'object' ? input.summary || {} : {};
  const normalizedSummary: ForensicCase['summary'] = {
    diskName: ensureString(summary.diskName, 'Unknown Disk'),
    totalFiles: ensureNumber(summary.totalFiles, 0),
    deletedFiles: ensureNumber(summary.deletedFiles, 0),
    anomaliesFound: ensureNumber(summary.anomaliesFound, 0),
    scanTimestamp: ensureDateString(summary.scanTimestamp, nowISO),
  };

  const defaultTime = normalizedSummary.scanTimestamp;

  const files: ForensicFile[] = Array.isArray(input?.files)
    ? input.files.map((f: any): ForensicFile => {
        const createdAt = ensureDateString(f?.createdAt, defaultTime);
        const modifiedAt = ensureDateString(f?.modifiedAt, createdAt);
        const deletedAtRaw = ensureString(f?.deletedAt, '');
        const deletedAt = deletedAtRaw ? ensureDateString(deletedAtRaw, defaultTime) : null;
        return {
          fileName: ensureString(f?.fileName, 'unknown'),
          filePath: ensureString(f?.filePath, ''),
          fileSize: ensureNumber(f?.fileSize, 0),
          hash: ensureString(f?.hash, ''),
          createdAt,
          modifiedAt,
          deletedAt,
          status: coerceStatus(f?.status, deletedAt),
        };
      })
    : [];

  const timeline: TimelineEvent[] = Array.isArray(input?.timeline)
    ? input.timeline.map((t: any): TimelineEvent => ({
        event: coerceEvent(t?.event),
        fileName: ensureString(t?.fileName, 'unknown'),
        timestamp: ensureDateString(t?.timestamp, defaultTime),
      }))
    : [];

  const statistics: Statistics = {
    fileTypes: {
      documents: ensureNumber(input?.statistics?.fileTypes?.documents, 0),
      images: ensureNumber(input?.statistics?.fileTypes?.images, 0),
      videos: ensureNumber(input?.statistics?.fileTypes?.videos, 0),
      executables: ensureNumber(input?.statistics?.fileTypes?.executables, 0),
      others: ensureNumber(input?.statistics?.fileTypes?.others, 0),
    },
    fileSizes: {
      small: ensureNumber(input?.statistics?.fileSizes?.small, 0),
      medium: ensureNumber(input?.statistics?.fileSizes?.medium, 0),
      large: ensureNumber(input?.statistics?.fileSizes?.large, 0),
    },
  };

  const suspiciousFindings: SuspiciousFinding[] = Array.isArray(input?.suspiciousFindings)
    ? input.suspiciousFindings.map((s: any): SuspiciousFinding => ({
        fileName: ensureString(s?.fileName, 'unknown'),
        reason: ensureString(s?.reason, ''),
        severity: coerceSeverity(s?.severity),
      }))
    : [];

  const caseId = ensureString(input?.caseId, 'unknown-case');

  return {
    caseId,
    summary: normalizedSummary,
    files,
    timeline,
    statistics,
    suspiciousFindings,
  };
};

export const safeNormalizeForensicCase = (jsonString: string): { data?: ForensicCase; error?: string } => {
  try {
    const parsed = JSON.parse(jsonString);
    const data = normalizeForensicCase(parsed);
    return { data };
  } catch (e: any) {
    return { error: 'Failed to parse JSON file.' };
  }
};


