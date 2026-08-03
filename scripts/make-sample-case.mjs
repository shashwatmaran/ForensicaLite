/**
 * Generates public/samples/sample-case.json — a schema-v1 case file describing
 * a small NTFS test volume with deliberately planted artifacts.
 *
 * Two jobs:
 *  1. Lets the web app be built and demoed before checkup.exe exists.
 *  2. Serves as the reference output the Python analyzer must reproduce.
 *
 * Run: node scripts/make-sample-case.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../public/samples/sample-case.json');

/** Offset in seconds between the FILETIME epoch (1601-01-01) and Unix epoch. */
const FILETIME_EPOCH_OFFSET = 11644473600n;

/** ISO string -> NtfsTimestamp, preserving 100ns FILETIME precision. */
const ts = (iso, extra100ns = 0n) => {
  const ms = BigInt(new Date(iso).getTime());
  const filetime = (ms / 1000n + FILETIME_EPOCH_OFFSET) * 10000000n + (ms % 1000n) * 10000n + extra100ns;
  return { iso: new Date(iso).toISOString(), filetime: filetime.toString() };
};

/** All four MACB timestamps at once. */
const macb = (created, modified, mftModified, accessed) => ({
  created: ts(created),
  modified: ts(modified),
  mftModified: ts(mftModified),
  accessed: ts(accessed),
});

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');

const VOLUME_CREATED = '2026-07-18T09:14:02.187Z';

// ---------------------------------------------------------------------------
// Planted artifacts
// ---------------------------------------------------------------------------

