import os
import subprocess
import re
import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass
import json
from spotdl.types.song import Song
from spotdl.utils.spotify import SpotifyClient
from spotdl.utils.config import create_settings
from spotdl.utils.arguments import parse_arguments

CONFIG_FILE = "config.json"

def initialize_spotify_client():
    """
    Initializes the spotdl SpotifyClient.
    Checks if a custom client_id/secret is saved in config.json.
    Otherwise, attempts anonymous initialization.
    """
    try:
        client_id = None
        client_secret = None
        use_official_api = False
        
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r") as f:
                config = json.load(f)
                client_id = config.get("spotify_client_id")
                client_secret = config.get("spotify_client_secret")
                if client_id and client_secret:
                    use_official_api = True
                    
        if use_official_api:
            print(f"Initializing SpotifyClient with official API keys (ID: {client_id[:6]}...)")
            SpotifyClient.init(
                client_id=client_id,
                client_secret=client_secret,
                use_official_api=True
            )
            print("SpotifyClient successfully initialized with official credentials!")
        else:
            # Fallback to anonymous settings loader
            print("Initializing SpotifyClient anonymously...")
            old_argv = sys.argv
            sys.argv = ["spotdl", "https://open.spotify.com/track/4PTG3Z6ehGkBF3zIqYQG6F"]
            args = parse_arguments()
            spotify_settings, _, _ = create_settings(args)
            sys.argv = old_argv
            
            SpotifyClient.init(**spotify_settings)
            print("SpotifyClient successfully initialized anonymously!")
    except Exception as e:
        print(f"Failed to initialize Spotify client: {e}")

# Call initialization immediately
initialize_spotify_client()

def get_spotify_metadata(url):
    """
    Retrieves track metadata using spotdl's internal Song parser.
    Returns a dict with title, artist, album, image_url, and duration.
    """
    try:
        print(f"Retrieving spotdl Song metadata for {url}...")
        song = Song.from_url(url)
        return {
            "title": song.name,
            "artist": ", ".join(song.artists) if isinstance(song.artists, list) else song.artists,
            "album": song.album_name or f"{song.name} - Single",
            "image_url": song.cover_url,
            "duration": int(song.duration) if song.duration else 0
        }
    except Exception as e:
        print(f"Error extracting Spotify metadata: {e}")
        # Raise exception so the backend can offer manual input fallback
        raise e

def download_spotify_track(url, output_dir, progress_hook=None, manual_title=None, manual_artist=None):
    """
    Downloads a Spotify track by invoking the spotdl command-line tool.
    If metadata extraction fails, we can fall back to manual title/artist and search YouTube.
    """
    metadata = None
    if manual_title and manual_artist:
        metadata = {
            "title": manual_title,
            "artist": manual_artist,
            "album": f"{manual_title} - Single",
            "image_url": None,
            "duration": 0
        }
    else:
        try:
            metadata = get_spotify_metadata(url)
        except Exception as e:
            print("Could not resolve Spotify metadata automatically.")
            raise e

    artists = metadata["artist"]
    title = metadata["title"]
    clean_title = re.sub(r'[\\/*?:"<>|]', "", f"{artists} - {title}")
    final_mp3_path = os.path.join(output_dir, f"{clean_title}.mp3")
    
    os.makedirs(output_dir, exist_ok=True)
    
    if os.path.exists(final_mp3_path):
        print(f"Track already downloaded: {final_mp3_path}")
        return final_mp3_path, metadata

    print(f"Downloading track using spotdl: {artists} - {title}...")
    
    # In Windows, the python path is .venv/Scripts/python.exe
    python_path = os.path.join(".venv", "Scripts", "python.exe")
    if not os.path.exists(python_path):
        python_path = "python.exe" if sys.platform == "win32" else "python"
        
    # If downloading via manual search, we search the query instead of URL
    query_or_url = url
    if manual_title and manual_artist:
        query_or_url = f"{manual_artist} - {manual_title}"
        
    cmd = [
        python_path,
        "-m",
        "spotdl",
        "download",
        query_or_url,
        "--output",
        os.path.join(output_dir, "{artists} - {title}.{ext}"),
        "--format",
        "mp3"
    ]
    
    # If custom credentials exist in config, pass them to CLI
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                config = json.load(f)
                cid = config.get("spotify_client_id")
                sec = config.get("spotify_client_secret")
                if cid and sec:
                    cmd.extend(["--client-id", cid, "--client-secret", sec])
        except Exception as config_err:
            print("Error loading config for spotdl CLI arguments:", config_err)

    env = os.environ.copy()
    current_dir = os.getcwd()
    env["PATH"] = current_dir + os.pathsep + env.get("PATH", "")
    
    process = subprocess.Popen(
        cmd, 
        stdout=subprocess.PIPE, 
        stderr=subprocess.STDOUT, 
        text=True, 
        encoding='utf-8',
        bufsize=1,
        env=env
    )
    
    if progress_hook:
        progress_hook({'status': 'downloading', 'progress': 10, 'downloaded_bytes': 10, 'total_bytes': 100, 'speed': 1024*1024, 'eta': 10})
        
    for line in iter(process.stdout.readline, ''):
        line_str = line.strip()
        if line_str:
            print(f"[spotdl] {line_str}")
            pct_match = re.search(r'(\d+)%', line_str)
            if pct_match and progress_hook:
                pct = int(pct_match.group(1))
                progress_hook({'status': 'downloading', 'progress': pct, 'downloaded_bytes': pct, 'total_bytes': 100, 'speed': 1024*512, 'eta': 5})
                
    process.stdout.close()
    return_code = process.wait()
    
    if return_code != 0:
        raise Exception(f"spotdl download failed with return code {return_code}")
        
    if progress_hook:
        progress_hook({'status': 'finished'})
        
    if os.path.exists(final_mp3_path):
        return final_mp3_path, metadata
        
    # Search for matching file
    for f in os.listdir(output_dir):
        if f.endswith(".mp3"):
            if clean_title[:10].lower() in f.lower() or title[:10].lower() in f.lower():
                found_path = os.path.join(output_dir, f)
                os.rename(found_path, final_mp3_path)
                return final_mp3_path, metadata
                
    raise FileNotFoundError(f"Could not find downloaded MP3 file in {output_dir}")
