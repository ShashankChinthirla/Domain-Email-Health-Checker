'use client';

import { useState, useEffect, useRef } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { Terminal, ShieldCheck, Activity as ActivityIcon, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';

interface LogEntry {
  id: string;
  timestamp: any;
  level: string;
  message: string;
  module: string;
}

// Security Configuration
const ADMIN_EMAILS = ['shashankshashankc39@gmail.com', 'paybalc06@gmail.com'];

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined means loading
  const router = useRouter();

  // AUTH GUARD LOGIC
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser === null) {
        router.push('/'); // Not logged in
      } else if (currentUser.email && !ADMIN_EMAILS.includes(currentUser.email)) {
        router.push('/'); // Unauthorized User
      } else {
        setUser(currentUser); // Authorized Admin
      }
    });
    return () => unsubscribe();
  }, [router]);

  // LOG FETCHING LOGIC
  useEffect(() => {
    // Only fetch logs if they are the authorized admin
    if (!user || (user.email && !ADMIN_EMAILS.includes(user.email))) return;

    const q = query(
      collection(db, 'automation_logs'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LogEntry[];
      setLogs(newLogs);
    });

    return () => unsubscribe();
  }, [user]);

  // REPORT DOWNLOAD LOGIC
  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch('/api/download-report');
      if (!response.ok) {
        if (response.status === 404) {
          alert('No recent reports found. The automation script may not have finished running yet.');
        } else {
          throw new Error('Failed to fetch report');
        }
        return;
      }

      // Convert response to blob
      const blob = await response.blob();

      // Get filename from header if present, else fallback
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'report.xlsx';
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }

      // Trigger standard browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error("Failed to download report:", error);
      alert("Failed to download the report. Check the console for details.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Calculate Metrics
  // Calculate Analytics safely utilizing Regex to track unique domains
  const processedDomains = new Set<string>();
  const successDomains = new Set<string>();
  const skippedDomains = new Set<string>();
  const errorDomains = new Set<string>();

  logs.forEach(log => {
    const msg = log.message;
    // Extract domain (e.g., example.com)
    const match = msg.match(/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const domain = match ? match[0].toLowerCase() : null;

    if (domain) {
      if (msg.includes('Processing:')) {
        processedDomains.add(domain);
      }
      if (msg.includes('✅') || msg.includes('Updated DMARC') || msg.includes('Updated SPF')) {
        successDomains.add(domain);
      }
      if (msg.includes('⚠️') || msg.toLowerCase().includes('skipped') || msg.includes('No Change Needed')) {
        skippedDomains.add(domain);
      }
      if (log.level === 'ERROR' || msg.includes('❌') || msg.includes('FAILED')) {
        errorDomains.add(domain);
      }
    }
  });

  const totalProcessed = processedDomains.size;
  const totalSuccess = successDomains.size;
  const totalSkipped = skippedDomains.size;
  const totalError = errorDomains.size;

  // Show nothing while checking auth to prevent UI flashes
  if (user === undefined) return <div className="min-h-screen bg-[#09090b]"></div>;
  if (!user || (user.email && !ADMIN_EMAILS.includes(user.email))) return null;

  return (
    <div className="min-h-screen bg-[#09090b] text-white selection:bg-emerald-500/30 font-sans">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 pt-32 pb-24">
        {/* Minimal Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white/50 text-xs font-mono uppercase tracking-[0.2em] mb-4">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-emerald-500">Secure Access Granted</span>
              <span className="text-white/10">|</span>
              <span>{user.email}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white/90">Automation Telemetry</h1>
            <p className="text-white/40 text-sm max-w-2xl">
              Real-time synchronization logs for the Cloudflare DNS update engine.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-[#141417] border border-white/5 p-2 rounded-xl shadow-lg">
            <button
              onClick={handleDownloadReport}
              disabled={isDownloading}
              className="flex items-center gap-2 px-6 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <>
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Generating Secure Link...
                </>
              ) : (
                'Download 24H Excel Report'
              )}
            </button>
          </div>
        </div>

        {/* Executive Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="bg-[#141417] border border-white/5 p-6 rounded-xl shadow-2xl relative overflow-hidden group">
            <p className="text-sm font-medium text-white/40 mb-1">Total Processed (24H)</p>
            <h3 className="text-3xl font-bold text-white tracking-tight">{totalProcessed}</h3>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

          <div className="bg-[#141417] border border-white/5 p-6 rounded-xl shadow-2xl relative overflow-hidden group">
            <p className="text-sm font-medium text-emerald-500/80 mb-1">Successful Updates</p>
            <h3 className="text-3xl font-bold text-emerald-400 tracking-tight">{totalSuccess}</h3>
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

          <div className="bg-[#141417] border border-white/5 p-6 rounded-xl shadow-2xl relative overflow-hidden group">
            <p className="text-sm font-medium text-amber-500/80 mb-1">Skipped / No Change</p>
            <h3 className="text-3xl font-bold text-amber-400 tracking-tight">{totalSkipped}</h3>
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

          <div className="bg-[#141417] border border-white/5 p-6 rounded-xl shadow-2xl relative overflow-hidden group">
            <p className="text-sm font-medium text-rose-500/80 mb-1">Failed / Errors</p>
            <h3 className="text-3xl font-bold text-rose-400 tracking-tight">{totalError}</h3>
            <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>
        </div>

        {/* Professional Data Table */}
        <div className="bg-[#141417] border border-white/5 rounded-xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#1a1a1e]">
            <div className="flex items-center gap-3">
              <Terminal className="w-4 h-4 text-white/40" />
              <span className="text-xs font-bold uppercase tracking-widest text-white/60">Execution Terminal</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/30 font-mono focus:outline-none">
              <span>{logs.length} EVENTS RECORDED</span>
            </div>
          </div>

          <div className="p-0 h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#1a1a1e] z-10 border-b border-white/5">
                <tr className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">
                  <th className="p-4 pl-6 w-32 font-mono">Timestamp</th>
                  <th className="p-4 w-32">Status</th>
                  <th className="p-4 w-40">System</th>
                  <th className="p-4">Execution Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-20 text-center text-white/20 italic text-sm">
                      Waiting for automation engine heartbeat...
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    // Determine styling based on clear keywords in the message or level
                    const isError = log.level === 'ERROR' || log.message.includes('❌') || log.message.includes('FAILED');
                    const isWarning = log.level === 'WARNING' || log.message.includes('⚠️') || log.message.includes('Skipped') || log.message.includes('No Change Needed');
                    const isSuccess = log.message.includes('✅') || log.message.includes('Updated DMARC') || log.message.includes('Updated SPF');

                    return (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="p-4 pl-6 text-[11px] text-white/40 font-mono">
                          {log.timestamp instanceof Timestamp ? log.timestamp.toDate().toLocaleTimeString([], { hour12: false }) : ''}
                        </td>
                        <td className="p-4">
                          {/* Clean Status Badges */}
                          {isError ? (
                            <div className="flex items-center gap-1.5 text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md w-max border border-rose-500/20">
                              <XCircle className="w-3 h-3" />
                              <span className="text-[10px] font-bold tracking-wide uppercase">Failed</span>
                            </div>
                          ) : isWarning ? (
                            <div className="flex items-center gap-1.5 text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md w-max border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              <span className="text-[10px] font-bold tracking-wide uppercase">Skipped</span>
                            </div>
                          ) : isSuccess ? (
                            <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md w-max border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="text-[10px] font-bold tracking-wide uppercase">Success</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-md w-max border border-blue-400/20">
                              <ActivityIcon className="w-3 h-3" />
                              <span className="text-[10px] font-bold tracking-wide uppercase">Info</span>
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-[11px] text-white/40 uppercase tracking-wider">
                          {log.module === 'main' ? 'Engine Core' : log.module || 'System'}
                        </td>
                        <td className="p-4 text-sm text-white/70 group-hover:text-white/90 transition-colors">
                          {/* Strip emojis from raw message for a cleaner look since we have badges now */}
                          {log.message.replace(/[❌⚠️✅🚀🔍🔄📦📡⏭️💾🛑😴✨📤]/g, '').trim()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
