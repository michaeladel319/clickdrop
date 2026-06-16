import urllib.request
import re

url = "https://open.spotify.com/track/4PTG3Z6ehGkBF3zIqYQGS3"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'})
with urllib.request.urlopen(req) as response:
    html = response.read().decode('utf-8')
    
    title = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
    if title: print("TITLE TAG:", title.group(1))
    
    for meta in re.finditer(r'<meta\s+([^>]+)>', html):
        print("META:", meta.group(1))
