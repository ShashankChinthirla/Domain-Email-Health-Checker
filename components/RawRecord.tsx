import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RawRecordProps {
    title: string;
    record: string | null;
    type: 'spf' | 'dmarc';
}

export function RawRecord({ title, record, type }: RawRecordProps) {
    const isPresent = !!record;
    const statusColor = isPresent ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
    const iconColor = isPresent ? 'text-green-600' : 'text-red-600';

    return (
        <div className={cn('border rounded-md p-4 mb-4', statusColor)}>
            <div className="flex items-start">
                <div className={cn('mr-3 mt-0.5', iconColor)}>
                    {isPresent ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </div>
                <div className="flex-1 overflow-hidden">
                    <h4 className={cn('text-sm font-semibold uppercase tracking-wider mb-1', iconColor)}>
                        {title}
                    </h4>
                    <code className="text-sm text-gray-800 break-all font-mono">
                        {isPresent ? record : `No ${type.toUpperCase()} record found`}
                    </code>
                </div>
            </div>
        </div>
    );
}
