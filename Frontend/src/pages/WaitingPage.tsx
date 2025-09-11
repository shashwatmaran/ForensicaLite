import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import Loader from '../components/common/Loader';
import { useAppContext } from '../context/AppContext';
import { api } from '../utils/api';

const WaitingPage: React.FC = () => {
  const navigate = useNavigate();
  const { setIsLoading, setCaseData, currentCaseId, setCurrentCaseId } = useAppContext();

  useEffect(() => {
    setIsLoading(true);
    
    // In a real app, the EXE would create a case and provide the case ID
    // For demo purposes, we'll simulate this
    const simulateCaseCreation = async () => {
      try {
        // Simulate case creation
        if (!currentCaseId) {
          const mockCaseId = 'demo-case-' + Date.now();
          setCurrentCaseId(mockCaseId);
        }

        // Simulate polling for results
        setTimeout(() => {
          // Mock results data for demonstration
          const mockResults = {
            caseId: currentCaseId || 'demo-case',
            summary: {
              diskName: 'Windows (C:)',
              totalFiles: 15429,
              deletedFiles: 342,
              anomaliesFound: 7,
              scanTimestamp: new Date().toISOString(),
            },
            files: [
              {
                fileName: 'suspicious.exe',
                filePath: 'C:/Users/User/AppData/Temp/',
                fileSize: 2048576,
                hash: 'a7f5f35426b927411fc9231b56382173',
                createdAt: '2025-01-15T10:00:00Z',
                modifiedAt: '2025-01-15T10:05:00Z',
                deletedAt: null,
                status: 'active' as const,
              },
              {
                fileName: 'deleted_document.docx',
                filePath: 'C:/Users/User/Documents/',
                fileSize: 45213,
                hash: 'b1946ac92492d2347c6235b4d2611184',
                createdAt: '2024-12-20T14:30:00Z',
                modifiedAt: '2024-12-20T14:45:00Z',
                deletedAt: '2025-01-10T09:15:00Z',
                status: 'deleted' as const,
              },
              {
                fileName: 'image.jpg',
                filePath: 'C:/Users/User/Pictures/',
                fileSize: 3145728,
                hash: 'c2d8f17b8fc8c15b83a1c3c5d41234f5',
                createdAt: '2025-01-12T16:20:00Z',
                modifiedAt: '2025-01-12T16:20:00Z',
                deletedAt: null,
                status: 'active' as const,
              },
            ],
            timeline: [
              {
                event: 'file_created' as const,
                fileName: 'suspicious.exe',
                timestamp: '2025-01-15T10:00:00Z',
              },
              {
                event: 'file_deleted' as const,
                fileName: 'deleted_document.docx',
                timestamp: '2025-01-10T09:15:00Z',
              },
              {
                event: 'file_created' as const,
                fileName: 'image.jpg',
                timestamp: '2025-01-12T16:20:00Z',
              },
            ],
            statistics: {
              fileTypes: {
                documents: 5420,
                images: 3120,
                videos: 420,
                executables: 89,
                others: 6380,
              },
              fileSizes: {
                small: 12340,
                medium: 2890,
                large: 199,
              },
            },
            suspiciousFindings: [
              {
                fileName: 'suspicious.exe',
                reason: 'Unknown executable in temp directory with no digital signature',
                severity: 'high' as const,
              },
              {
                fileName: 'keylogger.dll',
                reason: 'Library with keylogger-like behavior patterns detected',
                severity: 'high' as const,
              },
              {
                fileName: 'temp_file_001.tmp',
                reason: 'Large temporary file with encrypted content',
                severity: 'medium' as const,
              },
            ],
          };

          setCaseData(mockResults);
          setIsLoading(false);
          navigate('/results');
        }, 8000); // 8 seconds simulation

        // In a real app, you would:
        // const cleanup = await api.pollResults(caseId, (results) => {
        //   setCaseData(results);
        //   setIsLoading(false);
        //   navigate('/results');
        // });
        // return cleanup;

      } catch (error) {
        console.error('Error during analysis:', error);
        setIsLoading(false);
      }
    };

    simulateCaseCreation();
  }, [navigate, setCaseData, setIsLoading, currentCaseId, setCurrentCaseId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      <Navbar />
      
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto text-center">
          <Loader message="Analyzing your disk, please wait..." />
          
          <div className="mt-8 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Analysis in Progress
            </h3>
            
            <div className="space-y-3 text-sm text-gray-600 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span>Scanning file system...</span>
                <span className="text-green-600 dark:text-green-400">✓ Complete</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Analyzing deleted files...</span>
                <span className="text-green-600 dark:text-green-400">✓ Complete</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Detecting anomalies...</span>
                <span className="text-blue-600 dark:text-blue-400">⟳ In Progress</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Generating report...</span>
                <span className="text-gray-400">⏳ Pending</span>
              </div>
            </div>
          </div>
          
          <div className="mt-6 text-sm text-gray-500 dark:text-slate-500">
            <p>This page will automatically redirect when analysis is complete.</p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default WaitingPage;