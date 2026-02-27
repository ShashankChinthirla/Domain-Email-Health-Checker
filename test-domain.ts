import { runFullHealthCheck } from "./lib/test-engine";

async function testAccuracy() {
    const domain = "accountabilityincpro.com";
    console.log(`Testing: ${domain}`);
    const res = await runFullHealthCheck(domain);

    let totalErrors = 0;
    let totalWarnings = 0;
    let totalPass = 0;

    const ignoredInfos = [
        'Timed Out', 'Timeout', 'DNS Error', 'DNS Lookup Failed',
        'Failed', 'Unreachable', 'Rate Limited', 'TIMEOUT'
    ];

    for (const [catKey, cat] of Object.entries(res.categories || {}) as any) {
        const tests = cat.tests || [];
        const errors = tests.filter((t: any) => t.status === 'Error' && !ignoredInfos.some((n: string) => t.info?.includes(n)));
        const warnings = tests.filter((t: any) => t.status === 'Warning' && !ignoredInfos.some((n: string) => t.info?.includes(n)));
        const pass = tests.filter((t: any) => t.status === 'Pass');

        totalErrors += errors.length;
        totalWarnings += warnings.length;
        totalPass += pass.length;

        if (errors.length > 0) {
            console.log(`\n[${catKey}] ERRORS (${errors.length}):`);
            errors.forEach((t: any) => console.log(`  ERROR: ${t.name} | ${t.info}`));
        }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Warnings (advisory): ${totalWarnings}`);
    console.log(`Pass: ${totalPass}`);
    console.log(`Status: ${totalErrors === 0 ? 'SECURE ✅' : 'AT RISK ⚠️'}`);
}

testAccuracy();
