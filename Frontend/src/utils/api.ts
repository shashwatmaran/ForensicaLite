import { ForensicCase } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const api = {
  createCase: async (): Promise<{ caseId: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to create case');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error creating case:', error);
      throw error;
    }
  },

  uploadResults: async (caseId: string, results: any): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/cases/${caseId}/results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(results),
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload results');
      }
    } catch (error) {
      console.error('Error uploading results:', error);
      throw error;
    }
  },

  getResults: async (caseId: string): Promise<ForensicCase | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/cases/${caseId}/results`);
      
      if (response.status === 404) {
        return null; // Results not ready yet
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch results');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching results:', error);
      throw error;
    }
  },

  pollResults: async (caseId: string, onResults: (data: ForensicCase) => void): Promise<() => void> => {
    const poll = async () => {
      try {
        const results = await api.getResults(caseId);
        if (results) {
          onResults(results);
          return true; // Stop polling
        }
        return false; // Continue polling
      } catch (error) {
        console.error('Polling error:', error);
        return false;
      }
    };

    const intervalId = setInterval(async () => {
      const shouldStop = await poll();
      if (shouldStop) {
        clearInterval(intervalId);
      }
    }, 5000);

    // Return cleanup function
    return () => clearInterval(intervalId);
  },
};