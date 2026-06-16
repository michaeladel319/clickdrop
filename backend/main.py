import os
import re
import uuid
import json
import threading
import asyncio
import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass
from typing import Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
import urllib.request
import urllib.parse
import yt_dlp

from spotify_downloader import get_spotify_metadata, download_spotify_track, initialize_spotify_client, CONFIG_FILE

app = FastAPI(title="Android Media Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/proxy")
def proxy_url(url: str = Query(..., description="URL to proxy")):
    try:
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
            }
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read()
            content_type = response.headers.get('Content-Type', 'text/html')
            
            if 'text/html' in content_type:
                html = content.decode('utf-8', errors='ignore')
                parsed_url = urllib.parse.urlparse(url)
                base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
                
                injection = f"""
                <base href="{base_url}/">
                <script>
                function notifyParent() {{
                    try {{
                        window.parent.postMessage({{
                            type: 'url_change',
                            url: window.location.href
                        }}, '*');
                    }} catch (err) {{
                        console.error('Failed to postMessage:', err);
                    }}
                }}

                document.addEventListener('click', function(e) {{
                    var target = e.target.closest('a');
                    if (target && target.href) {{
                        var absoluteUrl = target.href;
                        if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {{
                            e.preventDefault();
                            e.stopPropagation();
                            window.location.href = window.location.origin + '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
                        }}
                    }}
                }}, true);

                const origPush = history.pushState;
                history.pushState = function() {{
                    origPush.apply(this, arguments);
                    notifyParent();
                }};
                const origReplace = history.replaceState;
                history.replaceState = function() {{
                    origReplace.apply(this, arguments);
                    notifyParent();
                }};

                window.addEventListener('popstate', notifyParent);
                window.addEventListener('hashchange', notifyParent);

                if (document.readyState === 'complete') {{
                    notifyParent();
                }} else {{
                    window.addEventListener('load', notifyParent);
                }}
                </script>
                """
                if '<head>' in html:
                    html = html.replace('<head>', f'<head>{injection}', 1)
                else:
                    html = injection + html
                content = html.encode('utf-8')
                
            custom_response = Response(content=content, media_type=content_type)
            custom_response.headers["X-Frame-Options"] = "ALLOWALL"
            custom_response.headers["Content-Security-Policy"] = "frame-ancestors *"
            custom_response.headers["Access-Control-Allow-Origin"] = "*"
            return custom_response
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

tasks = {}

def make_progress_hook(task_id):
    def hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes', 0)
            percent = (downloaded / total * 100) if total > 0 else 0
            
            tasks[task_id].update({
                'status': 'downloading',
                'progress': round(percent, 1),
                'downloaded_bytes': downloaded,
                'total_bytes': total,
                'speed': d.get('speed', 0),
                'eta': d.get('eta', 0)
            })
        elif d['status'] == 'finished':
            tasks[task_id].update({
                'status': 'processing',
                'progress': 100.0
            })
    return hook

