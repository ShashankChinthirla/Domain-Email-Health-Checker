'use client';

import React, { useState, useRef } from 'react';
import { ResultTable } from './ResultTable';
import { ProblemTable } from './ProblemTable';
import { ProblemSummaryTable } from './ProblemSummaryTable';
import { FullHealthReport } from '@/lib/types';
import { HealthSummary } from './HealthCards';
import { RawRecord } from './RawRecord';
import { TestList } from './TestList';
import { VerdictBanner } from './VerdictBanner';
import { TechnicalConfig } from './TechnicalConfig';
import * as XLSX from 'xlsx';
import { Download, Upload, Search, Loader2 } from 'lucide-react';

export function DomainChecker() {
    const [domainInput, setDomainInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<FullHealthReport[]>([]);
    const [currentSingleResult, setCurrentSingleResult] = useState<FullHealthReport | null>(null);
    const [inputError, setInputError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const checkDomain = async (domain: string) => {
        try {
            const response = await fetch('/api/check-domain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to check domain');
            }

            return data as FullHealthReport;
        } catch (error) {
            console.error(error);
            return null;
        }
    };

    const handleManualCheck = async () => {
        if (!domainInput.trim()) return;
        setLoading(true);
        setInputError(null);
        setCurrentSingleResult(null);

        await new Promise(r => setTimeout(r, 100));

        const result = await checkDomain(domainInput);
        if (result) {
            setResults((prev) => [...prev, result]);
            setCurrentSingleResult(result);
            setDomainInput('');
        } else {
            setInputError('Could not retrieve data for this domain.');
        }
        setLoading(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const workbook = XLSX.read(bstr, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const ws = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(ws) as any[];

                const domainsToCheck: string[] = [];
                data.forEach((row) => {
                    const key = Object.keys(row).find(k => k.toLowerCase() === 'domain');
                    if (key && row[key]) {
                        domainsToCheck.push(row[key]);
                    }
                });

                if (domainsToCheck.length === 0) {
                    setInputError('No "domain" column found in the uploaded file.');
                    return;
                }

                setLoading(true);
                setCurrentSingleResult(null);

                for (const d of domainsToCheck) {
                    const res = await checkDomain(d);
                    if (res) {
                        setResults((prev) => [...prev, res]);
                    }
                }
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';

            } catch (err) {
                console.error(err);
                setInputError('Error parsing Excel file.');
                setLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const generateUpdatedSpf = (raw: string | null) => {
        if (!raw) return 'v=spf1 a mx ~all';
        return raw.replace(/-all/g, '~all').replace(/\?all/g, '~all');
    };

    const generateUpdatedDmarc = (raw: string | null, domain: string) => {
        let rua = '';
        let ruf = '';
        if (raw) {
            const ruaMatch = raw.match(/rua=([^;]+)/i);
            const rufMatch = raw.match(/ruf=([^;]+)/i);
            if (ruaMatch) rua = ruaMatch[1].trim();
            if (rufMatch) ruf = rufMatch[1].trim();
        } else {
            rua = `mailto:dmarc-reports@${domain}`;
            ruf = `mailto:dmarc-reports@${domain}`;
        }
        let rec = 'v=DMARC1; p=reject; sp=reject; pct=100;';
        if (rua) rec += ` rua=${rua};`;
        if (ruf) rec += ` ruf=${ruf};`;
        rec += ' adkim=r; aspf=r;';
        return rec;
    };

    const exportToExcel = () => {
        if (results.length === 0) return;
        const exportData = results.map(r => {
            const healthCheckLines: string[] = [];

            const addCatStats = (name: string, stats: { errors: number, warnings: number, passed: number }) => {
                if (healthCheckLines.length > 0) healthCheckLines.push('');
                healthCheckLines.push(`[ ${name.toUpperCase()} ]`);
                if (stats.errors > 0) healthCheckLines.push(`• ${stats.errors} Errors`);
                if (stats.warnings > 0) healthCheckLines.push(`• ${stats.warnings} Warnings`);
                healthCheckLines.push(`• ${stats.passed} Passed`);
            };

            addCatStats('Problems', r.categories.problems.stats);
            addCatStats('DNS', r.categories.dns.stats);
            addCatStats('SPF', r.categories.spf.stats);
            addCatStats('DMARC', r.categories.dmarc.stats);
            addCatStats('DKIM', r.categories.dkim.stats);
            addCatStats('Blacklist', r.categories.blacklist.stats);
            addCatStats('Web Server', r.categories.webServer.stats);

            return {
                'Domain': r.domain,
                'SPF [Full]': r.rawSpf || 'Missing',
                'Updated SPF [Full]': generateUpdatedSpf(r.rawSpf),
                'DMARC [Full]': r.rawDmarc || 'Missing',
                'Updated DMARC [Full]': generateUpdatedDmarc(r.rawDmarc, r.domain),
                'Health Check': healthCheckLines.join('\n')
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [{ wch: 25 }, { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Detailed Results');
        XLSX.writeFile(wb, 'domain-health-deep-analysis.xlsx');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleManualCheck();
    };

    const scrollToCategory = (category: string) => {
        const id = `cat-${category.toLowerCase().replace(/ /g, '-')}`;
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="max-w-5xl mx-auto space-y-12 pb-24">

            <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                    Analyze Domain
                </label>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-grow">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition duration-150 ease-in-out text-base"
                            placeholder="e.g. google.com"
                            value={domainInput}
                            onChange={(e) => setDomainInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                    <button
                        onClick={handleManualCheck}
                        disabled={loading || !domainInput}
                        className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-75 transition-all shadow-md hover:shadow-lg"
                    >
                        {loading && domainInput ? <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" /> : null}
                        Check Domain
                    </button>
                </div>
                {inputError && (
                    <p className="mt-3 text-sm text-red-600 font-medium flex items-center">
                        <Upload className="w-4 h-4 mr-1.5" />
                        {inputError}
                    </p>
                )}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-gray-100">
                    <div className="flex items-center">
                        <input type="file" ref={fileInputRef} accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="text-gray-600 hover:text-gray-900 text-sm font-medium flex items-center transition-colors">
                            <Upload className="w-4 h-4 mr-2" /> Upload Excel List
                        </button>
                    </div>
                    {results.length > 0 && (
                        <button onClick={exportToExcel} className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center transition-colors">
                            <Download className="w-4 h-4 mr-2" /> Export Full Report (.xlsx)
                        </button>
                    )}
                </div>
            </div>

            {loading && !domainInput && (
                <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-10 w-10 animate-spin text-orange-500 mb-4" />
                    <p className="text-lg text-gray-600 font-medium">Running deep analysis on domains...</p>
                    <p className="text-sm text-gray-400">Checking DNSBLs, Mail Servers, and Security Policies</p>
                </div>
            )}

            {currentSingleResult && !loading && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-12">

                    {/* 1. Technical Configuration */}
                    <TechnicalConfig
                        domain={currentSingleResult.domain}
                        rawSpf={currentSingleResult.rawSpf}
                        updatedSpf={generateUpdatedSpf(currentSingleResult.rawSpf)}
                        rawDmarc={currentSingleResult.rawDmarc}
                        updatedDmarc={generateUpdatedDmarc(currentSingleResult.rawDmarc, currentSingleResult.domain)}
                    />

                    {/* 2. Verdict Banner */}
                    <div className="">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-3xl font-bold text-gray-900">{currentSingleResult.domain}</h2>
                            <span className="text-sm text-gray-500 hidden sm:inline">
                                Report Generated: {new Date().toLocaleTimeString()}
                            </span>
                        </div>
                        <VerdictBanner report={currentSingleResult} />
                    </div>

                    {/* 2. Health Cards (Category Summary - Top Row) */}
                    {(() => {
                        const cats = currentSingleResult.categories;
                        const orderedCategories = [
                            cats.problems,
                            cats.blacklist,
                            cats.smtp,
                            cats.webServer,
                            cats.dns,
                            cats.spf,
                            cats.dmarc,
                            cats.dkim
                        ].filter(Boolean);

                        return (
                            <>
                                <div>
                                    {/* <h3 className="text-xl font-bold text-gray-900 mb-4">Diagnostic Summary</h3> */}
                                    <HealthSummary
                                        categories={orderedCategories}
                                        onCategoryClick={scrollToCategory}
                                    />
                                </div>

                                {/* Summary Table (MxToolbox Style) */}
                                <div className="mt-8">
                                    <ProblemSummaryTable
                                        problems={cats.problems}
                                        domain={currentSingleResult.domain}
                                    />
                                </div>

                                {/* Problems Table (MxToolbox Parity - Detailed) */}
                                <div className="mt-8">
                                    <ProblemTable problems={cats.problems} />
                                </div>

                                {/* 3. Detailed List */}
                                <TestList categories={orderedCategories} />
                            </>
                        );
                    })()}



                </div>
            )}

            {results.length > 0 && (
                <div className="mt-16 pt-8 border-t border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Session History</h3>
                    <ResultTable results={results} />
                </div>
            )}

        </div>
    );
}
