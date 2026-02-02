import React, { useState } from 'react';
import { CategoryResult, TestResult } from '@/lib/test-engine';
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TestList({ categories }: { categories: CategoryResult[] }) {
    // Flatten tests or show by category. MXToolbox shows by category.
    return (
        <div className="space-y-6 mt-8">
            <h3 className="text-xl font-bold text-gray-900">Health Check Analysis</h3>
            {categories.map((cat) => (
                <CategorySection key={cat.category} category={cat} />
            ))}
        </div>
    );
}

function CategorySection({ category }: { category: CategoryResult }) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
                <div className="flex items-center space-x-3">
                    <span className="font-bold text-gray-700">{category.category}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                        {category.tests.length} Tests
                    </span>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="flex space-x-2 text-xs font-medium">
                        {category.stats.errors > 0 && <span className="text-red-600">{category.stats.errors} Errors</span>}
                        {category.stats.warnings > 0 && <span className="text-yellow-600">{category.stats.warnings} Warnings</span>}
                        <span className="text-green-600">{category.stats.passed} Passed</span>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
            </button>

            {isOpen && (
                <div className="divide-y divide-gray-100">
                    {category.tests.map((test, idx) => (
                        <div key={idx} className="p-3 flex items-start hover:bg-gray-50/50 transition-colors">
                            <div className="mr-3 mt-0.5 flex-shrink-0">
                                <StatusIcon status={test.status} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={cn("text-sm font-medium", getStatusColor(test.status))}>
                                    {test.name}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {test.info}
                                </p>
                            </div>
                            <div className="ml-3 flex-shrink-0">
                                <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide", getStatusBadge(test.status))}>
                                    {test.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatusIcon({ status }: { status: string }) {
    if (status === 'Pass') return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (status === 'Warning') return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    return <XCircle className="w-5 h-5 text-red-500" />;
}

function getStatusColor(status: string) {
    if (status === 'Pass') return 'text-gray-900';
    if (status === 'Warning') return 'text-yellow-700';
    return 'text-red-700';
}

function getStatusBadge(status: string) {
    if (status === 'Pass') return 'bg-green-100 text-green-800';
    if (status === 'Warning') return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
}