const files = [
  // 1. Ordinary file, untouched. The control case.
  {
    recordNumber: 41,
    sequenceNumber: 1,
    parentRecordNumber: 38,
    fileName: 'quarterly-report.docx',
    filePath: 'E:\\Docs\\quarterly-report.docx',
    isDirectory: false,
    size: 46129,
    allocatedSize: 49152,
    isAllocated: true,
    status: 'active',
    attributes: ['ARCHIVE'],
    standardInfo: macb(
      '2026-07-19T11:02:44.318Z',
      '2026-07-21T16:48:09.771Z',
      '2026-07-21T16:48:09.771Z',
      '2026-07-21T16:48:09.771Z'
    ),
    fileNameInfo: macb(
      '2026-07-19T11:02:44.318Z',
      '2026-07-19T11:02:44.318Z',
      '2026-07-19T11:02:44.318Z',
      '2026-07-19T11:02:44.318Z'
    ),
    streams: [
      {
        name: '',
        size: 46129,
        residency: 'non-resident',
        hash: {
          algorithm: 'sha256',
          value: '9f2b7c41e8a35d06fbc19d4e7a2851b3c6d90f4e1a7b385c2e94f6017da3c8b5',
          scope: 'stream-content',
        },
      },
    ],
    recovery: null,
    findingIds: [],
  },

  // 2. Timestomped binary: $SI backdated to 2019, $FN still shows the real
  //    creation date. Sub-second field zeroed, the classic tool artifact.
  {
    recordNumber: 57,
    sequenceNumber: 1,
    parentRecordNumber: 52,
    fileName: 'svchost.exe',
    filePath: 'E:\\Tools\\svchost.exe',
    isDirectory: false,
    size: 118784,
    allocatedSize: 122880,
    isAllocated: true,
    status: 'active',
    attributes: ['HIDDEN', 'SYSTEM', 'ARCHIVE'],
    standardInfo: macb(
      '2019-03-12T08:00:00.000Z',
      '2019-03-12T08:00:00.000Z',
      '2026-07-20T14:32:11.442Z',
      '2019-03-12T08:00:00.000Z'
    ),
    fileNameInfo: macb(
      '2026-07-20T14:32:11.442Z',
      '2026-07-20T14:32:11.442Z',
      '2026-07-20T14:32:11.442Z',
      '2026-07-20T14:32:11.442Z'
    ),
    streams: [
      {
        name: '',
        size: 118784,
        residency: 'non-resident',
        hash: {
          algorithm: 'sha256',
          value: '4c1e9a7f3b28d5106e4fa9c37b0d82e51fa6470c9e3b8d15726af04c8b39e1d2',
          scope: 'stream-content',
        },
      },
    ],
    recovery: null,
    findingIds: ['f-001', 'f-002', 'f-007'],
  },

  // 3. Innocuous text file carrying a hidden Alternate Data Stream.
  {
    recordNumber: 63,
    sequenceNumber: 1,
    parentRecordNumber: 38,
    fileName: 'notes.txt',
    filePath: 'E:\\Docs\\notes.txt',
    isDirectory: false,
    size: 184,
    allocatedSize: 0,
    isAllocated: true,
    status: 'active',
    attributes: ['ARCHIVE'],
    standardInfo: macb(
      '2026-07-19T13:20:55.004Z',
      '2026-07-20T14:35:02.881Z',
      '2026-07-20T14:35:02.881Z',
      '2026-07-20T14:35:02.881Z'
    ),
    fileNameInfo: macb(
      '2026-07-19T13:20:55.004Z',
      '2026-07-19T13:20:55.004Z',
      '2026-07-19T13:20:55.004Z',
      '2026-07-19T13:20:55.004Z'
    ),
    streams: [
      {
        name: '',
        size: 184,
        residency: 'resident',
        hash: {
          algorithm: 'sha256',
          value: 'b1d84f0a29c7e5361d8b4a07f92ce5138604ab7d2f91e0c3856b4d7a90f2e1c6',
          scope: 'stream-content',
        },
      },
      {
        name: 'payload',
        size: 2048,
        residency: 'non-resident',
        hash: {
          algorithm: 'sha256',
          value: 'e70c9d21b8a43f5c8e10d69b247a0fc85e3b9128d47a60ce9b35f8a1d02e74c1',
          scope: 'stream-content',
        },
      },
    ],
    recovery: null,
    findingIds: ['f-003'],
  },

  // 4. Deleted resident file — content still intact inside the MFT record.
  //    The strongest recovery case there is.
  {
    recordNumber: 71,
    sequenceNumber: 2,
    parentRecordNumber: 38,
    fileName: 'handover-credentials.txt',
    filePath: 'E:\\Docs\\handover-credentials.txt',
    isDirectory: false,
    size: 412,
    allocatedSize: 0,
    isAllocated: false,
    status: 'deleted',
    attributes: ['ARCHIVE'],
    standardInfo: macb(
      '2026-07-19T09:41:12.663Z',
      '2026-07-20T17:55:41.209Z',
      '2026-07-20T18:02:07.115Z',
      '2026-07-20T17:55:41.209Z'
    ),
    fileNameInfo: macb(
      '2026-07-19T09:41:12.663Z',
      '2026-07-19T09:41:12.663Z',
      '2026-07-19T09:41:12.663Z',
      '2026-07-19T09:41:12.663Z'
    ),
    streams: [{ name: '', size: 412, residency: 'resident', hash: null }],
    recovery: {
      confidence: 'full',
      reason:
        'Stream was resident: all 412 bytes live inside MFT record 71 and were ' +
        'never written to disk clusters, so deletion left the content intact.',
      residentContentBase64: b64(
        [
          '# Handover notes - delete before leaving',
          'jump host: 10.14.22.8',
          'service account: svc_backup',
          'shared vault path: \\\\fileserver\\ops\\vault',
          'rotation due: 2026-08-01',
        ].join('\n')
      ),
      dataRuns: [],
      clustersReallocated: null,
    },
    findingIds: ['f-004'],
  },

  // 5. Deleted non-resident file — runs readable, but partly reclaimed.
  {
    recordNumber: 88,
    sequenceNumber: 1,
    parentRecordNumber: 80,
    fileName: 'screen-capture.mp4',
    filePath: 'E:\\Media\\screen-capture.mp4',
    isDirectory: false,
    size: 12874219,
    allocatedSize: 12877824,
    isAllocated: false,
    status: 'deleted',
    attributes: ['ARCHIVE'],
    standardInfo: macb(
      '2026-07-20T15:10:03.520Z',
      '2026-07-20T15:22:47.905Z',
      '2026-07-20T18:03:19.740Z',
      '2026-07-20T15:22:47.905Z'
    ),
    fileNameInfo: macb(
      '2026-07-20T15:10:03.520Z',
      '2026-07-20T15:10:03.520Z',
      '2026-07-20T15:10:03.520Z',
      '2026-07-20T15:10:03.520Z'
    ),
    streams: [{ name: '', size: 12874219, residency: 'non-resident', hash: null }],
    recovery: {
      confidence: 'partial',
      reason:
        'Data runs survive in the MFT record, but 1 of 3 runs now overlaps ' +
        'clusters allocated to an active file. Expect a truncated or corrupt ' +
        'result on carve.',
      residentContentBase64: null,
      dataRuns: [
        { startCluster: 191244, clusterCount: 1536 },
        { startCluster: 194800, clusterCount: 1024 },
        { startCluster: 201472, clusterCount: 584 },
      ],
      clustersReallocated: true,
    },
    findingIds: ['f-005'],
  },

  // 6. Orphaned record: the file survives but its parent directory does not,
  //    so no path can be reconstructed.
  {
    recordNumber: 94,
    sequenceNumber: 3,
    parentRecordNumber: 91,
    fileName: 'stage2.ps1',
    filePath: null,
    isDirectory: false,
    size: 3902,
    allocatedSize: 4096,
    isAllocated: false,
    status: 'deleted',
    attributes: ['ARCHIVE'],
    standardInfo: macb(
      '2026-07-20T14:28:50.132Z',
      '2026-07-20T14:29:16.408Z',
      '2026-07-20T18:04:55.021Z',
      '2026-07-20T14:29:16.408Z'
    ),
    fileNameInfo: macb(
      '2026-07-20T14:28:50.132Z',
      '2026-07-20T14:28:50.132Z',
      '2026-07-20T14:28:50.132Z',
      '2026-07-20T14:28:50.132Z'
    ),
    streams: [{ name: '', size: 3902, residency: 'non-resident', hash: null }],
    recovery: {
      confidence: 'metadata-only',
      reason:
        'Parent record 91 has been reused, so the path cannot be rebuilt, and ' +
        'the single data run falls inside a region reallocated after deletion.',
      residentContentBase64: null,
      dataRuns: [{ startCluster: 208128, clusterCount: 1 }],
      clustersReallocated: true,
    },
    findingIds: ['f-006'],
  },

  // 7. Timestamp predating the volume itself — impossible without tampering.
  {
    recordNumber: 102,
    sequenceNumber: 1,
    parentRecordNumber: 52,
    fileName: 'install.log',
    filePath: 'E:\\Tools\\install.log',
    isDirectory: false,
    size: 7715,
    allocatedSize: 8192,
    isAllocated: true,
    status: 'active',
    attributes: ['ARCHIVE'],
    standardInfo: macb(
      '1998-11-04T02:15:00.000Z',
      '1998-11-04T02:15:00.000Z',
      '2026-07-20T14:33:48.900Z',
      '1998-11-04T02:15:00.000Z'
    ),
    fileNameInfo: macb(
      '2026-07-20T14:33:48.900Z',
      '2026-07-20T14:33:48.900Z',
      '2026-07-20T14:33:48.900Z',
      '2026-07-20T14:33:48.900Z'
    ),
    streams: [
      {
        name: '',
        size: 7715,
        residency: 'non-resident',
        hash: {
          algorithm: 'sha256',
          value: '2a8f5c9017be34d2618af09c5b7e2d4a3016fc8b95e2740da1cb6f38059e4b17',
          scope: 'stream-content',
        },
      },
    ],
    recovery: null,
    findingIds: ['f-008'],
  },
];

