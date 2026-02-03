import { DomainChecker } from '@/components/DomainChecker';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
            Passive DNS Email Health Analyzer
          </h1>
          <p className="text-gray-500 mb-8">
            Deep, legally safe analysis of your domain's email hygiene (No Port 25 Probing).
          </p>
        </div>

        <DomainChecker />
      </div>
    </div>
  );
}
