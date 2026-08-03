/**
 * ForensicaLite case file schema.
 *
 * This is the contract between the native analyzer (checkup.exe) and this web
 * app. Both sides build against it; nothing normalizes or guesses. If the
 * analyzer changes its output shape, SCHEMA_VERSION is bumped and the loader
 * rejects the file with a clear message rather than silently mis-rendering it.
 *
 * Conventions:
 *  - All timestamps are ISO 8601 strings in UTC, with millisecond precision.
 *    NTFS stores 100-nanosecond FILETIME values; the analyzer preserves the
 *    raw value alongside the ISO string wherever sub-second precision is
 *    forensically relevant (see NtfsTimestamp).
 *  - All sizes are in bytes. All cluster/sector counts are absolute.
 *  - `null` means "not available / not parsed", never "zero".
 */

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface CaseFile {
  schemaVersion: number;
  generator: Generator;
  volume: VolumeInfo;
  scan: ScanInfo;
  statistics: Statistics;
  findings: Finding[];
  files: Collection<MftFile>;
  timeline: Collection<TimelineEntry>;
}

/**
 * A bounded slice of a potentially enormous data set.
 *
 * A real NTFS volume has hundreds of thousands to millions of MFT records.
 * The analyzer deliberately does not emit all of them by default; it emits a
 * triaged subset and reports honestly how much was left out, so the UI can
 * say "showing 4,812 of 812,455 records" instead of implying completeness.
 */
export interface Collection<T> {
  /** True when `entries` is a subset of what the analyzer actually parsed. */
  truncated: boolean;
  includedCount: number;
  totalCount: number;
  /** Human-readable description of why these entries and not others. */
  inclusionPolicy: string;
  entries: T[];
}

export interface Generator {
  /** Tool name, e.g. "checkup". */
  tool: string;
  /** Analyzer version, semver. */
  version: string;
  /** When this build of the analyzer was produced. */
  builtAt: string | null;
}

// ---------------------------------------------------------------------------
// Volume geometry (parsed from $Boot / the NTFS boot sector)
// ---------------------------------------------------------------------------

export interface VolumeInfo {
  label: string | null;
  /** e.g. "E:" — null when the analyzer worked from a raw image. */
  driveLetter: string | null;
  /** NTFS volume serial number, lowercase hex. */
  serialNumber: string | null;
  fileSystem: 'NTFS';
  bytesPerSector: number;
  sectorsPerCluster: number;
  bytesPerCluster: number;
  totalClusters: number;
  totalBytes: number;
  /** Logical cluster number where $MFT begins. */
  mftStartCluster: number;
  /** Almost always 1024. */
  mftRecordSize: number;
  /** Total record slots in $MFT, allocated or not. */
  mftRecordsTotal: number;
  /**
   * Volume creation time, taken from the $VOLUME_INFORMATION attribute's
   * containing record. Used to flag files claiming to predate their own disk.
   */
  createdAt: string | null;
}

// ---------------------------------------------------------------------------
// Scan provenance
// ---------------------------------------------------------------------------

export interface ScanInfo {
  caseId: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  /** Machine the analyzer ran on. */
  hostname: string | null;
  /** Account the analyzer ran as, e.g. "DESKTOP-1\\anide". */
  operator: string | null;
  mftRecordsParsed: number;
  mftRecordsInUse: number;
  /** Records whose in-use flag is clear but which still hold a parseable file. */
  mftRecordsDeleted: number;
  /** Deleted records for which at least some content was recovered. */
  filesRecovered: number;
  /**
   * Non-fatal parse failures. A forensic tool reports what it could not read
   * rather than silently dropping it — absence of evidence is itself evidence.
   */
  errors: ScanError[];
}

