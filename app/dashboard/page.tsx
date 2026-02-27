'use client';

import { useState, useEffect, Suspense } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { ShieldCheck, Activity as ActivityIcon, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Zap, Globe, Search, ChevronLeft, ChevronRight, MoreVertical, LayoutDashboard, Server, TerminalSquare, RefreshCw, Play } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getDashboardMetrics, getPaginatedDomains, getPendingDomains } from '@/app/dashboard/actions';
import { getUserSettings } from '@/app/settings/actions';
import { getUserIntegrations, IntegrationDTO } from '@/app/settings/integrations-actions';
import { UserSettings, DEFAULT_SETTINGS } from '@/app/settings/types';

interface LogEntry {
  id: string;
  timestamp: unknown;
  level: string;
  message: string;
  module: string;
}

interface MongoDomain {
  _id: string;
  domain: string;
  status: 'Secure' | 'At Risk' | 'Warning' | 'Pending';
  issuesDetected: number;
  timestamp: string | null;
  user?: string;
  issueCategory?: string;
  issues?: {
    spf?: string;
    dmarc?: string;
    dkim?: string;
    blacklist?: string;
    web?: string;
  };
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090b]"></div>}>
      <UserDashboardContent />
    </Suspense>
  );
}

function UserDashboardContent() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // TABS
  const activeTabParam = searchParams.get('tab') as 'overview' | 'actions' | 'fleet' | 'automation' | null;
  const activeTab = activeTabParam && ['overview', 'actions', 'fleet', 'automation'].includes(activeTabParam) ? activeTabParam : 'overview';

  // DOMAINS STATE (MongoDB)
  const searchQuery = searchParams.get('q') || '';
  const issueFilter = searchParams.get('filter') || 'All';
  const integrationFilter = searchParams.get('integration') || 'All';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = isNaN(pageParam) ? 1 : pageParam;

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  // METRICS STATE
  const [metrics, setMetrics] = useState({ totalDomains: 0, secureCount: 0, atRiskCount: 0, addedToday: 0, pendingCount: 0 });
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [integrations, setIntegrations] = useState<IntegrationDTO[]>([]);

  const getEmailLink = (domain: MongoDomain) => {
    if (!domain.user) return '#';
    const ownerEmail = domain.user;

    let subject = "";
    let finalMessage = "";

    // Build the dynamic issue context based on what was actually flagged
    const issuesList: string[] = [];
    if (domain.issues) {
      const { spf, dmarc, dkim, blacklist, web } = domain.issues;

      if (blacklist && blacklist.includes("ERROR")) {
        issuesList.push("- Your domain/IP is currently listed on major email blacklists, which will cause your outgoing emails to bounce or land in spam folders.");
      }
      if (spf && spf.toLowerCase().includes("no spf")) {
        issuesList.push("- Your domain is missing an SPF record, making it trivial for attackers to spoof your email address.");
      } else if (spf && spf.toLowerCase().includes("multiple")) {
        issuesList.push("- Your domain has multiple conflicting SPF records, which invalidates your security policies.");
      }
      if (dmarc && dmarc.toLowerCase().includes("no dmarc")) {
        issuesList.push("- Your domain is missing a DMARC record, meaning you have no visibility or control over spoofed emails sent on your behalf.");
      }
      if (dkim && dkim.includes("ERROR")) {
        issuesList.push("- We detected issues with your DKIM email signing configuration.");
      }
      if (web && web.includes("ERROR")) {
        issuesList.push("- Your primary web server is unreachable or returning critical HTTP errors.");
      }
    }

    if (issuesList.length > 0) {
      subject = `Action Required: Security Update for ${domain.domain}`;
      const dynamicContext = "\n\nSpecifically, our automated scan detected the following:\n" + issuesList.join('\n');
      finalMessage = userSettings.messageTemplate + dynamicContext;
    } else {
      subject = `Security Audit Results for ${domain.domain}`;
      finalMessage = `Hi,\n\nI recently ran a security audit on your domain (${domain.domain}) and I wanted to personally reach out and say great job.\n\nYour SPF, DMARC, and DKIM records are perfectly configured and your domain is completely secure against spoofing attacks. Your email infrastructure is in excellent health!`;
    }

    // Base template from settings + injected dynamic context
    let bodyText = finalMessage;

    if (userSettings.senderName || userSettings.senderTitle || userSettings.senderPhone) {
      bodyText += '\n\n---\n';
      if (userSettings.senderName) bodyText += `${userSettings.senderName}\n`;
      if (userSettings.senderTitle) bodyText += `${userSettings.senderTitle}\n`;
      if (userSettings.senderPhone) bodyText += `${userSettings.senderPhone}\n`;
    }
    const subjectEncoded = encodeURIComponent(subject);
    const bodyEncoded = encodeURIComponent(bodyText);

    if (userSettings.emailClient === 'gmail') {
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${ownerEmail}&su=${subjectEncoded}&body=${bodyEncoded}`;
    } else if (userSettings.emailClient === 'outlook') {
      return `https://outlook.live.com/mail/0/deeplink/compose?to=${ownerEmail}&subject=${subjectEncoded}&body=${bodyEncoded}`;
    }
    return `mailto:${ownerEmail}?subject=${subjectEncoded}&body=${bodyEncoded}`;
  };

  const [domains, setDomains] = useState<MongoDomain[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDomainsMatching, setTotalDomainsMatching] = useState(0);
  const [isDomainsLoading, setIsDomainsLoading] = useState(true);
  const itemsPerPage = 50;

  const [refreshKey, setRefreshKey] = useState(0);

  const updateUrlParams = (updates: Record<string, string | null>) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        current.delete(key);
      } else {
        current.set(key, value);
      }
    });
    const search = current.toString();
    const queryStr = search ? `?${search}` : '';
    router.push(`${pathname}${queryStr}`, { scroll: false });
  };

  const setActiveTab = (tab: 'overview' | 'actions' | 'fleet' | 'automation') => updateUrlParams({ tab });
  const setSearchQuery = (q: string) => updateUrlParams({ q: q || null, page: null });
  const setIssueFilter = (f: string | ((prev: string) => string)) => {
    const newFilter = typeof f === 'function' ? f(issueFilter) : f;
    updateUrlParams({ filter: newFilter === 'All' ? null : newFilter, page: null });
  };
  const setIntegrationFilter = (i: string) => updateUrlParams({ integration: i === 'All' ? null : i, page: null });
  const setCurrentPage = (p: number) => updateUrlParams({ page: p > 1 ? p.toString() : null });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearchQuery !== searchQuery) {
        setSearchQuery(localSearchQuery);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearchQuery, searchQuery]);

  // AUTO-REFRESH BACKGROUND POLLING
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 15000); // 15 seconds
    return () => clearInterval(interval);
  }, [user]);

  // LOGS STATE (Firebase)
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // REPORT DOWNLOAD
  const [isDownloading, setIsDownloading] = useState(false);

  // --- PERSISTENT STATE WRAPPERS ---
  const [isSyncing, setIsSyncingState] = useState(false);
  const [isScanningNew, setIsScanningNewState] = useState(false);
  const [scanProgress, setScanProgressState] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsSyncingState(sessionStorage.getItem('isSyncing') === 'true');
      setIsScanningNewState(sessionStorage.getItem('isScanningNew') === 'true');
      const savedProgress = sessionStorage.getItem('scanProgress');
      if (savedProgress) {
        try { setScanProgressState(JSON.parse(savedProgress)); } catch (e) { }
      }
    }
  }, []);

  const setIsSyncing = (val: boolean) => {
    setIsSyncingState(val);
    if (typeof window !== 'undefined') sessionStorage.setItem('isSyncing', String(val));
  };

  const setIsScanningNew = (val: boolean) => {
    setIsScanningNewState(val);
    if (typeof window !== 'undefined') sessionStorage.setItem('isScanningNew', String(val));
  };

  const setScanProgress = (val: React.SetStateAction<{ current: number, total: number }>) => {
    setScanProgressState(prev => {
      const next = typeof val === 'function' ? (val as (prevState: { current: number, total: number }) => { current: number, total: number })(prev) : val;
      if (typeof window !== 'undefined') sessionStorage.setItem('scanProgress', JSON.stringify(next));
      return next;
    });
  };
  // ---------------------------------

  // AUTH GUARD
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser === null) {
        router.push('/');
      } else if (currentUser.email) {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // FETCH SETTINGS & INTEGRATIONS
  useEffect(() => {
    if (user) {
      const fetchInitialData = async () => {
        try {
          const token = await user.getIdToken();
          const settingsRes = await getUserSettings(token);
          if (settingsRes.success && settingsRes.settings) setUserSettings(settingsRes.settings);

          const integrationsRes = await getUserIntegrations(token);
          if (integrationsRes.success && integrationsRes.integrations) setIntegrations(integrationsRes.integrations);
        } catch (error) {
          console.error("Error fetching initial settings/integrations:", error);
        }
      };
      fetchInitialData();
    }
  }, [user]);

  // FETCH METRICS
  useEffect(() => {
    if (user) {
      const fetchMetrics = async () => {
        try {
          const token = await user.getIdToken();
          const res = await getDashboardMetrics(token, integrationFilter);
          if (res.success) {
            setMetrics({
              totalDomains: res.totalDomains!,
              secureCount: res.secureCount!,
              atRiskCount: res.atRiskCount!,
              addedToday: res.addedToday!,
              pendingCount: res.pendingCount!
            });
          }
        } catch (error) {
          console.error("Error fetching metrics:", error);
        }
      };
      fetchMetrics();
    }
  }, [user, integrationFilter, refreshKey]);

  // FETCH DOMAINS
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const fetchDomains = async () => {
      try {
        if (domains.length === 0) setIsDomainsLoading(true);
        const token = await user.getIdToken();
        const res = await getPaginatedDomains(token, searchQuery, issueFilter, integrationFilter, currentPage, itemsPerPage);
        if (res.success && isMounted) {
          setDomains(res.domains as MongoDomain[]);
          setTotalPages(res.totalPages!);
          setTotalDomainsMatching(res.totalCount!);
        }
      } catch (error) {
        console.error("Error fetching domains:", error);
      } finally {
        if (isMounted) setIsDomainsLoading(false);
      }
    };

    const timer = setTimeout(fetchDomains, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };

  }, [user, searchQuery, issueFilter, integrationFilter, currentPage, refreshKey]);

  // FETCH LOGS
  useEffect(() => {
    if (!user) return;

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
    if (!user) return;
    setIsDownloading(true);
    try {
      const urlParams = new URLSearchParams();
      if (searchQuery) urlParams.append('query', searchQuery);
      if (issueFilter && issueFilter !== 'All') urlParams.append('filter', issueFilter);

      const token = await user.getIdToken();
      const response = await fetch(`/api/download-report?${urlParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
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
    if (!user) return;
    setIsDownloadingAutomation(true);
    try {
      // The Python script saves reports directly to the 'reports' MongoDB collection
      const urlParams = new URLSearchParams();
      const token = await user.getIdToken();

      const response = await fetch(`/api/download-automation-report?${urlParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
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

    } catch (error: unknown) {
      console.error("Failed to download automation report:", error);
      alert(error instanceof Error ? error.message : "Failed to download the automation report.");
    } finally {
      setIsDownloadingAutomation(false);
    }
  };


  const handleSyncCloudflare = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/sync-cloudflare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync');
      }

      alert(`Sync Complete! Fetched ${data.totalCloudflareDomains} domains from Cloudflare.\nDiscovered and added ${data.newDomainsAdded} brand new domains for scanning.`);

      // Refresh the current view
      setCurrentPage(1);
      // Force a re-fetch manually
      setRefreshKey(prev => prev + 1);

    } catch (error: unknown) {
      console.error("Sync failed:", error);
      alert(error instanceof Error ? error.message : "Failed to sync with Cloudflare.");
    } finally {
      setIsSyncing(false);
    }
  };

  // (isScanningNew & scanProgress states moved to global persistent wrappers at top)
  const handleScanNewDomains = async () => {
    if (!user?.email) return;

    if (metrics.pendingCount === 0) {
      alert("No domains are pending a scan right now.");
      return;
    }

    setIsScanningNew(true);
    setScanProgress({ current: 0, total: metrics.pendingCount });

    try {
      // Hit the GitHub trigger API instead of doing it securely in browser
      const token = await user.getIdToken();
      const response = await fetch('/api/trigger-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        setIsScanningNew(false);
        if (response.status === 401) {
          alert(`Setup Required: ${data.error}\n\nPlease add your GitHub PAT to Vercel/local env.`);
          return;
        }
        throw new Error(data.error || 'Failed to trigger cloud scan');
      }

      // Do nothing! The useEffect polling hook will now take over and track progress.

    } catch (err: any) {
      alert(`Error scanning domains: ${err.message}`);
      setIsScanningNew(false);
    }
  };

  const [isCancelling, setIsCancelling] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'sync' | 'scan' | 'fix' | 'export'>('sync');

  const handleCancelScan = async () => {
    if (!user) return;
    if (!confirm("Are you sure you want to send a kill signal to the distributed scanning matrix? This will stop all running runners.")) return;

    setIsCancelling(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/cancel-scan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel cloud scan');
      }

      alert(`✅ Success: ${data.message}`);
      setIsScanningNew(false);
      setScanProgress({ current: 0, total: 0 });
      setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      alert(`Error cancelling scan: ${err.message}`);
    } finally {
      setIsCancelling(false);
    }
  };

  // POLLING FOR GITHUB ACTION SCAN PROGRESS
  useEffect(() => {
    if (!isScanningNew || !user?.email) return;

    const interval = setInterval(async () => {
      const token = await user.getIdToken();
      getDashboardMetrics(token, integrationFilter).then(res => {
        if (res.success) {
          setMetrics(prev => ({
            ...prev,
            totalDomains: res.totalDomains!,
            secureCount: res.secureCount!,
            atRiskCount: res.atRiskCount!,
            addedToday: res.addedToday!,
            pendingCount: res.pendingCount!
          }));

          setRefreshKey(prev => prev + 1);

          setScanProgress(prev => ({
            ...prev,
            current: prev.total - res.pendingCount!
          }));

          if (res.pendingCount === 0) {
            setIsScanningNew(false);
            setScanProgress({ current: 0, total: 0 });
            alert("✅ Cloud Scan Complete! All domains have been processed.");
          }
        }
      });
    }, 4000); // Poll every 4 seconds

    return () => clearInterval(interval);
  }, [isScanningNew, user, integrationFilter]);

  const [isRemediating, setIsRemediating] = useState<string | null>(null);
  const [isRemediatingBulk, setIsRemediatingBulk] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);

  const isDomainFixable = (domain: MongoDomain) => {
    if (domain.status === 'Secure') return false;

    const hasSpfIssue = domain.issues?.spf && (domain.issues.spf.includes('ERROR') || domain.issues.spf.includes('WARNING') || domain.issues.spf.includes('Multiple') || domain.issues.spf.includes('No SPF'));
    const hasDmarcIssue = domain.issues?.dmarc && (domain.issues.dmarc.includes('ERROR') || domain.issues.dmarc.includes('WARNING') || domain.issues.dmarc.includes('Multiple') || domain.issues.dmarc.includes('No DMARC') || domain.issues.dmarc.includes('none'));

    return !!(hasSpfIssue || hasDmarcIssue);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const fixable = domains.filter(d => isDomainFixable(d)).map(d => d._id);
      setSelectedDomains(fixable);
    } else {
      setSelectedDomains([]);
    }
  };

  const handleSelectDomain = (id: string) => {
    setSelectedDomains(prev =>
      prev.includes(id) ? prev.filter(dId => dId !== id) : [...prev, id]
    );
  };

  const handleBulkRemediate = async () => {
    if (!user || selectedDomains.length === 0) return;

    if (!confirm(`Are you sure you want to attempt auto-remediation for ${selectedDomains.length} domains?`)) return;

    setIsRemediatingBulk(true);
    let successCount = 0;

    // Process in parallel with a small concurrency limit for safety, but Promise.all is fine for MVP
    await Promise.allSettled(
      selectedDomains.map(async (domainId) => {
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/remediate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ domainId }),
          });
          if (response.ok) successCount++;
        } catch (e) {
          console.error(`Failed to remediate ${domainId}`, e);
        }
      })
    );

    setIsRemediatingBulk(false);
    setSelectedDomains([]);
    alert(`Bulk Remediation Complete! Successfully fixed ${successCount} out of ${selectedDomains.length} domains.`);
    setRefreshKey(prev => prev + 1);
  };

  const handleRemediate = async (domainId: string, domainName: string) => {
    if (!user) return;

    setIsRemediating(domainId);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/remediate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ domainId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remediate domain');
      }

      alert(`✅ Success: ${data.message}`);

      // Auto-refresh the dashboard to show the clean status
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error('Remediation error:', error);
      alert(`❌ Error fixing ${domainName}: ${error.message}`);
    } finally {
      setIsRemediating(null);
    }
  };

  if (user === undefined) return <div className="min-h-screen bg-[#09090b]"></div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#09090b] text-white selection:bg-emerald-500/30 font-sans">
      <Navbar />

      <main className="w-[calc(100%-3rem)] max-w-7xl mx-auto px-6 pt-28 pb-24 space-y-8 relative z-10">
        <style>{`
          .custom-email-link:hover { text-decoration: underline !important; text-decoration-color: black !important; text-decoration-thickness: 1px !important; color: black !important; border-bottom: none !important; }
        `}</style>

        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-700">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-white/50 text-[11px] font-mono uppercase tracking-[0.2em]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500">Secure Administration</span>
              <span className="text-white/10">|</span>
              <span>{user.email}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white/90">Dashboard</h1>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 bg-[#141417]/0 p-1.5 rounded-xl">
            {integrations.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-medium text-white/50 uppercase tracking-widest">API Connection:</span>
                <select
                  value={integrationFilter}
                  onChange={(e) => setIntegrationFilter(e.target.value)}
                  className="w-full sm:w-48 px-3 py-2 text-sm bg-[#141417] border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-white cursor-pointer shadow-sm truncate"
                >
                  <option value="All">All Connections</option>
                  {integrations.map(int => (
                    <option key={int.id} value={int.id}>{int.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex overflow-x-auto items-center gap-2 border-b border-white/10 pb-px mb-6 scrollbar-hide">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap",
              activeTab === 'overview' ? "text-white border-white font-medium" : "text-white/50 border-transparent hover:text-white"
            )}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" /> Overview
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap",
              activeTab === 'actions' ? "text-white border-white font-medium" : "text-white/50 border-transparent hover:text-white"
            )}
          >
            <Zap className="w-4 h-4 shrink-0" /> Action Center
          </button>
          <button
            onClick={() => setActiveTab('fleet')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap",
              activeTab === 'fleet' ? "text-white border-white font-medium" : "text-white/50 border-transparent hover:text-white"
            )}
          >
            <Server className="w-4 h-4 shrink-0" /> Cloudflare Fleet
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap",
              activeTab === 'automation' ? "text-white border-white font-medium" : "text-white/50 border-transparent hover:text-white"
            )}
          >
            <TerminalSquare className="w-4 h-4 shrink-0" /> Automation Monitor
          </button>
        </div>


        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {integrations.length === 0 && !isDomainsLoading ? (
              <div className="bg-[#141417] border border-white/10 p-12 rounded-3xl text-center shadow-xl flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mb-6">
                  <Server className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">No Integrations Connected</h3>
                <p className="text-white/50 max-w-md leading-relaxed mb-8">
                  You haven't connected any API keys yet. To start scanning and managing domains, please connect a Cloudflare integration in your settings.
                </p>
                <button
                  onClick={() => router.push('/settings')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-500/20"
                >
                  Go to Settings Config
                </button>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}

        {/* TAB 2: ACTION CENTER (MASTER-DETAIL UI) */}
        {activeTab === 'actions' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex border border-white/10 rounded-xl overflow-hidden min-h-[500px] bg-[#09090b]">

              {/* SIDEBAR (MASTER) */}
              <div className="w-64 bg-[#09090b] border-r border-white/10 flex flex-col shrink-0 relative z-20">
                <div className="p-6 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white tracking-tight">System Actions</h2>
                </div>

                <div className="flex flex-col p-3 space-y-1">
                  <button
                    onClick={() => setSelectedAction('sync')}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all",
                      selectedAction === 'sync' ? "bg-white/10 text-white font-medium" : "text-white/50 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <RefreshCw className="w-4 h-4 shrink-0" />
                    <span>Sync Cloudflare</span>
                  </button>

                  <button
                    onClick={() => setSelectedAction('scan')}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all",
                      selectedAction === 'scan' ? "bg-white/10 text-white font-medium" : "text-white/50 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Play className="w-4 h-4 shrink-0" />
                    <span>Hyper-Scan</span>
                  </button>

                  <button
                    onClick={() => setSelectedAction('fix')}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all",
                      selectedAction === 'fix' ? "bg-white/10 text-white font-medium" : "text-white/50 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Bulk Remediate</span>
                  </button>

                  <button
                    onClick={() => setSelectedAction('export')}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all",
                      selectedAction === 'export' ? "bg-white/10 text-white font-medium" : "text-white/50 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Search className="w-4 h-4 shrink-0" />
                    <span>Data Extraction</span>
                  </button>
                </div>
              </div>

              {/* CONTENT (DETAIL) */}
              <div className="flex-1 bg-[#09090b] relative overflow-hidden flex flex-col items-center justify-center p-12">
                <div className="w-full max-w-lg">

                  {/* DETAIL VIEW: SYNC */}
                  {selectedAction === 'sync' && (
                    <div className="flex flex-col text-left">
                      <h3 className="text-2xl font-semibold text-white mb-2 tracking-tight">Sync Cloudflare Fleet</h3>
                      <p className="text-white/60 text-sm mb-8">
                        Connect to your active Cloudflare integrations and pull the latest domain zones. Discovered domains will be added to your queue.
                      </p>
                      <button
                        onClick={handleSyncCloudflare}
                        disabled={isSyncing}
                        className="h-10 px-4 bg-white hover:bg-zinc-200 text-black text-sm font-medium rounded-md transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer self-start flex items-center gap-2"
                      >
                        {isSyncing && <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />}
                        {isSyncing ? 'Syncing...' : 'Initiate Sync Queue'}
                      </button>
                    </div>
                  )}

                  {/* DETAIL VIEW: SCAN */}
                  {selectedAction === 'scan' && (
                    <div className="flex flex-col text-left">
                      <h3 className="text-2xl font-semibold text-white mb-2 tracking-tight">Hyper-Scan Distributed Matrix</h3>
                      <p className="text-white/60 text-sm mb-8">
                        Spin up the distributed scan engine to resolve DNS records for all pending domains in parallel.
                      </p>

                      <div className="w-full border border-white/10 bg-white/[0.02] rounded-lg p-5 mb-8">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-sm font-medium text-white/50">Queue Status</span>
                          <span className={cn("text-xs font-medium px-2 py-1 rounded-full", isScanningNew || metrics.pendingCount > 0 ? "bg-white/10 text-white" : "text-white/40")}>
                            {isScanningNew || metrics.pendingCount > 0 ? 'Processing' : 'Idle'}
                          </span>
                        </div>
                        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-white transition-all duration-500"
                            style={{ width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : (metrics.totalDomains > 0 ? ((metrics.totalDomains - metrics.pendingCount) / metrics.totalDomains) * 100 : 0)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-white/40">
                          <span>{scanProgress.total > 0 ? scanProgress.current : Math.max(0, metrics.totalDomains - metrics.pendingCount)} Processed</span>
                          <span>{scanProgress.total > 0 ? scanProgress.total : metrics.totalDomains} Total Domains</span>
                        </div>
                      </div>

                      {isScanningNew ? (
                        <button
                          onClick={handleCancelScan}
                          disabled={isCancelling}
                          className="h-10 px-4 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-500 text-sm font-medium rounded-md transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer self-start flex items-center gap-2"
                        >
                          {isCancelling && <div className="w-3.5 h-3.5 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />}
                          {isCancelling ? 'Terminating...' : 'Stop Execution'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleScanNewDomains()}
                          disabled={metrics.pendingCount === 0 || isSyncing}
                          className="h-10 px-4 bg-white hover:bg-zinc-200 text-black text-sm font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer self-start flex items-center gap-2"
                        >
                          {metrics.pendingCount === 0 ? "Queue Empty" : "Execute Matrix Scan"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* DETAIL VIEW: FIX */}
                  {selectedAction === 'fix' && (
                    <div className="flex flex-col text-left">
                      <h3 className="text-2xl font-semibold text-white mb-2 tracking-tight">Automated Bulk Remediation</h3>
                      <p className="text-white/60 text-sm mb-8">
                        Deploy correct SPF and DMARC policies into the DNS zones for all <span className="text-white font-medium">{selectedDomains.length}</span> selected domains.
                      </p>

                      <div className="w-full border border-white/10 bg-white/[0.02] rounded-lg p-5 mb-8">
                        <p className="text-xs font-mono text-white/50 mb-2">TARGET PAYLOAD</p>
                        <p className="text-sm font-mono text-white/80">SPF: v=spf1 include:_spf.google.com ~all</p>
                        <p className="text-sm font-mono text-white/80 mt-1">DMARC: v=DMARC1; p=reject; pct=100; ...</p>
                      </div>

                      <button
                        onClick={handleBulkRemediate}
                        disabled={isRemediatingBulk || selectedDomains.length === 0}
                        className="h-10 px-4 bg-white hover:bg-zinc-200 text-black text-sm font-medium rounded-md transition-all disabled:opacity-50 cursor-pointer self-start"
                      >
                        {isRemediatingBulk ? 'Deploying...' : `Apply Fix (${selectedDomains.length} targets)`}
                      </button>
                    </div>
                  )}

                  {/* DETAIL VIEW: EXPORT */}
                  {selectedAction === 'export' && (
                    <div className="flex flex-col text-left">
                      <h3 className="text-2xl font-semibold text-white mb-2 tracking-tight">Data Extraction</h3>
                      <p className="text-white/60 text-sm mb-8">
                        Generate and download an Excel export containing all domain states, vulnerabilities, and raw TXT records.
                      </p>
                      <button
                        onClick={handleDownloadReport}
                        disabled={isDownloading}
                        className="h-10 px-4 border border-white/20 hover:bg-white/5 text-white text-sm font-medium rounded-md transition-all disabled:opacity-50 cursor-pointer self-start"
                      >
                        {isDownloading ? 'Building Excel...' : 'Download Full Report'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: CLOUDFLARE FLEET */}
        {activeTab === 'fleet' && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden relative z-0">
            {integrations.length === 0 && !isDomainsLoading ? (
              <div className="p-16 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-gray-100 border border-gray-200 text-gray-400 rounded-2xl flex items-center justify-center mb-6">
                  <Server className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">No Integrations Connected</h3>
                <p className="text-gray-500 max-w-md leading-relaxed mb-8">
                  You need to add a Cloudflare API token in your settings before viewing or searching the fleet.
                </p>
                <button
                  onClick={() => router.push('/settings')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm"
                >
                  Go to Settings
                </button>
              </div>
            ) : (
              <>
                {/* Table Header Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-gray-200 bg-gray-50/50 gap-4 relative z-20">
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-80 flex items-center">
                      <div className="absolute left-3 inset-y-0 pointer-events-none z-10 flex items-center justify-center">
                        <Search className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search domain"
                        value={localSearchQuery}
                        onChange={(e) => setLocalSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow text-gray-900 placeholder:text-gray-400 shadow-sm"
                      />
                    </div>
                    <select
                      value={issueFilter}
                      onChange={(e) => setIssueFilter(e.target.value)}
                      className="w-full sm:w-48 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 cursor-pointer shadow-sm"
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
                    <thead className="bg-[#fbfeff] border-b border-gray-200">
                      <tr className="text-[11px] text-gray-500 font-semibold tracking-wider uppercase">
                        <th className="p-4 pl-6 w-12">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            onChange={handleSelectAll}
                            checked={
                              domains.filter(d => d.issuesDetected > 0 && d.status !== 'Secure').length > 0 &&
                              selectedDomains.length === domains.filter(d => d.issuesDetected > 0 && d.status !== 'Secure').length
                            }
                          />
                        </th>
                        <th className="p-4">Domain Name</th>
                        <th className="p-4">Owner</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Issues Detected</th>
                        <th className="p-4 hidden md:table-cell">Last Scanned</th>
                        <th className="p-4 w-32 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white relative">
                      {isDomainsLoading && (
                        <tr>
                          <td colSpan={5} className="p-12 text-center bg-white/50 backdrop-blur-sm relative z-10">
                            <div className="flex justify-center">
                              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                            </div>
                          </td>
                        </tr>
                      )}
                      {domains.length === 0 && !isDomainsLoading ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-gray-400 text-sm">
                            No domains found matching your search.
                          </td>
                        </tr>
                      ) : (
                        domains.map((entity) => {

                          return (
                            <tr key={entity._id} className="hover:bg-gray-50/70 transition-colors group cursor-pointer" onClick={() => router.push(`/?domain=${entity.domain}`)}>
                              <td className="p-4 pl-6 w-12" onClick={(e) => e.stopPropagation()}>
                                {isDomainFixable(entity) ? (
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    checked={selectedDomains.includes(entity._id)}
                                    onChange={() => handleSelectDomain(entity._id)}
                                  />
                                ) : (
                                  <div className="w-4 h-4" /> // Placeholder for alignment
                                )}
                              </td>
                              <td className="p-4 text-[14px] font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                                {entity.domain}
                              </td>
                              <td className="p-4">
                                <span className="text-[12px] text-gray-400 font-medium italic bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-md">
                                  no user found
                                </span>
                              </td>
                              <td className="p-4">
                                {entity.status === 'Secure' ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-[12px] font-medium shadow-sm">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Secure
                                  </span>
                                ) : entity.status === 'At Risk' || entity.issuesDetected > 0 ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100 text-rose-700 text-[12px] font-medium shadow-sm">
                                    <XCircle className="w-3.5 h-3.5" />
                                    At Risk
                                  </span>
                                ) : entity.status === 'Pending' ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[12px] font-medium shadow-sm">
                                    <ActivityIcon className="w-3.5 h-3.5" />
                                    Pending Scan
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-[12px] font-medium shadow-sm">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Warning
                                  </span>
                                )}
                              </td>
                              <td className="p-4">
                                {entity.issuesDetected > 0 ? (
                                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-rose-100/80 text-rose-700 text-[13px] font-bold border border-rose-200/50 shadow-sm">
                                    {entity.issuesDetected}
                                  </span>
                                ) : (
                                  <span className="text-[13px] text-gray-300 font-bold ml-2">-</span>
                                )}
                              </td>
                              <td className="p-4 hidden md:table-cell">
                                <div className="flex items-center gap-2 text-[12px] text-gray-500 font-medium">
                                  <ActivityIcon className="w-3.5 h-3.5 text-gray-400" />
                                  {entity.timestamp ? new Date(entity.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex flex-col gap-2 items-center justify-center">
                                  {!isDomainFixable(entity) ? (
                                    <span className="text-[12px] text-gray-400 font-medium italic bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-md mb-1 inline-block w-fit text-center">
                                      No action available
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemediate(entity._id, entity.domain);
                                      }}
                                      disabled={isRemediating === entity._id}
                                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-md shadow-sm transition-colors disabled:opacity-50"
                                    >
                                      {isRemediating === entity._id ? (
                                        <>
                                          <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                          Fixing...
                                        </>
                                      ) : (
                                        <>
                                          <ShieldCheck className="w-3.5 h-3.5" />
                                          1-Click Fix
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
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
                        onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}



        {/* TAB 4: AUTOMATION MONITOR */}
        {activeTab === 'automation' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border border-white/10 rounded-xl overflow-hidden bg-[#09090b]">
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-3 px-2">
                  <div className={cn("w-2 h-2 rounded-full", (isScanningNew || metrics.pendingCount > 0) ? "bg-white animate-pulse" : "bg-white/20")} />
                  <span className="text-xs font-mono tracking-wider text-white/50 uppercase">Telemetry Stream</span>
                </div>
                <button
                  onClick={handleDownloadAutomationReport}
                  disabled={isDownloadingAutomation}
                  className="h-8 px-3 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isDownloadingAutomation ? 'Fetching...' : 'Download Log'}
                </button>
              </div>
              <div className="p-0 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-[#09090b] sticky top-0 shadow-sm border-b border-white/10 z-10">
                    <tr className="text-white/40 text-xs font-medium">
                      <th className="p-4 pl-6 font-normal">Timestamp</th>
                      <th className="p-4 font-normal">Level</th>
                      <th className="p-4 font-normal">Module</th>
                      <th className="p-4 font-normal">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-xs">
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
                            <td className="p-4 pl-6 text-white/40 whitespace-nowrap">
                              {date.toLocaleTimeString()} <span className="text-white/20 ml-1">{date.toLocaleDateString()}</span>
                            </td>
                            <td className="p-4">
                              <span className={cn(
                                "px-2 py-0.5 rounded-sm font-medium tracking-wide",
                                log.level === 'ERROR' ? "bg-white/10 text-white" :
                                  log.level === 'WARNING' ? "bg-white/10 text-white/70" :
                                    log.level === 'SUCCESS' ? "bg-white/10 text-white/90" :
                                      "bg-white/5 text-white/50"
                              )}>
                                {log.level}
                              </span>
                            </td>
                            <td className="p-4 text-white/50 whitespace-nowrap">{log.module || 'SYSTEM'}</td>
                            <td className="p-4 text-white/70 break-words">
                              <div className="flex items-start gap-2">
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
          </div>
        )}

      </main>
    </div>
  );
}
