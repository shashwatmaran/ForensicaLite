// Raw shapes coming from the backend JSON
interface RawFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  created: string;
  hash_sha256?: string;
  status?: string;
}

interface RawFinding {
  path?: string;
  fileName?: string;
  yaraMatches?: string[];
  rule?: string;
  namingPattern?: string;
  fileType?: string;
  risk?: string;
  heuristicScore?: number;
  entropyClass?: string;
}

interface RawTimelineRow {
  date: string;
  created?: number;
  modified?: number;
  deleted?: number;
}

interface RawScanInfo {
  caseId?: string;
  diskName?: string;
  totalFiles?: number;
  deletedFiles?: number;
  anomaliesFound?: number;
  scannedAt?: string;
}

interface RawHeuristicEntry {
  path?: string;
  score?: number;
  risk?: string;
}

interface RawData {
  caseId?: string;
  diskName?: string;
  totalFiles?: number;
  deletedFiles?: number;
  anomaliesFound?: number;
  scannedAt?: string;
  scanInfo?: RawScanInfo;
  allFiles?: RawFile[];
  fileTimeline?: RawTimelineRow[];
  timeline?: Record<string, { created?: number; modified?: number; deleted?: number }>;
  summary?: { fileTypeDistribution?: Record<string, number> };
  fileTypes?: Record<string, number>;
  fileSizes?: { small?: number; medium?: number; large?: number };
  suspiciousFiles?: RawFinding[];
  heuristicRanking?: RawHeuristicEntry[];
}

type RankingMap = Record<string, { score?: number; risk?: string }>;

// --- File Explorer Normalizer ---
const normalizeFiles = (files: RawFile[]) =>
  files.map((f) => ({
    fileName: f.name,
    filePath: f.path,
    fileSize: f.size,
    modifiedAt: f.modified,
    createdAt: f.created,
    hash: f.hash_sha256 || '',
    deletedAt: null,
    status:
      f.status?.toLowerCase() === 'suspicious'
        ? 'active'
        : f.status?.toLowerCase() === 'clean'
          ? 'active'
          : (f.status?.toLowerCase() || 'active'),
  })) as import('../types').ForensicFile[];

