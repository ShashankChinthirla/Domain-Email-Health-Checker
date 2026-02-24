const fs = require('fs');

async function checkCloudflareOrder() {
    const token = 'iDV3ji4qc54qoumLCc3dBwRSS3AAEgQTxOiJnvZT';
    let output = '--- Top 10 Domains from Cloudflare ---\n';
    try {
        const res = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=10', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();
        if (data.success) {
            data.result.forEach((zone, index) => {
                output += `${index + 1}. ${zone.name} (Created: ${zone.created_on})\n`;
            });
        } else {
            output += `API Error: ${JSON.stringify(data.errors)}\n`;
        }
    } catch (error) {
        output += `Fetch error: ${error}\n`;
    }
    fs.writeFileSync('cf_order.txt', output, 'utf8');
}

checkCloudflareOrder();
