import React from 'react';
import { CategoryResult } from '@/lib/types';
import { XCircle, AlertCircle, CheckCircle2, ShieldAlert, Server, Globe, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthSummaryProps {
    categories: CategoryResult[];
    onCategoryClick?: (category: string) => void;
}

export function HealthSummary({ categories = [], onCategoryClick }: HealthSummaryProps) {
    if (!categories || categories.length === 0) return null;

    const getIcon = (catName: string) => {
        switch (catName) {
            case 'Problems': return <XCircle className="w-5 h-5 text-gray-500" />;
            case 'Blacklist': return <ShieldAlert className="w-5 h-5 text-gray-500" />;
            case 'DNS': return <Activity className="w-5 h-5 text-gray-500" />;
            case 'SPF': return <ShieldAlert className="w-5 h-5 text-gray-500" />;
            case 'DMARC': return <ShieldAlert className="w-5 h-5 text-gray-500" />;
            case 'DKIM': return <ShieldAlert className="w-5 h-5 text-gray-500" />;
            case 'Web Server': return <Globe className="w-5 h-5 text-gray-500" />;
            case 'SMTP': return <Server className="w-5 h-5 text-gray-500" />;
            default: return <Activity className="w-5 h-5 text-gray-500" />;
        }
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 my-6">
            {categories.map((cat) => {
                // Determine Border Color
                let borderClass = 'border-b-4 border-b-green-500';
                if (cat.stats.errors > 0) borderClass = 'border-b-4 border-b-red-500';
                else if (cat.stats.warnings > 0) borderClass = 'border-b-4 border-b-yellow-500';

                return (
                    <div
                        key={cat.category}
                        onClick={() => onCategoryClick?.(cat.category)}
                        className={cn(
                            "bg-white border border-gray-200 rounded-t-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow",
                            borderClass
                        )}
                    >
                        {/* Header Area */}
                        <div className="p-4 flex flex-col items-center text-center pb-2">
                            <div className="mb-2 text-gray-600">
                                {getIcon(cat.category)}
                            </div>
                            <h3 className="font-bold text-gray-700 text-sm">{cat.category}</h3>
                        </div>

                        {/* Stats Rows */}
                        <div className="px-4 pb-4 space-y-1 text-xs font-medium">
                            <div className="flex items-center justify-center space-x-2 text-gray-600">
                                <XCircle className="w-3 h-3 text-gray-400" />
                                <span className={cat.stats.errors > 0 ? "text-red-600 font-bold" : "text-gray-500"}>
                                    {cat.stats.errors} Errors
                                </span>
                            </div>
                            <div className="flex items-center justify-center space-x-2 text-gray-600">
                                <AlertCircle className="w-3 h-3 text-gray-400" />
                                <span className={cat.stats.warnings > 0 ? "text-yellow-600 font-bold" : "text-gray-500"}>
                                    {cat.stats.warnings} Warning
                                </span>
                            </div>
                            <div className="flex items-center justify-center space-x-2 text-gray-600">
                                <CheckCircle2 className="w-3 h-3 text-gray-400" />
                                <span className="text-gray-500">
                                    {cat.stats.passed} Passed
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