def bg_download(task_id: str, url: str, format_id: Optional[str], audio_only: bool, manual_title: Optional[str] = None, manual_artist: Optional[str] = None):
    try:
        if "spotify.com" in url or "open.spotify.com" in url:
            title = manual_title or 'Resolving Track...'
            artist = manual_artist or 'Spotify'
            tasks[task_id].update({
                'status': 'downloading',
                'progress': 0.0,
                'title': title,
                'artist': artist
            })
            
            def ssp_hook(d):
                if d['status'] == 'downloading':
                    progress = d.get('progress', 0.0)
                    tasks[task_id].update({
                        'progress': progress,
                        'speed': d.get('speed', 0),
                        'eta': d.get('eta', 0)
                    })
                elif d['status'] == 'finished':
                    tasks[task_id].update({
                        'status': 'processing',
                        'progress': 100.0
                    })
            
            file_path, metadata = download_spotify_track(
                url, 
                DOWNLOAD_DIR, 
                progress_hook=ssp_hook,
                manual_title=manual_title,
                manual_artist=manual_artist
            )
            filename = os.path.basename(file_path)
            
            tasks[task_id].update({
                'status': 'completed',
                'progress': 100.0,
                'file_path': file_path,
                'filename': filename,
                'title': metadata['title'],
                'artist': metadata['artist'],
                'type': 'audio'
            })
        else:
            tasks[task_id].update({
                'status': 'downloading',
                'progress': 0.0,
                'title': 'Fetching media details...',
                'artist': 'Extracting...'
            })
            
            ydl_opts_info = {
                'quiet': True, 
                'no_warnings': True,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['ios', 'tv', 'web']
                    }
                }
            }
            if os.path.exists("ffmpeg.exe"):
                ydl_opts_info['ffmpeg_location'] = "."
                
            with yt_dlp.YoutubeDL(ydl_opts_info) as ydl:
                info = ydl.extract_info(url, download=False)
                title = info.get('title', 'Unknown Media')
                uploader = info.get('uploader') or info.get('creator') or info.get('user') or 'Unknown Creator'
                duration = info.get('duration', 0)
                thumbnail = info.get('thumbnail')
                
                tasks[task_id].update({
                    'title': title,
                    'artist': uploader,
                    'duration': duration,
                    'thumbnail': thumbnail
                })
                
            clean_title = re.sub(r'[\\/*?:"<>|]', "", title)
            
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'progress_hooks': [make_progress_hook(task_id)],
                'extractor_args': {
                    'youtube': {
                        'player_client': ['ios', 'tv', 'web']
                    }
                }
            }
            
            if os.path.exists("ffmpeg.exe"):
                ydl_opts['ffmpeg_location'] = "."
                
            if audio_only:
                ydl_opts.update({
                    'format': 'bestaudio/best',
                    'outtmpl': os.path.join(DOWNLOAD_DIR, f"{clean_title}.%(ext)s"),
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }]
                })
                ext = 'mp3'
            else:
                fmt = 'best'
                if format_id and format_id != 'best':
                    fmt = f"{format_id}+bestaudio/best"
                
                ydl_opts.update({
                    'format': fmt,
                    'outtmpl': os.path.join(DOWNLOAD_DIR, f"{clean_title}.%(ext)s"),
                    'merge_output_format': 'mp4'
                })
                ext = 'mp4'
                
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
                
            filename = f"{clean_title}.{ext}"
            file_path = os.path.join(DOWNLOAD_DIR, filename)
            
            if not os.path.exists(file_path):
                # Search directory for match
                for f in os.listdir(DOWNLOAD_DIR):
                    if f.startswith(clean_title):
                        filename = f
                        file_path = os.path.join(DOWNLOAD_DIR, f)
                        break
                        
            tasks[task_id].update({
                'status': 'completed',
                'progress': 100.0,
                'file_path': file_path,
                'filename': filename,
                'type': 'audio' if audio_only else 'video'
            })
            
    except Exception as e:
        print(f"Error in bg_download for task {task_id}: {e}")
        tasks[task_id].update({
            'status': 'failed',
            'error_message': str(e)
        })

@app.get("/api/search")
def search_media(query: str = Query(..., description="The search query"), type: str = Query("video", description="video or audio")):
    """
    Performs a YouTube search and returns the top 8 results metadata (flat-extraction).
    """
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['ios', 'tv', 'web']
                }
            }
        }
        if os.path.exists("ffmpeg.exe"):
            ydl_opts['ffmpeg_location'] = "."
            
        search_query = f"ytsearch8:{query}"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_query, download=False)
            entries = info.get('entries', [])
            
            results = []
            for entry in entries:
                if entry:
                    video_id = entry.get("id")
                    results.append({
                        "id": video_id,
                        "title": entry.get("title"),
                        "url": f"https://www.youtube.com/watch?v={video_id}" if video_id else entry.get("url"),
                        "duration": entry.get("duration", 0),
                        "thumbnail": f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg" if video_id else None,
                        "artist": entry.get("uploader") or entry.get("author") or "Unknown Channel"
                    })
            return results
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/info")
def get_info(url: str = Query(..., description="The media URL to inspect")):
    """
    Analyzes a URL to retrieve meta info before downloading.
    """
    try:
        if "spotify.com" in url or "open.spotify.com" in url:
            try:
                metadata = get_spotify_metadata(url)
                return {
                    "type": "spotify",
                    "title": metadata["title"],
                    "artist": metadata["artist"],
                    "thumbnail": metadata["image_url"],
                    "duration": metadata.get("duration", 0),
                    "formats": [{"id": "audio_mp3", "label": "Audio (MP3)"}]
                }
            except Exception as spotify_err:
                print(f"Spotify metadata scraping failed, sending fallback: {spotify_err}")
                return {
                    "type": "spotify_fallback",
                    "title": "",
                    "artist": "",
                    "thumbnail": None,
                    "duration": 0,
                    "formats": [{"id": "audio_mp3", "label": "Audio (MP3)"}],
                    "message": "Spotify metadata scraping failed. Please enter the song details manually."
                }
        else:
            ydl_opts = {
                'quiet': True, 
                'no_warnings': True,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['ios', 'tv', 'web']
                    }
                }
            }
            if os.path.exists("ffmpeg.exe"):
                ydl_opts['ffmpeg_location'] = "."
                
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                formats = []
                is_tiktok_or_ig = "tiktok.com" in url.lower() or "instagram.com" in url.lower()
                if not is_tiktok_or_ig:
                    formats.append({"id": "audio_mp3", "label": "Audio (MP3)"})
                
                has_video = info.get('duration') is not None or 'video' in info.get('formats', [{}])[0].get('vcodec', '')
                
                if has_video:
                    video_formats = {}
                    best_audio_size = 0
                    for f in info.get('formats', []):
                        if f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                            s = f.get('filesize') or f.get('filesize_approx') or 0
                            if s > best_audio_size:
                                best_audio_size = s
                                
                    for f in info.get('formats', []):
                        vcodec = f.get('vcodec', 'none')
                        height = f.get('height')
                        format_id_val = f.get('format_id')
                        if vcodec != 'none' and height:
                            size = f.get('filesize') or f.get('filesize_approx') or 0
                            if height not in video_formats or size > video_formats[height]['size']:
                                video_formats[height] = {
                                    'id': format_id_val,
                                    'height': height,
                                    'size': size
                                }
                                
                    sorted_heights = sorted(video_formats.keys(), reverse=True)
                    if not sorted_heights:
                        formats.append({"id": "best", "label": "Best Available quality"})
                    for h in sorted_heights:
                        vf = video_formats[h]
                        total_size = vf['size'] + best_audio_size
                        if total_size > 0:
                            mb = total_size / (1024 * 1024)
                            label = f"{h}p ({mb:.1f} MB)"
                        else:
                            label = f"{h}p"
                        formats.append({"id": vf['id'], "label": label})
                
                return {
                    "type": "video" if has_video else "audio",
                    "title": info.get('title', 'Unknown Media'),
                    "artist": info.get('uploader') or info.get('creator') or info.get('user') or 'Unknown Creator',
                    "thumbnail": info.get('thumbnail') or info.get('thumbnails', [{}])[-1].get('url'),
                    "duration": info.get('duration', 0),
                    "formats": formats
                }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/download")
