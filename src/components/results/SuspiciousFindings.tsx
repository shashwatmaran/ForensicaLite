import React from 'react';
import { AlertTriangle, Shield, AlertCircle } from 'lucide-react';
import { SuspiciousFinding } from '../../types';
import { getSeverityColor } from '../../utils/formatters';
import clsx from 'clsx';

interface SuspiciousFindingsProps {
  findings: SuspiciousFinding[];
}

const SuspiciousFindings: React.FC<SuspiciousFindingsProps> = ({ findings }) => {
  const getSeverityIcon = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'low':
        return Shield;
      case 'medium':
        return AlertCircle;
      case 'high':
        return AlertTriangle;
      default:
        return AlertCircle;
    }
  };

  const groupedFindings = React.useMemo(() => {
    return findings.reduce((acc, finding) => {
      if (!acc[finding.severity]) {
        acc[finding.severity] = [];
      }
      acc[finding.severity].push(finding);
      return acc;
    }, {} as Record<string, SuspiciousFinding[]>);
  }, [findings]);

  const severityOrder: ('high' | 'medium' | 'low')[] = ['high', 'medium', 'low'];

  if (findings.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Suspicious Findings
        </h2>
        <div className="text-center py-8">
          <Shield className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-slate-400">
            No suspicious files detected. Your system appears clean!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Suspicious Findings
        </h2>
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            {findings.length} issue{findings.length !== 1 ? 's' : ''} found
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {severityOrder.map(severity => {
          const severityFindings = groupedFindings[severity];
          if (!severityFindings || severityFindings.length === 0) return null;

          const Icon = getSeverityIcon(severity);
          const colorClass = getSeverityColor(severity);

          return (
            <div key={severity}>
              <div className="flex items-center space-x-2 mb-3">
                <Icon className={clsx('w-5 h-5', colorClass.split(' ')[0])} />
                <h3 className={clsx(
                  'font-semibold capitalize text-sm',
                  colorClass.split(' ')[0]
                )}>
                  {severity} Severity ({severityFindings.length})
                </h3>
              </div>

              <div className="space-y-2 ml-7">
                {severityFindings.map((finding, index) => (
                  <div
                    key={`${finding.fileName}-${index}`}
                    className={clsx(
                      'p-4 rounded-lg border-l-4',
                      severity === 'high' && 'bg-red-50 dark:bg-red-950/20 border-l-red-500',
                      severity === 'medium' && 'bg-orange-50 dark:bg-orange-950/20 border-l-orange-500',
                      severity === 'low' && 'bg-yellow-50 dark:bg-yellow-950/20 border-l-yellow-500'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                          {finding.fileName}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {finding.reason}
                        </p>
                      </div>
                      <span className={clsx(
                        'ml-4 px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap',
                        colorClass
                      )}>
                        {severity.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-forest-50 dark:bg-forest-950/20 rounded-lg">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-forest-600 dark:text-forest-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-forest-900 dark:text-forest-100">
              Recommendation
            </h4>
            <p className="text-sm text-forest-700 dark:text-forest-300 mt-1">
              High and medium severity findings should be investigated immediately.
              Consider running additional security scans and consulting with cybersecurity professionals.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuspiciousFindings;