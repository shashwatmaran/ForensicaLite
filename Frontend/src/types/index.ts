export interface ForensicCase {
  caseId: string;
  summary: {
    diskName: string;
    totalFiles: number;
    deletedFiles: number;
    anomaliesFound: number;
    scanTimestamp: string;
  };
  files: ForensicFile[];
  timeline: TimelineEvent[];
  statistics: Statistics;
  suspiciousFindings: SuspiciousFinding[];
}

export interface ForensicFile {
  fileName: string;
  filePath: string;
  fileSize: number;
  hash: string;
  createdAt: string;
  modifiedAt: string;
  deletedAt: string | null;
  status: 'active' | 'deleted';
}

export interface TimelineEvent {
  event: 'file_created' | 'file_deleted' | 'file_modified';
  fileName: string;
  timestamp: string;
}

export interface Statistics {
  fileTypes: {
    documents: number;
    images: number;
    videos: number;
    executables: number;
    others: number;
  };
  fileSizes: {
    small: number;
    medium: number;
    large: number;
  };
}

export interface SuspiciousFinding {
  fileName: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export interface AppContextType {
  caseData: ForensicCase | null;
  setCaseData: (data: ForensicCase | null) => void;
  currentCaseId: string | null;
  setCurrentCaseId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}