// --- Suspicious Findings Normalizer ---
const normalizeFindings = (suspicious: RawFinding[], rankingMap?: RankingMap) =>
  suspicious.map((f) => {
    const fileName =
      (typeof f.path === 'string' ? f.path.split(/\\|\//).pop() : undefined) ||
      f.fileName ||
      'Unknown';
    const yaraArr: string[] = Array.isArray(f.yaraMatches) ? f.yaraMatches : [];
    const rule = (f.rule || '').toString();
    const primarySig = rule || yaraArr[0] || f.namingPattern || f.fileType || 'Suspicious file detected';

    const rank = rankingMap && typeof f.path === 'string' ? rankingMap[f.path.toLowerCase()] : undefined;
    const riskStr = (rank?.risk || f.risk || '').toString().toLowerCase();
    const score =
      typeof (rank?.score ?? f.heuristicScore) === 'number'
        ? Number(rank?.score ?? f.heuristicScore)
        : undefined;
    const entropyClass = (f.entropyClass || '').toString().toLowerCase();

    const severity: 'low' | 'medium' | 'high' = (() => {
      if (riskStr === 'high') return 'high';
      if (riskStr === 'medium') return 'medium';
      if (typeof score === 'number') {
        if (score >= 85) return 'high';
        if (score >= 70) return 'medium';
      }
      const sig = (primarySig || '').toLowerCase();
      if (/(trojan|dropper|ransom|keylog|stealer|backdoor|rootkit|exploit|bot)/.test(sig)) return 'high';
      if (/(executable|powershell|cmd|script|psexec|autorun|registry|network|packed|packer|obfuscat|entropy|highentropy)/.test(sig)) return 'medium';
      if (entropyClass === 'high') return 'medium';
      return 'low';
    })();

    return { fileName, reason: primarySig, severity };
  });

// --- Main Forensic Case Normalizer ---
export const safeNormalizeForensicCase = (content: string) => {
  try {
    const rawData = JSON.parse(content) as RawData;

    const timelineEvents: import('../types').TimelineEvent[] = [];

    if (Array.isArray(rawData.fileTimeline)) {
      rawData.fileTimeline.forEach((row) => {
        const date = row.date;
        if ((row.created ?? 0) > 0)
          timelineEvents.push({ event: 'file_created', fileName: 'Files created', timestamp: date, count: Number(row.created) || 0 });
        if ((row.modified ?? 0) > 0)
          timelineEvents.push({ event: 'file_modified', fileName: 'Files modified', timestamp: date, count: Number(row.modified) || 0 });
        if ((row.deleted ?? 0) > 0)
          timelineEvents.push({ event: 'file_deleted', fileName: 'Files deleted', timestamp: date, count: Number(row.deleted) || 0 });
      });
    } else if (rawData.timeline && typeof rawData.timeline === 'object') {
      Object.entries(rawData.timeline).forEach(([date, events]) => {
        if ((events.created ?? 0) > 0)
          timelineEvents.push({ event: 'file_created', fileName: 'Files created', timestamp: date, count: Number(events.created) || 0 });
        if ((events.modified ?? 0) > 0)
          timelineEvents.push({ event: 'file_modified', fileName: 'Files modified', timestamp: date, count: Number(events.modified) || 0 });
        if ((events.deleted ?? 0) > 0)
          timelineEvents.push({ event: 'file_deleted', fileName: 'Files deleted', timestamp: date, count: Number(events.deleted) || 0 });
      });
    }

    const scanInfo = rawData.scanInfo || {};

    const rankingMap: RankingMap = Array.isArray(rawData.heuristicRanking)
      ? rawData.heuristicRanking.reduce<RankingMap>((acc, r) => {
        if (typeof r.path === 'string') acc[r.path.toLowerCase()] = { score: r.score, risk: r.risk };
        return acc;
      }, {})
      : {};

    const ftd = rawData.summary?.fileTypeDistribution || rawData.fileTypes || {};
    const archives = Number(ftd['archives']) || 0;

    const normalizedData: import('../types').ForensicCase = {
      caseId: rawData.caseId || scanInfo.caseId || `case_${Date.now()}`,
      summary: {
        diskName: scanInfo.diskName || rawData.diskName || 'Unknown Disk',
        totalFiles: scanInfo.totalFiles ?? rawData.totalFiles ?? 0,
        deletedFiles: scanInfo.deletedFiles ?? rawData.deletedFiles ?? 0,
        anomaliesFound: scanInfo.anomaliesFound ?? rawData.anomaliesFound ?? 0,
        scanTimestamp: scanInfo.scannedAt || rawData.scannedAt || new Date().toISOString(),
      },
      files: normalizeFiles(Array.isArray(rawData.allFiles) ? rawData.allFiles : []),
      timeline: timelineEvents,
      statistics: {
        fileTypes: {
          documents: Number(ftd['documents']) || 0,
          images: Number(ftd['images']) || 0,
          videos: Number(ftd['videos']) || 0,
          executables: Number(ftd['executables']) || 0,
          others: (Number(ftd['others']) || 0) + archives,
        },
        fileSizes: {
          small: Number(rawData.fileSizes?.small) || 0,
          medium: Number(rawData.fileSizes?.medium) || 0,
          large: Number(rawData.fileSizes?.large) || 0,
        },
      },
      suspiciousFindings: normalizeFindings(
        Array.isArray(rawData.suspiciousFiles) ? rawData.suspiciousFiles : [],
        rankingMap
      ),
    };

    return { data: normalizedData, error: null };
  } catch (error) {
    console.error('Error normalizing forensic case:', error);
    return {
      data: null,
      error: `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};
