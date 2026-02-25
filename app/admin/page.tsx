'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { ShieldCheck, Activity as ActivityIcon, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Zap, Globe, Search, ChevronLeft, ChevronRight, MoreVertical, LayoutDashboard, Server, TerminalSquare, RefreshCw } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getAdminMetrics, getPaginatedDomains } from '@/app/admin/actions';

interface LogEntry {
  id: string;
  timestamp: any;
  level: string;
  message: string;
  module: string;
}

interface MongoDomain {
  _id: string;
  domain: string;
  status: 'Secure' | 'At Risk' | 'Warning';
  issuesDetected: number;
  timestamp: string | null;
  user?: string;
}

const ADMIN_EMAILS = ['shashankshashankc39@gmail.com', 'paybalc06@gmail.com'];

export default function AdminPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();

  // TABS
  const [activeTab, setActiveTab] = useState<'overview' | 'fleet' | 'automation'>('overview');

  // METRICS STATE
  const [metrics, setMetrics] = useState({ totalDomains: 0, secureCount: 0, atRiskCount: 0, addedToday: 0 });

  // DOMAINS STATE (MongoDB)
  const [domains, setDomains] = useState<MongoDomain[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [issueFilter, setIssueFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDomainsMatching, setTotalDomainsMatching] = useState(0);
  const [isDomainsLoading, setIsDomainsLoading] = useState(true);
  const itemsPerPage = 50;

  // LOGS STATE (Firebase)
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // REPORT DOWNLOAD
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // AUTH GUARD
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser === null) {
        router.push('/');
      } else if (currentUser.email && !ADMIN_EMAILS.includes(currentUser.email)) {
        router.push('/');
      } else {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // FETCH METRICS
  useEffect(() => {
    if (user && ADMIN_EMAILS.includes(user.email!)) {
      getAdminMetrics().then(res => {
        if (res.success) {
          setMetrics({
            totalDomains: res.totalDomains!,
            secureCount: res.secureCount!,
            atRiskCount: res.atRiskCount!,
            addedToday: res.addedToday!
          });
        }
      });
    }
  }, [user]);

  // FETCH DOMAINS
  useEffect(() => {
    if (!user || !ADMIN_EMAILS.includes(user.email!)) return;

    let isMounted = true;
    const fetchDomains = async () => {
      setIsDomainsLoading(true);
      const res = await getPaginatedDomains(searchQuery, issueFilter, currentPage, itemsPerPage);
      if (res.success && isMounted) {
        setDomains(res.domains as MongoDomain[]);
        setTotalPages(res.totalPages!);
        setTotalDomainsMatching(res.totalCount!);
      }
      if (isMounted) setIsDomainsLoading(false);
    };

    const timer = setTimeout(fetchDomains, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [user, searchQuery, issueFilter, currentPage]);

  // FETCH LOGS
  useEffect(() => {
    if (!user || !ADMIN_EMAILS.includes(user.email!)) return;

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


  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      const urlParams = new URLSearchParams();
      if (searchQuery) urlParams.append('query', searchQuery);
      if (issueFilter && issueFilter !== 'All') urlParams.append('filter', issueFilter);

      const response = await fetch(`/api/download-report?${urlParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch report');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'report.xlsx';
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }

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
      alert("Failed to download the report.");
    } finally {
      setIsDownloading(false);
    }
  };

  const [isDownloadingAutomation, setIsDownloadingAutomation] = useState(false);

  const handleDownloadAutomationReport = async () => {
    setIsDownloadingAutomation(true);
    try {
      // The Python script saves reports directly to the 'reports' MongoDB collection
      const response = await fetch('/api/download-automation-report');
      if (!response.ok) {
        throw new Error('Failed to fetch automation report. It might not exist yet.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'latest_automation_report.xlsx';
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error: any) {
      console.error("Failed to download automation report:", error);
      alert(error.message || "Failed to download the automation report.");
    } finally {
      setIsDownloadingAutomation(false);
    }
  };


  const handleSyncCloudflare = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync-cloudflare', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync');
      }

      alert(`Sync Complete! Fetched ${data.totalCloudflareDomains} domains from Cloudflare.\nDiscovered and added ${data.newDomainsAdded} brand new domains for scanning.`);

      // Refresh the current view
      setCurrentPage(1);
      // A quick toggle of the filter to force a re-fetch of the current view
      setIssueFilter(prev => prev);

    } catch (error: any) {
      console.error("Sync failed:", error);
      alert(error.message || "Failed to sync with Cloudflare.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (user === undefined) return <div className="min-h-screen bg-[#09090b]"></div>;
  if (!user || (user.email && !ADMIN_EMAILS.includes(user.email))) return null;

  return (
    <div className="min-h-screen bg-[#09090b] text-white selection:bg-emerald-500/30 font-sans">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 md:px-[3rem] xl:px-6 pt-28 pb-24 space-y-8">
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-700">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-white/50 text-[11px] font-mono uppercase tracking-[0.2em]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500">Secure Administration</span>
              <span className="text-white/10">|</span>
              <span>{user.email}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white/90">Admin Panel</h1>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 bg-[#141417]/80 backdrop-blur-md border border-white/5 p-1.5 rounded-xl shadow-lg ring-1 ring-white/5">
            <button
              onClick={handleSyncCloudflare}
              disabled={isSyncing}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold text-[13px] tracking-tight rounded-lg hover:bg-blue-600/40 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
              {isSyncing ? 'Syncing with CF...' : 'Sync Cloudflare'}
            </button>
            <button
              onClick={handleDownloadReport}
              disabled={isDownloading}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-black font-bold text-[13px] tracking-tight rounded-lg hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin " />
                  Generating Secure Link...
                </>
              ) : (
                'Download Full Audit Report'
              )}
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-px">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-all border-b-2 cursor-pointer",
              activeTab === 'overview' ? "text-white border-white" : "text-white/40 border-transparent hover:text-white/70"
            )}
          >
            <LayoutDashboard className="w-4 h-4" /> Overview
          </button>
          <button
            onClick={() => setActiveTab('fleet')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-all border-b-2 cursor-pointer",
              activeTab === 'fleet' ? "text-blue-400 border-blue-400" : "text-white/40 border-transparent hover:text-white/70"
            )}
          >
            <Server className="w-4 h-4" /> Cloudflare Fleet
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-all border-b-2 cursor-pointer",
              activeTab === 'automation' ? "text-emerald-400 border-emerald-400" : "text-white/40 border-transparent hover:text-white/70"
            )}
          >
            <TerminalSquare className="w-4 h-4" /> Automation Monitor
          </button>
        </div>


        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* HERO METRICS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-b from-[#141417] to-black/40 border border-white/5 p-4 rounded-2xl shadow-xl relative overflow-hidden group">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-bold tracking-wider uppercase text-white/40">Total Domains in Cloudflare</p>
                  <Globe className="w-4 h-4 text-blue-500/50" />
                </div>
                <h3 className="text-3xl font-black text-white tracking-tighter">{metrics.totalDomains}</h3>
                <p className="text-xs text-white/30 mt-2 font-medium">Distinct domains traced</p>
              </div>

              <div className="bg-gradient-to-b from-[#141417] to-black/40 border border-emerald-500/10 p-4 rounded-2xl shadow-xl relative overflow-hidden group">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-bold tracking-wider uppercase text-emerald-500/80">Updated Domains</p>
                  <Zap className="w-4 h-4 text-emerald-500/50" />
                </div>
                <h3 className="text-3xl font-black text-emerald-400 tracking-tighter">{metrics.secureCount}</h3>
                <p className="text-xs text-emerald-500/40 mt-2 font-medium">Successfully processed/secure</p>
              </div>

              <div className="bg-gradient-to-b from-[#141417] to-black/40 border border-white/5 p-4 rounded-2xl shadow-xl relative overflow-hidden group">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-bold tracking-wider uppercase text-white/40">Added Today</p>
                  <ActivityIcon className="w-4 h-4 text-amber-500/50" />
                </div>
                <h3 className="text-3xl font-black text-white tracking-tighter">+{metrics.addedToday}</h3>
                <p className="text-xs text-white/30 mt-2 font-medium">Domains added in past 24 hrs</p>
              </div>

              <div className="bg-gradient-to-b from-rose-950/20 to-black/40 border border-rose-500/20 p-4 rounded-2xl shadow-xl relative overflow-hidden group">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-bold tracking-wider uppercase text-rose-400/90">Issues Domains</p>
                  <ShieldAlert className="w-4 h-4 text-rose-500/80" />
                </div>
                <h3 className="text-3xl font-black text-rose-400 tracking-tighter">{metrics.atRiskCount}</h3>
                <p className="text-[11px] text-rose-400/50 mt-2 font-medium leading-tight">Missing DMARC, Blacklists, etc.</p>
              </div>
            </div>

            {/* QUICK ACTIONS OVERVIEW */}
            <div className="bg-[#141417]/80 backdrop-blur-md border border-white/10 p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-white/90 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    System Status Normal
                  </h3>
                  <p className="text-sm text-white/40 mt-1">All {metrics.totalDomains} domains successfully ingested into local DB.</p>
                </div>
                <button
                  onClick={() => setActiveTab('fleet')}
                  className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors shadow-lg cursor-pointer"
                >
                  View All Domains in Fleet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CLOUDFLARE FLEET */}
        {activeTab === 'fleet' && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-500">
            {/* Table Header Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-gray-200 bg-gray-50/50 gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search among 12k+ domains..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1); // Reset page on new search
                    }}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow text-gray-900 placeholder:text-gray-400"
                  />
                </div>
                <select
                  value={issueFilter}
                  onChange={(e) => {
                    setIssueFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full sm:w-48 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 cursor-pointer"
                >
                  <option value="All">All Domains</option>
                  <option value="Clean">✅ Clean</option>
                  <option value="Needs_Scan">⏳ Needs Scan (New)</option>
                  <option value="blacklist_issue">🚨 Blacklist Issues</option>
                  <option value="http_issue">🌐 HTTP Issues</option>
                  <option value="No_SPF_AND_DMARC">❌ Missing SPF & DMARC</option>
                  <option value="No_DMARC_Only">⚠️ Missing DMARC</option>
                  <option value="No_SPF_Only">⚠️ Missing SPF</option>
                  <option value="DKIM_Issues">🔑 DKIM Issues</option>
                  <option value="Multiple_SPF">📄 Multiple SPF Records</option>
                  <option value="Multiple_DMARC">📄 Multiple DMARC Records</option>
                  <option value="DMARC_Policy_None">🛡️ DMARC Policy None</option>
                </select>
              </div>
              <div className="text-xs text-gray-400 font-medium">
                Showing {totalDomainsMatching} results
              </div>
            </div>

            {/* The Data Table */}
            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white border-b border-gray-200">
                  <tr className="text-[12px] text-gray-500 font-semibold tracking-wide">
                    <th className="p-4 pl-6 font-medium">Domain Name</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Owner</th>
                    <th className="p-4 font-medium">Issues Detected</th>
                    <th className="p-4 font-medium hidden md:table-cell">Last Scanned</th>
                    <th className="p-4 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white relative">
                  {isDomainsLoading && (
                    <tr className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                      <td><div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /></td>
                    </tr>
                  )}
                  {domains.length === 0 && !isDomainsLoading ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-gray-400 text-sm">
                        No domains found matching your search.
                      </td>
                    </tr>
                  ) : (
                    domains.map((entity) => (
                      <tr key={entity._id} className="hover:bg-gray-50/80 transition-colors group cursor-pointer" onClick={() => router.push(`/?domain=${entity.domain}`)}>
                        <td className="p-4 pl-6 text-[14px] font-bold text-blue-600 hover:text-blue-700 hover:underline decoration-blue-300 underline-offset-4">
                          {entity.domain}
                        </td>
                        <td className="p-4">
                          {entity.status === 'Secure' ? (
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[13px] border-b border-gray-300 border-dashed pb-[1px]">Active</span>
                            </div>
                          ) : entity.status === 'At Risk' || entity.issuesDetected > 0 ? (
                            <div className="flex items-center gap-1.5 text-rose-600">
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span className="text-[13px] font-medium">At Risk</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-amber-600">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-[13px] font-medium">Warning</span>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          {entity.user ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[11px] font-bold shadow-sm shrink-0">
                                {entity.user.charAt(0).toUpperCase()}
                              </div>
                              <a
                                href={`mailto:${entity.user}?subject=Security Update Required for ${entity.domain}`}
                                className="text-[13px] text-gray-700 font-semibold hover:text-blue-600 hover:underline transition-colors break-all"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {entity.user}
                              </a>
                            </div>
                          ) : (
                            <span className="text-[12px] text-gray-400 font-medium italic bg-gray-100 px-2 py-0.5 rounded-md">
                              Unknown
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            "text-[13px] font-bold",
                            entity.issuesDetected > 0 ? "text-rose-600" : "text-gray-400 font-medium"
                          )}>
                            {entity.issuesDetected > 0 ? entity.issuesDetected : '0'}
                          </span>
                        </td>
                        <td className="p-4 hidden md:table-cell text-[13px] text-gray-500">
                          <div className="flex items-center gap-2">
                            <ActivityIcon className="w-3.5 h-3.5 text-gray-300" />
                            {entity.timestamp ? new Date(entity.timestamp).toLocaleDateString() : 'Unknown'}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <button className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors cursor-pointer" onClick={(e) => { e.stopPropagation(); }}>
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Cloudflare-Style Footer Pagination */}
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50/50">
              <div className="text-[13px] font-medium text-gray-500">
                {totalDomainsMatching > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, totalDomainsMatching)} of {totalDomainsMatching} items
              </div>
              <div className="flex items-center gap-4 text-[13px] font-medium text-gray-700">
                <span>Page {currentPage} of {totalPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUTOMATION MONITOR (Logs) */}
        {activeTab === 'automation' && (
          <div className="bg-[#1c1c1e] border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            <div className="p-6 border-b border-white/5 bg-[#252529]/30 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <TerminalSquare className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white/90">Automation Terminal Feed</h2>
                  <p className="text-xs text-white/40 mt-0.5">Live execution logs from Python workers</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleDownloadAutomationReport}
                  disabled={isDownloadingAutomation}
                  className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isDownloadingAutomation ? 'Fetching Latest...' : 'Download Latest Run Report'}
                </button>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded-full border border-white/5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest">Live Sync</span>
                </div>
              </div>
            </div>

            <div className="p-0 overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-[#3a3a3e] scrollbar-track-transparent">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#252529] sticky top-0 shadow-md backdrop-blur-md border-b border-white/5 z-10">
                  <tr className="text-white/40 uppercase tracking-wider text-[10px] font-bold">
                    <th className="p-4 pl-6 font-medium">Timestamp</th>
                    <th className="p-4 font-medium">Level</th>
                    <th className="p-4 font-medium">Module</th>
                    <th className="p-4 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-white/30 text-sm">
                        Waiting for automation telemetry data...
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const date = log.timestamp instanceof Timestamp ? log.timestamp.toDate() : new Date();
                      return (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                          <td className="p-4 pl-6 text-white/40 text-[12px] whitespace-nowrap">
                            {date.toLocaleTimeString()} <span className="text-white/20 ml-1">{date.toLocaleDateString()}</span>
                          </td>
                          <td className="p-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold tracking-wider",
                              log.level === 'ERROR' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                                log.level === 'WARNING' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                                  log.level === 'SUCCESS' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                    "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            )}>
                              {log.level}
                            </span>
                          </td>
                          <td className="p-4 text-white/60 text-[12px] whitespace-nowrap">{log.module || 'SYSTEM'}</td>
                          <td className="p-4 text-white/80 text-[13px] break-words">
                            <div className="flex items-start gap-2">
                              {log.level === 'ERROR' && <XCircle className="w-4 h-4 text-rose-500/80 shrink-0 mt-0.5" />}
                              {log.level === 'WARNING' && <AlertTriangle className="w-4 h-4 text-amber-500/80 shrink-0 mt-0.5" />}
                              {log.level === 'SUCCESS' && <CheckCircle2 className="w-4 h-4 text-emerald-500/80 shrink-0 mt-0.5" />}
                              {log.level === 'INFO' && <ActivityIcon className="w-4 h-4 text-blue-500/80 shrink-0 mt-0.5" />}
                              <span className="leading-snug">{log.message}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
