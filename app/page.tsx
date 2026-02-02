import { DomainChecker } from '@/components/DomainChecker';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Domain Email Health Checker
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            Verify SPF, DMARC, and MX records instantly.
          </p>
        </div>

        <DomainChecker />
      </div>
    </div>
  );
}
