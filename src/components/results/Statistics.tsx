import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Statistics as StatisticsType } from '../../types';
import { useTheme } from '../../context/ThemeContext';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface StatisticsProps {
  statistics: StatisticsType;
}

const Statistics: React.FC<StatisticsProps> = ({ statistics }) => {
  const { theme } = useTheme();

  const fileTypesData = {
    labels: ['Documents', 'Images', 'Videos', 'Executables', 'Others'],
    datasets: [
      {
        data: [
          statistics.fileTypes.documents,
          statistics.fileTypes.images,
          statistics.fileTypes.videos,
          statistics.fileTypes.executables,
          statistics.fileTypes.others,
        ],
        backgroundColor: [
          theme === 'dark' ? '#2da62d' : '#228722',  // forest-500 / forest-600
          theme === 'dark' ? '#10b981' : '#059669',  // emerald
          theme === 'dark' ? '#f59e0b' : '#d97706',  // amber
          theme === 'dark' ? '#ef4444' : '#dc2626',  // red
          theme === 'dark' ? '#8b5cf6' : '#7c3aed',  // violet
        ],
        borderWidth: 2,
        borderColor: theme === 'dark' ? '#1e293b' : '#ffffff',
      },
    ],
  };

  const fileSizesData = {
    labels: ['Small (<10MB)', 'Medium (10MB-100MB)', 'Large (>100MB)'],
    datasets: [
      {
        label: 'Number of Files',
        data: [
          statistics.fileSizes.small,
          statistics.fileSizes.medium,
          statistics.fileSizes.large,
        ],
        backgroundColor: theme === 'dark' ? '#2da62d50' : '#22872250',
        borderColor: theme === 'dark' ? '#2da62d' : '#228722',
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: theme === 'dark' ? '#e2e8f0' : '#374151',
          padding: 20,
        },
      },
    },
  };

  const barOptions = {
    ...chartOptions,
    scales: {
      x: {
        ticks: { color: theme === 'dark' ? '#94a3b8' : '#6b7280' },
        grid: { color: theme === 'dark' ? '#374151' : '#e5e7eb' },
      },
      y: {
        ticks: { color: theme === 'dark' ? '#94a3b8' : '#6b7280' },
        grid: { color: theme === 'dark' ? '#374151' : '#e5e7eb' },
      },
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          File Types Distribution
        </h3>
        <div className="h-80">
          <Doughnut data={fileTypesData} options={chartOptions} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          File Sizes Distribution
        </h3>
        <div className="h-80">
          <Bar data={fileSizesData} options={barOptions} />
        </div>
      </div>
    </div>
  );
};

export default Statistics;