export interface ScanError {
  /** Pipeline stage: "boot", "mft", "attribute", "usn", "hash". */
  stage: string;
  recordNumber: number | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/**
 * A single NTFS timestamp, keeping the raw FILETIME so that sub-second
 * precision survives. Many timestomping tools write whole-second values,
 * leaving the 100ns remainder at zero — a detectable artifact that is lost
 * if you only keep the ISO string.
 */
export interface NtfsTimestamp {
  iso: string;
  /** Raw 64-bit FILETIME (100ns intervals since 1601-01-01), as a string to
   *  survive JSON's 53-bit integer limit. */
  filetime: string;
}

/**
 * The MACB set carried by both $STANDARD_INFORMATION and $FILE_NAME.
 *
 *  modified    (M) — content last written
 *  accessed    (A) — last read; often disabled on modern Windows
 *  mftModified (C) — MFT record itself last changed
 *  created     (B) — "born"
 */
export interface NtfsTimestamps {
  created: NtfsTimestamp;
  modified: NtfsTimestamp;
  mftModified: NtfsTimestamp;
  accessed: NtfsTimestamp;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type FileStatus = 'active' | 'deleted';

/**
 * Where a stream's bytes live.
 *  resident     — inside the MFT record itself (small files, < ~700 bytes)
 *  non-resident — in clusters elsewhere on the volume, described by data runs
 */
export type Residency = 'resident' | 'non-resident';

export interface MftFile {
  /** MFT entry index — the stable identity of a file at the filesystem level. */
  recordNumber: number;
  /** Bumped each time the record is reused; detects stale references. */
  sequenceNumber: number;
  /** MFT record of the containing directory, from $FILE_NAME. */
  parentRecordNumber: number | null;
  fileName: string;
  /**
   * Full path reconstructed by walking parentRecordNumber up to the root.
   * Null when the chain breaks — see the 'orphaned-file' finding.
   */
  filePath: string | null;
  isDirectory: boolean;
  /** Logical size of the default $DATA stream. */
  size: number;
  /** Size actually allocated on disk (cluster-rounded). */
  allocatedSize: number;
  /** MFT record header in-use flag. False means the record was deleted. */
  isAllocated: boolean;
  status: FileStatus;
  /** DOS attribute flags, e.g. ["HIDDEN", "SYSTEM", "ARCHIVE"]. */
  attributes: string[];
  /** $STANDARD_INFORMATION (attribute type 0x10) — user-settable. */
  standardInfo: NtfsTimestamps;
  /**
   * $FILE_NAME (attribute type 0x30) — kernel-maintained, only updated on
   * create/rename/move. Divergence from standardInfo is the timestomp tell.
   * Null when the attribute is missing or unparseable.
   */
  fileNameInfo: NtfsTimestamps | null;
  /** Every $DATA stream on the record. The unnamed default stream has name "". */
  streams: DataStream[];
  recovery: RecoveryInfo | null;
  /** Ids of findings referencing this record. */
  findingIds: string[];
}

export interface DataStream {
  /** "" for the default stream; anything else is an Alternate Data Stream. */
  name: string;
  size: number;
  residency: Residency;
  hash: ArtifactHash | null;
}

export interface ArtifactHash {
  algorithm: 'sha256';
  value: string;
  /**
   * What was actually hashed. You can only hash bytes you could read, and
   * conflating "hash of the file" with "hash of its MFT record" would be a
   * misrepresentation.
   */
  scope: 'stream-content' | 'mft-record';
}

/**
 * How much of a deleted file can be brought back.
 *
 *  full          — the stream was resident, so its bytes are still intact
 *                  inside the MFT record. Byte-for-byte recovery.
 *  partial       — non-resident with data runs still readable, but the
 *                  clusters may since have been reallocated to another file.
 *  metadata-only — runs unavailable or demonstrably overwritten; the record
 *                  proves the file existed but the content is gone.
 */
export type RecoveryConfidence = 'full' | 'partial' | 'metadata-only';

export interface RecoveryInfo {
  confidence: RecoveryConfidence;
  /** Plain-English justification, surfaced directly in the UI. */
  reason: string;
  /** Bytes recovered inline from the MFT record, base64. Null if non-resident. */
  residentContentBase64: string | null;
  /** Cluster ranges holding the content, for non-resident streams. */
  dataRuns: DataRun[];
  /** True when at least one run is now claimed by an allocated file. */
  clustersReallocated: boolean | null;
}

export interface DataRun {
  startCluster: number;
  clusterCount: number;
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingType =
  /** $SI and $FN timestamps disagree, or precision artifacts suggest forgery. */
  | 'timestomp'
  /** A named $DATA stream — data hidden alongside a normal-looking file. */
  | 'alternate-data-stream'
  /** Unallocated MFT record with recoverable content. */
  | 'deleted-recoverable'
  /** Parent chain broken; the file exists but its location does not. */
  | 'orphaned-file'
  /** Timestamp predates the volume, or lies in the future. */
  | 'impossible-timestamp'
  /** HIDDEN + SYSTEM on a user-area file. */
  | 'hidden-system-file';

export type Confidence = 'high' | 'medium' | 'low';

export interface Finding {
  /** Stable within a case file; referenced by MftFile.findingIds. */
  id: string;
  type: FindingType;
  severity: Severity;
  title: string;
  description: string;
  recordNumber: number | null;
  filePath: string | null;
  /**
   * Identifier of the specific heuristic that fired, e.g.
   * "si-fn-created-mismatch" or "si-subsecond-zeroed". Naming the detector
   * makes a finding auditable instead of an opaque verdict.
   */
  detectedBy: string;
  confidence: Confidence;
  /** The raw values the conclusion rests on. Every claim shows its work. */
  evidence: Evidence[];
}

export interface Evidence {
  label: string;
  value: string;
  /** Optional explanation of why this value matters. */
  note: string | null;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/** Which artifact contributed the entry — provenance for every timeline row. */
export type TimelineSource = 'mft-si' | 'mft-fn' | 'usn-journal';

export type TimelineAction =
  | 'created'
  | 'modified'
  | 'accessed'
  | 'mft-modified'
  | 'deleted'
  | 'renamed'
  | 'moved';

export interface TimelineEntry {
  timestamp: string;
  source: TimelineSource;
  action: TimelineAction;
  recordNumber: number | null;
  filePath: string | null;
  detail: string | null;
  findingIds: string[];
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface Statistics {
  fileCounts: FileCounts;
  /** Extension category -> count. Open-ended so the analyzer can add buckets. */
  fileTypes: Record<string, number>;
  sizeBuckets: SizeBucket[];
  /** Pre-aggregated per-day counts, so the chart never walks the full timeline. */
  histogram: HistogramBucket[];
  findingsBySeverity: Record<Severity, number>;
  findingsByType: Record<string, number>;
}

export interface FileCounts {
  total: number;
  active: number;
  deleted: number;
  directories: number;
  withAlternateStreams: number;
  timestomped: number;
  orphaned: number;
}

export interface SizeBucket {
  label: string;
  /** Inclusive lower bound in bytes. */
  minBytes: number;
  /** Exclusive upper bound; null for the open-ended top bucket. */
  maxBytes: number | null;
  count: number;
}

export interface HistogramBucket {
  /** YYYY-MM-DD, UTC. */
  date: string;
  created: number;
  modified: number;
  accessed: number;
  deleted: number;
}
