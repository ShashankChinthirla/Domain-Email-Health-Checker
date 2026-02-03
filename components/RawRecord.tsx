import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RawRecordProps {
    title: string;
    record: string | null;
    type: 'spf' | 'dmarc';
    isRecommended?: boolean;
}

export function RawRecord({ title, record, type, isRecommended }: RawRecordProps) {
    const isPresent = !!record;

    let statusColor = isPresent ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
    let iconColor = isPresent ? 'text-green-600' : 'text-red-600';
    let Icon = isPresent ? CheckCircle2 : XCircle;

    if (isRecommended) {
        statusColor = 'bg-blue-50 border-blue-200';
        iconColor = 'text-blue-600';
        Icon = CheckCircle2; // Always show check for recommendation block itself
    }

    return (
        <div className={cn('border rounded-md p-4', statusColor)}>
            <div className="flex items-start">
                <div className={cn('mr-3 mt-0.5', iconColor)}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 overflow-hidden">
                    <h4 className={cn('text-sm font-semibold uppercase tracking-wider mb-2', iconColor)}>
                        {title}
                    </h4>
                    <code className="text-sm text-gray-800 break-all font-mono block">
                        {isPresent ? record : `No ${type.toUpperCase()} record found`}
                    </code>
                </div>
            </div>
        </div>
    );
}
