import React from 'react';
import { FullHealthReport, CategoryResult } from '@/lib/types';
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight, ShieldCheck, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface BulkResultsTableProps {
    results: FullHealthReport[];
    onSelect: (result: FullHealthReport) => void;
}

export function BulkResultsTable({ results, onSelect }: BulkResultsTableProps) {
    if (results.length === 0) return null;

    const handleExport = () => {
        const getHealthCheck = (r: FullHealthReport) => {
            const allCats = Object.values(r.categories);
            const errors = allCats.reduce((acc, cat) => acc + cat.stats.errors, 0);
            const warnings = allCats.reduce((acc, cat) => acc + cat.stats.warnings, 0);
            if (errors === 0 && warnings === 0) return '100% Secure';
            return `${errors} Errors, ${warnings} Warnings`;
        };

        const generateUpdatedSpf = (raw: string | null) => raw ? raw.replace(/-all|\?all/g, '~all') : 'v=spf1 a mx ~all';
        const generateUpdatedDmarc = (raw: string | null, domain: string) => {
            let rua = `mailto:dmarc-reports@${domain}`;
            let ruf = '';
            if (raw) {
                const mRua = raw.match(/rua=([^;]+)/i);
                if (mRua) rua = mRua[1].trim();
                const mRuf = raw.match(/ruf=([^;]+)/i);
                if (mRuf) ruf = ` ruf=${mRuf[1].trim()};`;
            }
            return `v=DMARC1; p=reject; sp=reject; pct=100; rua=${rua};${ruf} adkim=r; aspf=r;`;
        };

        const wb = XLSX.utils.book_new();
        const data = results.map(r => ({
            "Domain": r.domain,
            "SPF [Full]": r.rawSpf || "Missing",
            "Updated SPF [Full]": generateUpdatedSpf(r.rawSpf),
            "DMARC [Full]": r.rawDmarc || "Missing",
            "Updated DMARC [Full]": generateUpdatedDmarc(r.rawDmarc, r.domain),
            "Health Check": getHealthCheck(r)
        }));
        const ws = XLSX.utils.json_to_sheet(data);

        // Auto-width columns
        const wscols = [
            { wch: 20 }, // Domain
            { wch: 40 }, // SPF
            { wch: 40 }, // Updated SPF
            { wch: 40 }, // DMARC
            { wch: 40 }, // Updated DMARC
            { wch: 25 }, // Health
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "Health Report");
        XLSX.writeFile(wb, `domain-health-bulk-${new Date().getTime()}.xlsx`);
    };

    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-25 pb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Bulk Analysis Report</h2>
                    <p className="text-slate-400">Processed {results.length} domains successfully.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExport}
                        title="Export to Excel"
                        className="group flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95"
                    >
                        <Download className="w-4 h-4" />
                        <span>Export</span>
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        title="Clear & Start New"
                        className="group flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 hover:border-white/20 transition-all active:scale-95"
                    >
                        <span>Clear</span>
                    </button>
                </div>
            </div>

            <div className="bg-[#09090b] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.02]">
                                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest pl-6">Domain</th>
                                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Issues</th>
                                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">SPF</th>
                                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">DMARC</th>
                                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Blacklist</th>
                                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right pr-6">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {results.map((res, idx) => (
                                <tr
                                    key={idx}
                                    onClick={() => onSelect(res)}
                                    className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                                >
                                    <td className="p-4 pl-6 font-medium text-slate-200 text-sm">
                                        {res.domain}
                                    </td>
                                    <td className="p-4 text-center">
                                        <ProblemsBadge report={res} />
                                    </td>
                                    <td className="p-4 text-center">
                                        <StatusDot category={res.categories.spf} />
                                    </td>
                                    <td className="p-4 text-center">
                                        <StatusDot category={res.categories.dmarc} />
                                    </td>
                                    <td className="p-4 text-center">
                                        <StatusDot category={res.categories.blacklist} />
                                    </td>
                                    <td className="p-4 pr-6 text-right">
                                        <button className="p-2 rounded-full bg-white/5 group-hover:bg-white/10 text-slate-400 group-hover:text-white transition-all">
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function ProblemsBadge({ report }: { report: FullHealthReport }) {
    // Sum all errors from all categories
    const allCats = Object.values(report.categories);
    const errors = allCats.reduce((acc, cat) => acc + cat.stats.errors, 0);
    const warnings = allCats.reduce((acc, cat) => acc + cat.stats.warnings, 0);

    if (errors === 0 && warnings === 0) {
        return (
            <span className="px-2.5 py-1 rounded-md text-xs font-bold border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                100% Secure
            </span>
        );
    }

    return (
        <div className="flex items-center justify-center gap-2">
            {errors > 0 && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    {errors} Err
                </span>
            )}
            {warnings > 0 && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    {warnings} Wrn
                </span>
            )}
        </div>
    );
}

function StatusDot({ category }: { category: CategoryResult }) {
    if (category.stats.errors > 0) return <XCircle className="w-5 h-5 text-rose-500 mx-auto opacity-80" />;
    if (category.stats.warnings > 0) return <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto opacity-80" />;
    return <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto opacity-80" />;
}
