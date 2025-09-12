import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload, Shield, Search, BarChart3, AlertTriangle } from 'lucide-react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import FileUpload from '../components/common/FileUpload';
import { useAppContext } from '../context/AppContext';
import { ForensicCase } from '../types';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { addCase } = useAppContext();
  const [showUpload, setShowUpload] = useState(false);

  // ✅ New flow: only handle EXE download
  const handleDownloadEXE = () => {
    try {
      const link = document.createElement("a");
      link.href = "/checkup.exe";
      link.download = "forensic-analyzer.exe";
      link.click();
    } catch (err) {
      console.error(err);
      alert("Something went wrong while downloading the analyzer.");
    }
  };

  // ✅ Upload JSON results
  const handleJSONUpload = (data: ForensicCase) => {
    addCase(data);
    navigate('/results'); // navigate after upload
  };

  const features = [
    {
      icon: Search,
      title: 'Deep System Scan',
      description: 'Comprehensive analysis of your disk including deleted files and hidden data',
    },
    {
      icon: BarChart3,
      title: 'Visual Analytics',
      description: 'Interactive charts and timelines to understand file activity patterns',
    },
    {
      icon: AlertTriangle,
      title: 'Threat Detection',
      description: 'Advanced algorithms to identify suspicious files and potential security risks',
    },
    {
      icon: Shield,
      title: 'Secure Processing',
      description: 'All analysis is performed locally with enterprise-grade security',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      <Navbar />
      
      <main className="container mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-100 dark:bg-indigo-950/40 rounded-full">
              <Shield className="w-16 h-16 text-blue-600 dark:text-indigo-400" />
            </div>
          </div>
          
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            ForensicaLite
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
            Professional digital forensics analysis tool for comprehensive disk examination, 
            file recovery, and security assessment. Uncover hidden insights with enterprise-grade forensic capabilities.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 hover:shadow-md transition-shadow flex flex-col h-full"
              >
                <div className="p-3 bg-blue-100 dark:bg-indigo-950/40 rounded-lg w-fit mb-4">
                  <Icon className="w-6 h-6 text-blue-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-slate-300 text-sm flex-grow">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Main Actions */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-8">
              Start Your Forensic Analysis
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              {/* EXE Download */}
              <div className="text-center p-6">
                <div className="p-4 bg-blue-100 dark:bg-indigo-950/40 rounded-full w-fit mx-auto mb-4">
                  <Download className="w-8 h-8 text-blue-600 dark:text-indigo-400" />
                </div>
                
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  Step 1: Download Analyzer
                </h3>
                
                <p className="text-gray-600 dark:text-slate-300 mb-6">
                  Download our forensic analyzer tool and run it on your system to generate analysis results.
                </p>
                
                <button
                  onClick={handleDownloadEXE}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors inline-flex items-center space-x-2"
                >
                  <Download className="w-5 h-5" />
                  <span>Download EXE</span>
                </button>
                
                <div className="mt-4 text-sm text-gray-500 dark:text-slate-400">
                  <p>1. Download the analyzer</p>
                  <p>2. Run as administrator</p>
                  <p>3. Locate the generated JSON file</p>
                </div>
              </div>

              {/* Manual Upload */}
              <div className="text-center p-6 border-t md:border-t-0 md:border-l border-gray-200 dark:border-slate-600">
                <div className="p-4 bg-green-100 dark:bg-emerald-950/40 rounded-full w-fit mx-auto mb-4">
                  <Upload className="w-8 h-8 text-green-600 dark:text-emerald-400" />
                </div>
                
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  Step 2: Upload Results
                </h3>
                
                <p className="text-gray-600 dark:text-slate-300 mb-6">
                  Once you have the JSON output from the analyzer, upload it here to view the forensic report.
                </p>
                
                {!showUpload ? (
                  <button
                    onClick={() => setShowUpload(true)}
                    className="bg-green-600 hover:bg-green-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors inline-flex items-center space-x-2"
                  >
                    <Upload className="w-5 h-5" />
                    <span>Upload JSON</span>
                  </button>
                ) : (
                  <div className="mt-4">
                    <FileUpload onUpload={handleJSONUpload} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-16 text-center">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg p-6 max-w-2xl mx-auto">
            <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto mb-3" />
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Important Notice
            </h3>
            <p className="text-amber-800 dark:text-amber-200 text-sm">
              ForensicaLite is designed for legitimate forensic analysis and security assessment purposes only. 
              Ensure you have proper authorization before analyzing any system or data.
            </p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default LandingPage;
