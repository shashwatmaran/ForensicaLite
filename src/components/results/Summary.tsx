import React from 'react';
import { HardDrive, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { ForensicCase } from '../../types';
import { formatNumber, formatDate } from '../../utils/formatters';

interface SummaryProps {
  data: ForensicCase;
}

const Summary: React.FC<SummaryProps> = ({ data }) => {
  const { summary } = data;

  const stats = [
    {
      label: 'Disk Name',
      value: summary.diskName,
      icon: HardDrive,
      color: 'forest',
    },
    {
      label: 'Total Files',
      value: formatNumber(summary.totalFiles),
      icon: FileText,
      color: 'green',
    },
    {
      label: 'Deleted Files',
      value: formatNumber(summary.deletedFiles),
      icon: Trash2,
      color: 'orange',
    },
    {
      label: 'Anomalies Found',
      value: formatNumber(summary.anomaliesFound),
      icon: AlertTriangle,
      color: 'red',
    },
  ];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Analysis Summary
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const colorClasses = {
            forest: 'text-forest-600 dark:text-forest-400 bg-forest-100 dark:bg-forest-950/30',
            green: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-950/30',
            orange: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/30',
            red: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/30',
          };

          return (
            <div key={stat.label} className="text-center">
              <div className={`inline-flex p-3 rounded-full ${colorClasses[stat.color as keyof typeof colorClasses]} mb-3`}>
                <Icon className="w-6 h-6" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {stat.value}
              </p>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {stat.label}
              </p>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-200 dark:border-slate-600 pt-4">
        <p className="text-sm text-gray-600 dark:text-slate-400">
          <span className="font-medium">Scan completed:</span>{' '}
          {formatDate(summary.scanTimestamp)}
        </p>
      </div>
    </div>
  );
};

export default Summary;