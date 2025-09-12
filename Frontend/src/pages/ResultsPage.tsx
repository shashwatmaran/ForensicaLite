import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import CasesDashboard from '../components/results/CasesDashboard';
import Summary from '../components/results/Summary';
import Timeline from '../components/results/Timeline';
import FileExplorer from '../components/results/FileExplorer';
import Statistics from '../components/results/Statistics';
import SuspiciousFindings from '../components/results/SuspiciousFindings';
import { useAppContext } from '../context/AppContext';
import { ArrowLeft } from 'lucide-react';

const ResultsPage: React.FC = () => {
  const { cases, caseData, selectCase, removeCase } = useAppContext();
  const [viewMode, setViewMode] = useState<'dashboard' | 'case'>('dashboard');

  if (cases.length === 0) {
    return <Navigate to="/" replace />;
  }

  const handleSelectCase = (caseId: string) => {
    selectCase(caseId);
    setViewMode('case');
  };

  const handleBackToDashboard = () => {
    setViewMode('dashboard');
  };

  const handleRemoveCase = (caseId: string) => {
    removeCase(caseId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      <Navbar />
      
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto">
            {viewMode === 'dashboard' ? (
              <CasesDashboard 
                cases={cases}
                onSelectCase={handleSelectCase}
                onRemoveCase={handleRemoveCase}
              />
            ) : (
              <>
                {/* Back to Dashboard Button */}
                <div className="mb-6">
                  <button
                    onClick={handleBackToDashboard}
                    className="inline-flex items-center space-x-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Dashboard</span>
                  </button>
                </div>

                {/* Case Details */}
                {caseData && (
                  <>
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
                  </>
                )}
              </>
            )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default ResultsPage;