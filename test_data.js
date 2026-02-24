const xlsx = require('xlsx');
const fs = require('fs');

async function run() {
    let output = '--- Testing Cloudflare API ---\n';
    const token = 'iDV3ji4qc54qoumLCc3dBwRSS3AAEgQTxOiJnvZT';
    try {
        const res = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=1', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();
        if (data.success) {
            output += `Success! Total Cloudflare Domains: ${data.result_info.total_count}\n`;
        } else {
            output += `API Error: ${JSON.stringify(data.errors)}\n`;
        }
    } catch (error) {
        output += `Fetch error: ${error}\n`;
    }

    output += '\n--- Analyzing Excel File ---\n';
    const filePath = './final_domain_issue_classification.xlsx';
    if (!fs.existsSync(filePath)) {
        output += `File not found: ${filePath}\n`;
    } else {
        const workbook = xlsx.readFile(filePath);
        output += `Sheet Names: ${workbook.SheetNames.join(', ')}\n`;

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            if (data.length > 0) {
                output += `\nSheet: ${sheetName}\n`;
                output += `Total Rows: ${data.length - 1}\n`; // subtracting header
                output += `Columns: ${JSON.stringify(data[0])}\n`;
                if (data.length > 1) {
                    output += `Sample Row (1): ${JSON.stringify(data[1])}\n`;
                }
            }
        }
    }

    fs.writeFileSync('test_data_output.txt', output, 'utf8');
}

run();
