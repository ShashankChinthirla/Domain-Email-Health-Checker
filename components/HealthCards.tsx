import React from 'react';
import { CategoryResult } from '@/lib/test-engine';
import { AlertCircle, ShieldAlert, Server, Globe, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode }> = {
    'Problems': { icon: <AlertCircle className="w-6 h-6 text-red-500" /> },
    'Blacklist': { icon: <ShieldAlert className="w-6 h-6 text-orange-500" /> },
    'Mail Server': { icon: <Server className="w-6 h-6 text-blue-500" /> },
    'Web Server': { icon: <Globe className="w-6 h-6 text-indigo-500" /> },
    'DNS': { icon: <Activity className="w-6 h-6 text-green-500" /> },
};

export function HealthSummary({ categories }: { categories: CategoryResult[] }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 my-6">
            {categories.map((cat) => {
                const config = CATEGORY_CONFIG[cat.category] || { icon: <Activity /> };
                return (
                    <div key={cat.category} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col items-center text-center">
                        <div className="mb-2 bg-gray-50 p-2 rounded-full">
                            {config.icon}
                        </div>
                        <h3 className="font-semibold text-gray-700 text-sm mb-2">{cat.category}</h3>

                        <div className="space-y-1 w-full text-xs">
                            {cat.stats.errors > 0 && <div className="text-red-600 bg-red-50 py-1 rounded font-medium">{cat.stats.errors} Errors</div>}
                            {cat.stats.warnings > 0 && <div className="text-yellow-600 bg-yellow-50 py-1 rounded font-medium">{cat.stats.warnings} Warnings</div>}
                            <div className="text-green-600 bg-green-50 py-1 rounded font-medium">{cat.stats.passed} Passed</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
