"""Keep authentication ready; run the paper engine without an open browser."""
import datetime
import json
import urllib.request

def call(path, method='GET'):
    try:
        req = urllib.request.Request('http://127.0.0.1:8790/manju/api/' + path, method=method)
        with urllib.request.urlopen(req, timeout=120) as response:
            data = json.load(response)
        print(path, 'ok' if not data.get('error') else data['error'])
    except Exception as exc:
        print(path, type(exc).__name__)
call('dhan/token', 'POST')
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
if now.weekday() < 5 and (9, 15) <= (now.hour, now.minute) <= (15, 30):
    for asset in ['NIFTY', 'BANKNIFTY', 'SENSEX']:
        call('paper/tick?asset=' + asset, 'POST')
