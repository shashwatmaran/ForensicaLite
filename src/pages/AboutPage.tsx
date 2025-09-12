import React from 'react';
import { Shield, Search, Database, Lock, Users } from 'lucide-react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';

const AboutPage: React.FC = () => {
  const features = [
    {
      icon: Search,
      title: 'Advanced Analysis',
      description: 'Deep forensic examination using cutting-edge algorithms to uncover hidden evidence and analyze file systems comprehensively.',
    },
    {
      icon: Database,
      title: 'Data Recovery',
      description: 'Sophisticated deleted file recovery and carving techniques to retrieve critical information from damaged or corrupted storage.',
    },
    {
      icon: Lock,
      title: 'Secure Processing',
      description: 'Enterprise-grade security measures ensure all analysis is performed locally with full data protection and privacy.',
    },
    {
      icon: Users,
      title: 'Professional Grade',
      description: 'Designed by forensic experts for law enforcement, legal professionals, and cybersecurity specialists worldwide.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      <Navbar />
      
      <main className="container mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-100 dark:bg-blue-950/30 rounded-full">
              <Shield className="w-16 h-16 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
            About ForensicaLite
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-slate-400 max-w-3xl mx-auto">
            Professional digital forensics analysis platform designed for comprehensive disk examination, 
            evidence collection, and security assessment by cybersecurity professionals.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700"
              >
                <div className="p-3 bg-blue-100 dark:bg-blue-950/30 rounded-lg w-fit mb-4">
                  <Icon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-slate-400">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Methodology Section */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-8 mb-16">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Our Methodology
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">1</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Data Acquisition</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Secure, forensically sound data acquisition preserving evidence integrity throughout the process.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">2</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Deep Analysis</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Comprehensive examination using advanced algorithms for file carving, timeline analysis, and anomaly detection.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">3</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Report Generation</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Professional forensic reports with detailed findings, visual analytics, and expert recommendations.
              </p>
            </div>
          </div>
        </div>

        

        {/* Disclaimer */}
        <div className="mt-16 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-3">
            Legal Disclaimer
          </h3>
          <div className="text-amber-800 dark:text-amber-200 text-sm space-y-2">
            <p>
              ForensicaLite is intended for legitimate forensic analysis, security assessment, and educational purposes only.
            </p>
            <p>
              Users must ensure they have proper legal authorization before analyzing any system, device, or data.
              Unauthorized access to computer systems and data may violate local, state, and federal laws.
            </p>
            <p>
              The developers and distributors of ForensicaLite are not responsible for any misuse of this software 
              or any legal consequences resulting from its use.
            </p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default AboutPage;