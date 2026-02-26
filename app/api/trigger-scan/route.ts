import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
    try {
        const pat = process.env.GITHUB_PAT;

        if (!pat) {
            // IF RUNNING LOCALLY WITHOUT A PAT, FALLBACK TO TERMINAL
            if (process.env.NODE_ENV === 'development') {
                console.log("No GITHUB_PAT found. Falling back to local terminal execution! (WARNING: This will block your PC on 10k domains)");

                // Fire and forget local background execution
                execAsync('npx tsx scripts/rescan_db_v3.ts --new').catch(e => console.error("Local Scan Error", e));

                return NextResponse.json({
                    success: true,
                    message: 'Running scan locally in your terminal since no GitHub token was found.'
                });
            }

            return NextResponse.json({
                error: 'GitHub Personal Access Token (GITHUB_PAT) is missing in environment variables. Please add it to your .env.local or Vercel settings.'
            }, { status: 401 });
        }

        // The user's GitHub repository details
        const owner = 'ShashankChinthirla';
        const repo = 'Domain-Email-Health-Checker';
        // The exact filename of the workflow we want to trigger
        const workflow_id = 'manual_scan.yml';

        // GitHub REST API endpoint for triggering a workflow dispatch
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `Bearer ${pat}`,
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                ref: 'main', // Branch to run the workflow on
                inputs: {}  // Not strictly required for workflow_dispatch without inputs, but good practice
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('GitHub API Error:', errorText);
            return NextResponse.json({
                error: `Failed to trigger GitHub Action. Status: ${response.status}`, details: errorText
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            message: 'Background scan successfully triggered! The GitHub Action is now running in the cloud.'
        });

    } catch (error) {
        console.error('Trigger error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
