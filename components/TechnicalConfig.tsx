import React from 'react';
import { Search } from 'lucide-react';
import { RawRecord } from './RawRecord';

interface TechnicalConfigProps {
    domain: string;
    rawSpf: string | null;
    updatedSpf: string;
    rawDmarc: string | null;
    updatedDmarc: string;
}

export function TechnicalConfig({ domain, rawSpf, updatedSpf, rawDmarc, updatedDmarc }: TechnicalConfigProps) {
    return (
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 mb-12">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                <Search className="w-5 h-5 mr-2 text-gray-500" />
                Technical Configuration
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <RawRecord
                        title="SPF [FULL]"
                        record={rawSpf}
                        type="spf"
                    />
                    <RawRecord
                        title="UPDATED SPF [RECOMMENDED]"
                        record={updatedSpf}
                        type="spf"
                        isRecommended
                    />
                </div>
                <div className="space-y-4">
                    <RawRecord
                        title="DMARC [FULL]"
                        record={rawDmarc}
                        type="dmarc"
                    />
                    <RawRecord
                        title="UPDATED DMARC [RECOMMENDED]"
                        record={updatedDmarc}
                        type="dmarc"
                        isRecommended
                    />
                </div>
            </div>
        </div>
    );
}
