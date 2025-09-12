import React from 'react';
import { Navigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import Navbar from '../components/common/Navbar';
import Summary from '../components/results/Summary';
import Timeline from '../components/results/Timeline';
import FileExplorer from '../components/results/FileExplorer';
import Statistics from '../components/results/Statistics';
import SuspiciousFindings from '../components/results/SuspiciousFindings';
import { useAppContext } from '../context/AppContext';

const ResultsPage: React.FC = () => {
  const { caseData } = useAppContext();

  if (!caseData) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <Navbar />
      
      <div className="flex">
        <Sidebar />
        
        <main className="flex-1 p-6 space-y-10 md:space-y-12">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Forensic Analysis Results
              </h1>
              <p className="text-gray-600 dark:text-slate-400 mt-2">
                Case ID: {caseData.caseId}
              </p>
            </div>

            {/* Summary */}
            <div className="mb-6 md:mb-8">
              <Summary data={caseData} />
            </div>

            {/* Timeline */}
            <div className="mb-6 md:mb-8">
              <Timeline events={caseData.timeline} />
            </div>

            {/* Statistics */}
            <div className="mb-6 md:mb-8">
              <Statistics statistics={caseData.statistics} />
            </div>

            {/* Suspicious Findings */}
            <div className="mb-6 md:mb-8">
              <SuspiciousFindings findings={caseData.suspiciousFindings} />
            </div>

            {/* File Explorer */}
            <div>
              <FileExplorer files={caseData.files} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ResultsPage;