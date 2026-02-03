
import { runFullHealthCheck } from '../lib/test-engine';
import * as fs from 'fs';

const target = 'facebook.com';

async function verify() {
    console.log(`--- Verifying False Positives for ${target} ---`);
    try {
        const report = await runFullHealthCheck(target);
        if (!report || !report.categories) return;

        const dkimTests = report.categories['dkim']?.tests || [];
        const blacklistTests = report.categories['blacklist']?.tests || [];

        const output = {
            blacklist: blacklistTests,
            dkim: dkimTests
        };

        fs.writeFileSync('facebook_verify_result.json', JSON.stringify(output, null, 2));
        console.log('Result written to facebook_verify_result.json');

    } catch (err) {
        console.error(err);
    }
}

verify();
