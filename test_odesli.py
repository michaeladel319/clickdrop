import urllib.request
import urllib.parse
import json

url = "https://api.song.link/v1-alpha.1/links?url=" + urllib.parse.quote("https://open.spotify.com/track/6l8GvAyoUZwWDgF1e4822w")
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
        print(json.dumps(data, indent=2))
except Exception as e:
    print("Error:", e)
