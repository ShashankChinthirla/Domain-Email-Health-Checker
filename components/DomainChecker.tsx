'use client';

import React, { useState, useRef } from 'react';
import { ResultTable } from './ResultTable';
import { FullHealthReport } from '@/lib/test-engine';
import { HealthSummary } from './HealthCards';
import { RawRecord } from './RawRecord';
import { TestList } from './TestList';
import * as XLSX from 'xlsx';
import { Download, Upload, Search, Loader2, ArrowRight } from 'lucide-react';

export function DomainChecker() {
    const [domainInput, setDomainInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<FullHealthReport[]>([]); // For Bulk Table
    const [currentSingleResult, setCurrentSingleResult] = useState<FullHealthReport | null>(null); // For Single View
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
        setCurrentSingleResult(null); // Clear previous single view

        // Slight delay to allow UI to show loading state
        await new Promise(r => setTimeout(r, 100));

        const result = await checkDomain(domainInput);
        if (result) {
            setResults((prev) => [...prev, result]); // Also add to table history
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
                setCurrentSingleResult(null); // Clear single view for bulk

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

    const exportToExcel = () => {
        if (results.length === 0) return;

        const exportData = results.map(r => {
            const healthCheckLines: string[] = [];

            // Helper to format category stats
            const addCatStats = (name: string, stats: { errors: number, warnings: number, passed: number }) => {
                healthCheckLines.push(name);
                if (stats.errors > 0) healthCheckLines.push(`${stats.errors} Errors`);
                if (stats.warnings > 0) healthCheckLines.push(`${stats.warnings} Warnings`);
                healthCheckLines.push(`${stats.passed} Passed`);
            };

            addCatStats('Problems', r.categories.problems.stats);
            addCatStats('Blacklist', r.categories.blacklist.stats);
            addCatStats('Mail Server', r.categories.mailServer.stats);
            addCatStats('Web Server', r.categories.webServer.stats);
            addCatStats('DNS', r.categories.dns.stats);

            return {
                'Domain': r.domain,
                'SPF [Full]': r.rawSpf || 'Missing',
                'DMARC [Full]': r.rawDmarc || 'Missing',
                'Health Check': healthCheckLines.join('\n')
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Detailed Results');
        XLSX.writeFile(wb, 'domain-health-deep-analysis.xlsx');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleManualCheck();
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">

            {/* Input Section */}
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
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept=".xlsx, .xls"
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading}
                            className="text-gray-600 hover:text-gray-900 text-sm font-medium flex items-center transition-colors"
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Excel List
                        </button>
                    </div>

                    {results.length > 0 && (
                        <button
                            onClick={exportToExcel}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center transition-colors"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export Full Report (.xlsx)
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

            {/* SINGLE RESULT VIEW */}
            {currentSingleResult && !loading && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                                {currentSingleResult.domain}
                                <span className="ml-3 px-3 py-1 bg-green-100 text-green-800 text-xs font-bold uppercase rounded-full tracking-wide">
                                    Report Ready
                                </span>
                            </h2>
                            <p className="text-gray-500 text-sm mt-1">Generated by Domain Email Health Checker Engine</p>
                        </div>
                    </div>

                    {/* Raw Records */}
                    <div className="grid md:grid-cols-2 gap-6 mb-8">
                        <RawRecord title="DMARC Record" record={currentSingleResult.rawDmarc} type="dmarc" />
                        <RawRecord title="SPF Record" record={currentSingleResult.rawSpf} type="spf" />
                    </div>

                    {/* Health Cards */}
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Domain Health Report</h3>
                    <HealthSummary categories={Object.values(currentSingleResult.categories)} />

                    {/* Detailed Test List */}
                    <TestList categories={Object.values(currentSingleResult.categories)} />

                </div>
            )}

            {/* BULK RESULTS TABLE */}
            {results.length > 0 && (
                <div className="mt-12">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Session History</h3>
                    <ResultTable results={results} />
                </div>
            )}

        </div>
    );
}
