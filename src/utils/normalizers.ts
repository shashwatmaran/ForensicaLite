// --- File Explorer Normalizer ---
export const normalizeFiles = (files: unknown[]) =>
  files.map((f: any) => ({
    fileName: f.name,         // backend gives "name"
    filePath: f.path,         // backend gives "path"
    fileSize: f.size,         // same
    modifiedAt: f.modified,   // backend gives "modified"
    createdAt: f.created,     // backend gives "created"
    hash: f.hash_sha256 || '', // backend gives "hash_sha256"
    deletedAt: null,          // not in backend data
    // Convert status for UI tags
    status:
      f.status?.toLowerCase() === "suspicious"
        ? "active"
        : f.status?.toLowerCase() === "clean"
        ? "active"
        : f.status?.toLowerCase() || "active",
  }));

// --- Summary Normalizer ---
export const normalizeSummary = (data: any) => ({
  summary: {
    diskName: data.diskName,
    totalFiles: data.totalFiles,
    deletedFiles: data.deletedFiles,
    anomaliesFound: data.anomaliesFound,
    // backend uses "scannedAt", component expects "scanTimestamp"
    scanTimestamp: data.scannedAt,
  },
});

// --- Suspicious Findings Normalizer ---
export const normalizeFindings = (suspicious: unknown[], rankingMap?: Record<string, { score?: number; risk?: string }>) =>
  suspicious.map((f: any) => {
    const fileName = (typeof f.path === 'string' ? f.path.split(/\\|\//).pop() : undefined) || f.fileName || 'Unknown';
    const yaraArr: string[] = Array.isArray(f.yaraMatches) ? f.yaraMatches : [];
    const rule = (f.rule || '').toString();
    const primarySig = rule || yaraArr[0] || f.namingPattern || f.fileType || 'Suspicious file detected';

    const rank = rankingMap && typeof f.path === 'string' ? rankingMap[f.path.toLowerCase()] : undefined;
    const riskStr = (rank?.risk || f.risk || '').toString().toLowerCase();
    const score = typeof (rank?.score ?? f.heuristicScore) === 'number' ? Number(rank?.score ?? f.heuristicScore) : undefined;
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

    return {
      fileName,
      reason: primarySig,
      severity,
    };
  });

// --- Main Forensic Case Normalizer ---
export const safeNormalizeForensicCase = (content: string) => {
  try {
    // Parse JSON content
    const rawData = JSON.parse(content);
    
    // Build timeline events from either legacy `timeline` object or new `fileTimeline` array
    const timelineEvents: any[] = [];
    // New schema: fileTimeline: [{ date, created, modified, deleted? }]
    if (Array.isArray(rawData.fileTimeline)) {
      rawData.fileTimeline.forEach((row: any) => {
        const date = row.date;
        if (row.created > 0) {
          timelineEvents.push({ event: 'file_created', fileName: 'Files created', timestamp: date, count: Number(row.created) || 0 });
        }
        if (row.modified > 0) {
          timelineEvents.push({ event: 'file_modified', fileName: 'Files modified', timestamp: date, count: Number(row.modified) || 0 });
        }
        if (row.deleted > 0) {
          timelineEvents.push({ event: 'file_deleted', fileName: 'Files deleted', timestamp: date, count: Number(row.deleted) || 0 });
        }
      });
    } else if (rawData.timeline && typeof rawData.timeline === 'object') {
      // Legacy object map: { 'YYYY-MM-DD': { created, modified, deleted } }
      Object.entries(rawData.timeline).forEach(([date, events]: [string, any]) => {
        if (events.created > 0) {
          timelineEvents.push({ event: 'file_created', fileName: 'Files created', timestamp: date, count: Number(events.created) || 0 });
        }
        if (events.modified > 0) {
          timelineEvents.push({ event: 'file_modified', fileName: 'Files modified', timestamp: date, count: Number(events.modified) || 0 });
        }
        if (events.deleted > 0) {
          timelineEvents.push({ event: 'file_deleted', fileName: 'Files deleted', timestamp: date, count: Number(events.deleted) || 0 });
        }
      });
    }
    
    // Build summary from new schema scanInfo, fallback to legacy top-level fields
    const scanInfo = rawData.scanInfo || {};
    // Build a heuristic ranking index by path (case-insensitive)
    const rankingMap: Record<string, { score?: number; risk?: string }> = Array.isArray(rawData.heuristicRanking)
      ? rawData.heuristicRanking.reduce((acc: any, r: any) => {
          if (typeof r.path === 'string') acc[r.path.toLowerCase()] = { score: r.score, risk: r.risk };
          return acc;
        }, {})
      : {};

    const normalizedData = {
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
      statistics: (() => {
        // Prefer new summary.fileTypeDistribution
        const ftd = rawData.summary?.fileTypeDistribution || rawData.fileTypes || {};
        const archives = Number(ftd.archives) || 0;
        return {
          fileTypes: {
            documents: Number(ftd.documents) || 0,
            images: Number(ftd.images) || 0,
            videos: Number(ftd.videos) || 0,
            executables: Number(ftd.executables) || 0,
            others: (Number(ftd.others) || 0) + archives,
          },
          fileSizes: {
            // If not present in new schema, default to 0s
            small: Number(rawData.fileSizes?.small) || 0,
            medium: Number(rawData.fileSizes?.medium) || 0,
            large: Number(rawData.fileSizes?.large) || 0,
          },
        };
      })(),
      suspiciousFindings: normalizeFindings(Array.isArray(rawData.suspiciousFiles) ? rawData.suspiciousFiles : [], rankingMap),
    };

    return { data: normalizedData, error: null };
  } catch (error) {
    console.error('Error normalizing forensic case:', error);
    return { 
      data: null, 
      error: `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
};