def trigger_download(
    background_tasks: BackgroundTasks,
    url: str = Query(..., description="The URL to download"),
    format_id: Optional[str] = Query(None, description="The format selection"),
    audio_only: bool = Query(False, description="Convert to audio only"),
    manual_title: Optional[str] = Query(None, description="Manual song title fallback"),
    manual_artist: Optional[str] = Query(None, description="Manual artist name fallback")
):
    """
    Spawns a background downloading task.
    """
    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        'task_id': task_id,
        'url': url,
        'status': 'pending',
        'progress': 0.0,
        'title': 'Initializing...',
        'artist': 'Please wait',
        'speed': 0,
        'eta': 0,
        'filename': None,
        'file_path': None,
        'type': 'audio' if audio_only or format_id == 'audio_mp3' else 'video'
    }
    
    actual_audio_only = audio_only or (format_id == 'audio_mp3')
    
    background_tasks.add_task(
        bg_download, 
        task_id, 
        url, 
        format_id, 
        actual_audio_only, 
        manual_title, 
        manual_artist
    )
    return {"task_id": task_id}

@app.get("/api/settings")
def get_settings():
    keys_configured = False
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                config = json.load(f)
                keys_configured = bool(config.get("spotify_client_id") and config.get("spotify_client_secret"))
        except Exception:
            pass
    return {"spotify_keys_configured": keys_configured}

@app.post("/api/settings")
def save_settings(data: dict):
    client_id = data.get("spotify_client_id")
    client_secret = data.get("spotify_client_secret")
    
    config = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                config = json.load(f)
        except Exception:
            pass
            
    config["spotify_client_id"] = client_id
    config["spotify_client_secret"] = client_secret
    
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
            
        initialize_spotify_client()
        return {"status": "success", "message": "Settings saved successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {e}")

@app.get("/api/progress/{task_id}")
async def get_progress(task_id: str):
    async def event_generator():
        while True:
            if task_id not in tasks:
                yield f"data: {json.dumps({'status': 'not_found'})}\n\n"
                break
                
            task = tasks[task_id]
            yield f"data: {json.dumps(task)}\n\n"
            
            if task['status'] in ['completed', 'failed']:
                break
                
            await asyncio.sleep(0.5)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/history")
def get_download_history():
    history = []
    if os.path.exists(DOWNLOAD_DIR):
        for f in os.listdir(DOWNLOAD_DIR):
            path = os.path.join(DOWNLOAD_DIR, f)
            if os.path.isfile(path) and not f.startswith('.'):
                size = os.path.getsize(path)
                ext = f.split('.')[-1].lower()
                history.append({
                    "filename": f,
                    "size_bytes": size,
                    "type": "audio" if ext in ['mp3', 'm4a', 'wav', 'ogg', 'flac'] else "video",
                    "path": f"/api/stream/{f}"
                })
    return history

@app.get("/api/stream/{filename}")
def stream_file(filename: str):
    file_path = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
