import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { TimelineEvent } from '../../types';
import { useTheme } from '../../context/ThemeContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface TimelineProps {
  events: TimelineEvent[];
}

const Timeline: React.FC<TimelineProps> = ({ events }) => {
  const { theme } = useTheme();
  const chartRef = useRef<ChartJS<'line'>>(null);

  // Process timeline data for chart (sum provided counts if present)
  const processedData = React.useMemo(() => {
    const eventCounts: Record<string, { created: number; deleted: number; modified: number }> = {};

    events.forEach(event => {
      const date = new Date(event.timestamp).toDateString();
      if (!eventCounts[date]) {
        eventCounts[date] = { created: 0, deleted: 0, modified: 0 };
      }
      const key = event.event.replace('file_', '') as 'created' | 'deleted' | 'modified';
      const inc = typeof event.count === 'number' ? event.count : 1;
      eventCounts[date][key] += inc;
    });

    const sortedDates = Object.keys(eventCounts).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return {
      labels: sortedDates,
      datasets: [
        {
          label: 'Files Created',
          data: sortedDates.map(date => eventCounts[date].created),
          borderColor: theme === 'dark' ? '#10b981' : '#059669',
          backgroundColor: theme === 'dark' ? '#10b98120' : '#05966920',
          tension: 0.4,
        },
        {
          label: 'Files Deleted',
          data: sortedDates.map(date => eventCounts[date].deleted),
          borderColor: theme === 'dark' ? '#ef4444' : '#dc2626',
          backgroundColor: theme === 'dark' ? '#ef444420' : '#dc262620',
          tension: 0.4,
        },
        {
          label: 'Files Modified',
          data: sortedDates.map(date => eventCounts[date].modified),
          borderColor: theme === 'dark' ? '#f59e0b' : '#d97706',
          backgroundColor: theme === 'dark' ? '#f59e0b20' : '#d9770620',
          tension: 0.4,
        },
      ],
    };
  }, [events, theme]);

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: theme === 'dark' ? '#e2e8f0' : '#374151',
        },
      },
      title: {
        display: true,
        text: 'File Activity Timeline',
        color: theme === 'dark' ? '#f1f5f9' : '#111827',
      },
    },
    scales: {
      x: {
        ticks: {
          color: theme === 'dark' ? '#94a3b8' : '#6b7280',
        },
        grid: {
          color: theme === 'dark' ? '#374151' : '#e5e7eb',
        },
      },
      y: {
        ticks: {
          color: theme === 'dark' ? '#94a3b8' : '#6b7280',
        },
        grid: {
          color: theme === 'dark' ? '#374151' : '#e5e7eb',
        },
      },
    },
  };

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.update();
    }
  }, [theme]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Activity Timeline
      </h2>
      
      <div className="h-80">
        <Line ref={chartRef} data={processedData} options={options} />
      </div>
    </div>
  );
};

export default Timeline;