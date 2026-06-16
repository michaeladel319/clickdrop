import urllib.request
import re

url = "https://open.spotify.com/track/4PTG3Z6ehGkBF3zIqYQGS3"
req = urllib.request.Request(url, headers={'User-Agent': 'Twitterbot/1.0'})
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
        title = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
        if title: print("TITLE TAG:", title.group(1))
        
        for meta in re.finditer(r'<meta\s+([^>]+)>', html):
            print("META:", meta.group(1))
except Exception as e:
    print("Error:", e)
