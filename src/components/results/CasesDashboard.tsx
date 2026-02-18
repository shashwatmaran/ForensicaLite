import React, { useState } from 'react';
import {
  Calendar,
  HardDrive,
  Trash2,
  Eye,
  Plus,
  X,
} from 'lucide-react';
import { ForensicCase } from '../../types';
import FileUpload from '../common/FileUpload';

interface CasesDashboardProps {
  cases: ForensicCase[];
  onSelectCase: (caseId: string) => void;
  onRemoveCase: (caseId: string) => void;
  onAddCase: (data: ForensicCase) => void;
}

const CasesDashboard: React.FC<CasesDashboardProps> = ({
  cases,
  onSelectCase,
  onRemoveCase,
  onAddCase,
}) => {
  const [showAddCase, setShowAddCase] = useState(false);
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSeverityCount = (findings: { severity: 'low' | 'medium' | 'high' }[], severity: 'low' | 'medium' | 'high') => {
    return findings.filter(f => f.severity === severity).length;
  };

  if (cases.length === 0) {
    return (
      <div className="text-center py-12">
        <HardDrive className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No Analysis Results
        </h3>
        <p className="text-gray-600 dark:text-slate-400 mb-6">
          Upload forensic analysis results or run the analyzer to see your cases here.
        </p>
        <div className="bg-forest-50 dark:bg-forest-950/20 border border-forest-200 dark:border-forest-800 rounded-lg p-4 max-w-md mx-auto">
          <p className="text-sm text-forest-800 dark:text-forest-200">
            💡 Start by uploading a JSON file or downloading the analyzer tool from the home page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Analysis Dashboard
          </h2>
          <p className="text-gray-600 dark:text-slate-400 mt-1">
            {cases.length} case{cases.length !== 1 ? 's' : ''} analyzed
          </p>
        </div>
        <button
          onClick={() => setShowAddCase(prev => !prev)}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-forest-600 hover:bg-forest-700 dark:bg-forest-700 dark:hover:bg-forest-800 text-white font-medium rounded-lg transition-colors"
        >
          {showAddCase ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{showAddCase ? 'Cancel' : 'Add Case'}</span>
        </button>
      </div>

      {showAddCase && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload Analysis Results</h3>
          <FileUpload onUpload={(data) => { onAddCase(data); setShowAddCase(false); }} />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cases.map((caseData) => (
          <div
            key={caseData.caseId}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-forest-100 dark:bg-forest-950/30 rounded-lg">
                  <HardDrive className="w-5 h-5 text-forest-600 dark:text-forest-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {caseData.summary.diskName}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-500">
                    {caseData.caseId}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => onSelectCase(caseData.caseId)}
                  className="p-1.5 text-gray-400 hover:text-forest-600 dark:hover:text-forest-400 transition-colors"
                  title="View Details"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onRemoveCase(caseData.caseId)}
                  className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Remove Case"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {caseData.summary.totalFiles.toLocaleString()}
                </div>
                <div className="text-xs text-gray-600 dark:text-slate-400">
                  Total Files
                </div>
              </div>

              <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {caseData.summary.deletedFiles.toLocaleString()}
                </div>
                <div className="text-xs text-gray-600 dark:text-slate-400">
                  Deleted Files
                </div>
              </div>
            </div>

            {/* Suspicious Findings */}
            {caseData.suspiciousFindings.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Suspicious Findings
                  </span>
                  <span className="text-sm text-gray-600 dark:text-slate-400">
                    {caseData.suspiciousFindings.length}
                  </span>
                </div>
                <div className="flex space-x-2">
                  {getSeverityCount(caseData.suspiciousFindings, 'high') > 0 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200">
                      {getSeverityCount(caseData.suspiciousFindings, 'high')} High
                    </span>
                  )}
                  {getSeverityCount(caseData.suspiciousFindings, 'medium') > 0 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200">
                      {getSeverityCount(caseData.suspiciousFindings, 'medium')} Medium
                    </span>
                  )}
                  {getSeverityCount(caseData.suspiciousFindings, 'low') > 0 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-200">
                      {getSeverityCount(caseData.suspiciousFindings, 'low')} Low
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div className="flex items-center text-sm text-gray-500 dark:text-slate-500">
              <Calendar className="w-4 h-4 mr-2" />
              <span>{formatDate(caseData.summary.scanTimestamp)}</span>
            </div>

            {/* Action Button */}
            <button
              onClick={() => onSelectCase(caseData.caseId)}
              className="w-full mt-4 bg-forest-600 hover:bg-forest-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              View Full Report
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CasesDashboard;