// ---------------------------------------------------------------------------
// Findings — every claim carries the raw values it rests on
// ---------------------------------------------------------------------------

const findings = [
  {
    id: 'f-001',
    type: 'timestomp',
    severity: 'critical',
    title: '$SI creation time predates $FN creation time',
    description:
      'The $STANDARD_INFORMATION creation timestamp is over seven years earlier ' +
      'than the $FILE_NAME creation timestamp. $SI is writable from user mode ' +
      'via SetFileTime; $FN is only written by the kernel on create, rename or ' +
      'move. This ordering cannot occur through normal filesystem activity.',
    recordNumber: 57,
    filePath: 'E:\\Tools\\svchost.exe',
    detectedBy: 'si-fn-created-mismatch',
    confidence: 'high',
    evidence: [
      { label: '$SI Created', value: '2019-03-12T08:00:00.000Z', note: 'user-settable' },
      { label: '$FN Created', value: '2026-07-20T14:32:11.442Z', note: 'kernel-maintained' },
      { label: 'Delta', value: '2687 days earlier', note: null },
      {
        label: '$SI MFT-Modified',
        value: '2026-07-20T14:32:11.442Z',
        note: 'matches $FN — the record was touched at the real creation time',
      },
    ],
  },
  {
    id: 'f-002',
    type: 'timestomp',
    severity: 'high',
    title: 'Sub-second precision zeroed on all $SI timestamps',
    description:
      'All four $SI timestamps land on an exact whole second. NTFS records time ' +
      'in 100-nanosecond intervals, so genuine filesystem activity almost never ' +
      'produces a zero remainder. Many timestomping utilities accept only ' +
      'second-granularity input and leave this artifact behind.',
    recordNumber: 57,
    filePath: 'E:\\Tools\\svchost.exe',
    detectedBy: 'si-subsecond-zeroed',
    confidence: 'medium',
    evidence: [
      { label: '$SI Created FILETIME', value: '131968512000000000', note: 'remainder 0' },
      {
        label: '$FN Created FILETIME',
        value: '134290315314420000',
        note: 'remainder 4420000 — normal',
      },
      { label: 'Fields affected', value: 'created, modified, accessed', note: null },
    ],
  },
  {
    id: 'f-003',
    type: 'alternate-data-stream',
    severity: 'high',
    title: 'Named data stream hidden on a text file',
    description:
      'Record 63 carries a second $DATA attribute named "payload", eleven times ' +
      'larger than the visible file. Alternate Data Streams do not appear in ' +
      'Explorer, in dir output, or in the reported file size.',
    recordNumber: 63,
    filePath: 'E:\\Docs\\notes.txt',
    detectedBy: 'named-data-stream-present',
    confidence: 'high',
    evidence: [
      { label: 'Visible stream', value: '184 bytes (resident)', note: null },
      { label: 'Hidden stream', value: 'notes.txt:payload — 2048 bytes', note: 'non-resident' },
      {
        label: 'Stream modified',
        value: '2026-07-20T14:35:02.881Z',
        note: 'three minutes after svchost.exe was planted',
      },
    ],
  },
  {
    id: 'f-004',
    type: 'deleted-recoverable',
    severity: 'high',
    title: 'Deleted credentials file fully recoverable from MFT record',
    description:
      'The file was small enough to be stored resident — its bytes lived inside ' +
      'MFT record 71 rather than in disk clusters. Deletion only cleared the ' +
      'record\'s in-use flag, so the content is recoverable byte-for-byte.',
    recordNumber: 71,
    filePath: 'E:\\Docs\\handover-credentials.txt',
    detectedBy: 'deleted-resident-content',
    confidence: 'high',
    evidence: [
      { label: 'Residency', value: 'resident (412 bytes)', note: 'below the ~700 byte threshold' },
      { label: 'Record in-use flag', value: 'clear', note: 'deleted' },
      { label: 'Recovered', value: '412 of 412 bytes', note: 'complete' },
      {
        label: 'Deleted at',
        value: '2026-07-20T18:02:07.115Z',
        note: '$SI MFT-modified time, 6 minutes after last write',
      },
    ],
  },
  {
    id: 'f-005',
    type: 'deleted-recoverable',
    severity: 'medium',
    title: 'Deleted screen capture partially recoverable',
    description:
      'Data runs are intact in the MFT record, but one of three runs overlaps ' +
      'clusters since reallocated to an active file. A carve will produce a ' +
      'partial or corrupt file.',
    recordNumber: 88,
    filePath: 'E:\\Media\\screen-capture.mp4',
    detectedBy: 'deleted-nonresident-runs',
    confidence: 'medium',
    evidence: [
      { label: 'Size', value: '12,874,219 bytes', note: null },
      { label: 'Data runs', value: '3 runs, 3144 clusters', note: null },
      { label: 'Reallocated', value: '1 of 3 runs', note: 'clusters 201472-202055' },
    ],
  },
  {
    id: 'f-006',
    type: 'orphaned-file',
    severity: 'medium',
    title: 'Deleted PowerShell script with unresolvable parent',
    description:
      'Record 94 names parent record 91, but that record has been reused by a ' +
      'different file with a mismatched sequence number, so no path can be ' +
      'reconstructed. The script existed; where it lived is no longer provable.',
    recordNumber: 94,
    filePath: null,
    detectedBy: 'parent-sequence-mismatch',
    confidence: 'high',
    evidence: [
      { label: 'File name', value: 'stage2.ps1', note: 'from $FILE_NAME' },
      { label: 'Parent record', value: '91', note: 'sequence number does not match' },
      { label: 'Path', value: 'unresolvable', note: null },
      { label: 'Created', value: '2026-07-20T14:28:50.132Z', note: '3 minutes before svchost.exe' },
    ],
  },
  {
    id: 'f-007',
    type: 'hidden-system-file',
    severity: 'medium',
    title: 'HIDDEN+SYSTEM attributes on a non-system-path executable',
    description:
      'The record carries both HIDDEN and SYSTEM attributes while living outside ' +
      'any Windows system directory. This combination hides a file from default ' +
      'Explorer views and from ordinary dir listings.',
    recordNumber: 57,
    filePath: 'E:\\Tools\\svchost.exe',
    detectedBy: 'hidden-system-outside-system-path',
    confidence: 'medium',
    evidence: [
      { label: 'Attributes', value: 'HIDDEN, SYSTEM, ARCHIVE', note: null },
      { label: 'Path', value: 'E:\\Tools\\', note: 'not a system directory' },
      { label: 'File name', value: 'svchost.exe', note: 'matches a legitimate Windows binary name' },
    ],
  },
  {
    id: 'f-008',
    type: 'impossible-timestamp',
    severity: 'medium',
    title: 'File claims creation 27 years before the volume was formatted',
    description:
      'The $SI creation timestamp precedes the volume creation time recorded in ' +
      '$VOLUME_INFORMATION. A file cannot predate the filesystem containing it.',
    recordNumber: 102,
    filePath: 'E:\\Tools\\install.log',
    detectedBy: 'si-before-volume-creation',
    confidence: 'high',
    evidence: [
      { label: '$SI Created', value: '1998-11-04T02:15:00.000Z', note: null },
      { label: 'Volume created', value: VOLUME_CREATED, note: 'from $VOLUME_INFORMATION' },
      { label: '$FN Created', value: '2026-07-20T14:33:48.900Z', note: 'consistent with the volume' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Timeline — MACB entries from both attributes, plus USN journal rows
// ---------------------------------------------------------------------------

const timeline = [];

const pushMacb = (file) => {
  const pairs = [
    ['created', 'created'],
    ['modified', 'modified'],
    ['mftModified', 'mft-modified'],
    ['accessed', 'accessed'],
  ];
  for (const [key, action] of pairs) {
    timeline.push({
      timestamp: file.standardInfo[key].iso,
      source: 'mft-si',
      action,
      recordNumber: file.recordNumber,
      filePath: file.filePath,
      detail: `$SI ${action}`,
      findingIds: file.findingIds,
    });
    if (file.fileNameInfo) {
      timeline.push({
        timestamp: file.fileNameInfo[key].iso,
        source: 'mft-fn',
        action,
        recordNumber: file.recordNumber,
        filePath: file.filePath,
        detail: `$FN ${action}`,
        findingIds: file.findingIds,
      });
    }
  }
};

files.forEach(pushMacb);

// A handful of USN journal rows: the rename/delete history that survives
// casual cleanup.
timeline.push(
  {
    timestamp: '2026-07-20T14:32:11.442Z',
    source: 'usn-journal',
    action: 'created',
    recordNumber: 57,
    filePath: 'E:\\Tools\\svchost.exe',
    detail: 'FILE_CREATE|CLOSE',
    findingIds: ['f-001'],
  },
  {
    timestamp: '2026-07-20T14:29:41.887Z',
    source: 'usn-journal',
    action: 'renamed',
    recordNumber: 94,
    filePath: null,
    detail: 'RENAME_OLD_NAME: update.ps1 -> RENAME_NEW_NAME: stage2.ps1',
    findingIds: ['f-006'],
  },
  {
    timestamp: '2026-07-20T18:02:07.115Z',
    source: 'usn-journal',
    action: 'deleted',
    recordNumber: 71,
    filePath: 'E:\\Docs\\handover-credentials.txt',
    detail: 'FILE_DELETE|CLOSE',
    findingIds: ['f-004'],
  },
  {
    timestamp: '2026-07-20T18:03:19.740Z',
    source: 'usn-journal',
    action: 'deleted',
    recordNumber: 88,
    filePath: 'E:\\Media\\screen-capture.mp4',
    detail: 'FILE_DELETE|CLOSE',
    findingIds: ['f-005'],
  },
  {
    timestamp: '2026-07-20T18:04:55.021Z',
    source: 'usn-journal',
    action: 'deleted',
    recordNumber: 94,
    filePath: null,
    detail: 'FILE_DELETE|CLOSE',
    findingIds: ['f-006'],
  }
);

timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

const histogramMap = new Map();
for (const entry of timeline) {
  const date = entry.timestamp.slice(0, 10);
  if (!histogramMap.has(date)) {
    histogramMap.set(date, { date, created: 0, modified: 0, accessed: 0, deleted: 0 });
  }
  const bucket = histogramMap.get(date);
  if (entry.action === 'created') bucket.created += 1;
  else if (entry.action === 'modified' || entry.action === 'mft-modified') bucket.modified += 1;
  else if (entry.action === 'accessed') bucket.accessed += 1;
  else if (entry.action === 'deleted') bucket.deleted += 1;
}

const histogram = [...histogramMap.values()].sort((a, b) => a.date.localeCompare(b.date));

const countBySeverity = (severity) => findings.filter((f) => f.severity === severity).length;

const findingsByType = {};
for (const finding of findings) {
  findingsByType[finding.type] = (findingsByType[finding.type] ?? 0) + 1;
}

const caseFile = {
  schemaVersion: 1,
  generator: { tool: 'checkup', version: '2.0.0-dev', builtAt: null },
  volume: {
    label: 'CASE-TEST',
    driveLetter: 'E:',
    serialNumber: '7a3c91e40b28f5d6',
    fileSystem: 'NTFS',
    bytesPerSector: 512,
    sectorsPerCluster: 8,
    bytesPerCluster: 4096,
    totalClusters: 524288,
    totalBytes: 2147483648,
    mftStartCluster: 65536,
    mftRecordSize: 1024,
    mftRecordsTotal: 2048,
    createdAt: VOLUME_CREATED,
  },
  scan: {
    caseId: 'CASE-2026-0725-E',
    startedAt: '2026-07-25T10:03:11.000Z',
    completedAt: '2026-07-25T10:03:48.512Z',
    durationSeconds: 37.512,
    hostname: 'DESKTOP-FORENSICA',
    operator: 'DESKTOP-FORENSICA\\anide',
    mftRecordsParsed: 1204,
    mftRecordsInUse: 1163,
    mftRecordsDeleted: 41,
    filesRecovered: 2,
    errors: [
      {
        stage: 'attribute',
        recordNumber: 96,
        message: 'attribute 0x80 header truncated at record boundary; stream skipped',
      },
      {
        stage: 'hash',
        recordNumber: 88,
        message: 'stream not hashed: 1 of 3 data runs reallocated, content unreliable',
      },
    ],
  },
  statistics: {
    fileCounts: {
      total: 1204,
      active: 1163,
      deleted: 41,
      directories: 87,
      withAlternateStreams: 1,
      timestomped: 2,
      orphaned: 1,
    },
    fileTypes: {
      documents: 214,
      images: 96,
      videos: 12,
      executables: 31,
      scripts: 18,
      archives: 9,
      logs: 44,
      other: 693,
      directories: 87,
    },
    sizeBuckets: [
      { label: 'Resident (<1 KB)', minBytes: 0, maxBytes: 1024, count: 402 },
      { label: '1 KB - 1 MB', minBytes: 1024, maxBytes: 1048576, count: 611 },
      { label: '1 MB - 100 MB', minBytes: 1048576, maxBytes: 104857600, count: 178 },
      { label: '> 100 MB', minBytes: 104857600, maxBytes: null, count: 13 },
    ],
    histogram,
    findingsBySeverity: {
      critical: countBySeverity('critical'),
      high: countBySeverity('high'),
      medium: countBySeverity('medium'),
      low: countBySeverity('low'),
      info: countBySeverity('info'),
    },
    findingsByType,
  },
  findings,
  files: {
    truncated: true,
    includedCount: files.length,
    totalCount: 1204,
    inclusionPolicy:
      'Records referenced by a finding, plus all deleted records with recoverable content. ' +
      'Run with --full to emit every parsed record.',
    entries: files,
  },
  timeline: {
    truncated: true,
    includedCount: timeline.length,
    totalCount: 4923,
    inclusionPolicy:
      'MACB entries for included records, plus USN journal rows for create, rename and delete.',
    entries: timeline,
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(caseFile, null, 2) + '\n', 'utf8');

console.log(`wrote ${OUT}`);
console.log(
  `  ${files.length} file records, ${findings.length} findings, ${timeline.length} timeline entries`
);
