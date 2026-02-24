import urllib.request
import json
import ssl

def update_dashboard():
    url = "http://localhost:3000/api/webhooks/domain-update"
    
    # Payload simulating a domain that just underwent a scan
    payload = {
        "domain": "test-automation-webhook.com",
        "status": "At Risk", 
        "issueCategory": "blacklist_issue",
        "issuesDetected": 2,
        "spfFull": "v=spf1 include:_spf.google.com ~all",
        "dmarcFull": "v=DMARC1; p=none;",
        "issues": {
            "blacklist": "Listed on Spamhaus",
            "dmarc": "Policy is p=none (Warning)"
        }
    }

    # Encode payload to JSON bytes
    data = json.dumps(payload).encode('utf-8')

    # Prepare the HTTP POST request with headers
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', 'Bearer default-insecure-secret-please-change')

    try:
        # Ignore SSL verification for localhost if needed, though http:// usually doesn't need it
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        print(f"Sending POST request to {url}...")
        with urllib.request.urlopen(req, context=ctx) as response:
            response_data = response.read().decode('utf-8')
            print(f"Status Code: {response.status}")
            print(f"Response: {response_data}")
            print("✅ Webhook triggered successfully!")
            
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP Error: {e.code} - {e.reason}")
        print(e.read().decode('utf-8'))
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    update_dashboard()
