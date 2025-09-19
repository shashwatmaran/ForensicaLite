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
export const normalizeFindings = (suspicious: unknown[]) =>
  suspicious.map((f: any) => ({
    fileName: f.path?.split('/').pop() || f.fileName || 'Unknown',
    reason: f.rule || 'Suspicious file detected',
    severity: f.rule?.includes("Executable")
      ? "high"
      : f.rule?.includes("Network")
      ? "medium"
      : "low",
  }));

// --- Main Forensic Case Normalizer ---
export const safeNormalizeForensicCase = (content: string) => {
  try {
    // Parse JSON content
    const rawData = JSON.parse(content);
    
    // Convert timeline object to array format
    const timelineEvents: any[] = [];
    if (rawData.timeline && typeof rawData.timeline === 'object') {
      Object.entries(rawData.timeline).forEach(([date, events]: [string, any]) => {
        if (events.created > 0) {
          timelineEvents.push({
            event: 'file_created',
            fileName: 'Files created',
            timestamp: date,
          });
        }
        if (events.modified > 0) {
          timelineEvents.push({
            event: 'file_modified',
            fileName: 'Files modified',
            timestamp: date,
          });
        }
        if (events.deleted > 0) {
          timelineEvents.push({
            event: 'file_deleted',
            fileName: 'Files deleted',
            timestamp: date,
          });
        }
      });
    }
    
    const normalizedData = {
      caseId: rawData.caseId || `case_${Date.now()}`,
      summary: {
        diskName: rawData.diskName || 'Unknown Disk',
        totalFiles: rawData.totalFiles || 0,
        deletedFiles: rawData.deletedFiles || 0,
        anomaliesFound: rawData.anomaliesFound || 0,
        scanTimestamp: rawData.scannedAt || new Date().toISOString(),
      },
      files: normalizeFiles(Array.isArray(rawData.allFiles) ? rawData.allFiles : []),
      timeline: timelineEvents,
      statistics: {
        fileTypes: {
          documents: rawData.fileTypes?.documents || 0,
          images: rawData.fileTypes?.images || 0,
          videos: rawData.fileTypes?.videos || 0,
          executables: rawData.fileTypes?.executables || 0,
          others: rawData.fileTypes?.others || 0,
        },
        fileSizes: {
          small: rawData.fileSizes?.small || 0,
          medium: rawData.fileSizes?.medium || 0,
          large: rawData.fileSizes?.large || 0,
        },
      },
      suspiciousFindings: normalizeFindings(Array.isArray(rawData.suspiciousFiles) ? rawData.suspiciousFiles : []),
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
