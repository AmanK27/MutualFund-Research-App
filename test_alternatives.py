import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch(url):
    req = urllib.request.Request(f"https://api.allorigins.win/raw?url={urllib.parse.quote(url)}", headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, context=ctx) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

print("=== Testing Tickertape ===")
search_url = "https://api.tickertape.in/search?text=Axis+Midcap+Fund+Direct+Growth&types=mutualfund"
data = fetch(search_url)
if data and data.get('data') and data['data'].get('mutualfunds'):
    mf = data['data']['mutualfunds'][0]
    sid = mf['ticker']
    print(f"Tickertape SID: {sid}")
    
    # Try grabbing info
    info_url = f"https://api.tickertape.in/mutualfunds/info/{sid}"
    info = fetch(info_url)
    if info:
        print("Tickertape Info Keys:", list(info.get('data', {}).keys()))
        with open('diagnostic_tickertape.json', 'w') as f:
            json.dump(info, f, indent=2)
else:
    print("Tickertape Search failed or returned nothing.")

print("\n=== Testing ET Money ===")
et_search_url = "https://www.etmoney.com/mutual-funds/api/v1/search?q=Axis%20Midcap%20Fund%20Direct"
et_data = fetch(et_search_url)
if et_data:
    print("ET Money Data Keys:", list(et_data.keys()))
    if et_data.get('data'):
        print("ET Money Results:", len(et_data['data']))
        if len(et_data['data']) > 0:
            with open('diagnostic_etmoney.json', 'w') as f:
                json.dump(et_data, f, indent=2)
else:
    print("ET Money Search failed.")
