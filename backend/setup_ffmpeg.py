import os
import sys
import urllib.request
import zipfile
import shutil

FFMPEG_URL = "https://github.com/GyanD/codexffmpeg/releases/download/7.0.1/ffmpeg-7.0.1-essentials_build.zip"
ZIP_PATH = "ffmpeg.zip"
EXTRACT_DIR = "ffmpeg_extracted"

def download_file(url, dest):
    print(f"Downloading FFmpeg from {url}...")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    req = urllib.request.Request(url, headers=headers)
    
    with urllib.request.urlopen(req) as response, open(dest, 'wb') as out_file:
        total_size = int(response.info().get('Content-Length', 0))
        downloaded = 0
        block_size = 1024 * 1024  # 1MB
        
        while True:
            buffer = response.read(block_size)
            if not buffer:
                break
            downloaded += len(buffer)
            out_file.write(buffer)
            if total_size > 0:
                percent = (downloaded / total_size) * 100
                print(f"Progress: {percent:.1f}% ({downloaded / (1024*1024):.1f}MB / {total_size / (1024*1024):.1f}MB)", end="\r")
        print("\nDownload complete!")

def extract_binaries(zip_path, extract_dir):
    print("Extracting ffmpeg.exe and ffprobe.exe...")
    if os.path.exists(extract_dir):
        shutil.rmtree(extract_dir)
        
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)
        
    # Find ffmpeg.exe and ffprobe.exe in the extracted files
    ffmpeg_exe = None
    ffprobe_exe = None
    
    for root, dirs, files in os.walk(extract_dir):
        for file in files:
            if file == "ffmpeg.exe":
                ffmpeg_exe = os.path.join(root, file)
            elif file == "ffprobe.exe":
                ffprobe_exe = os.path.join(root, file)
                
    if ffmpeg_exe and ffprobe_exe:
        shutil.copy(ffmpeg_exe, ".")
        shutil.copy(ffprobe_exe, ".")
        print("Successfully extracted ffmpeg.exe and ffprobe.exe to the current directory!")
        return True
    else:
        print("Error: Could not find ffmpeg.exe or ffprobe.exe in the zip archive.")
        return False

def main():
    try:
        # Check if already exists
        if os.path.exists("ffmpeg.exe") and os.path.exists("ffprobe.exe"):
            print("ffmpeg.exe and ffprobe.exe already exist in the current directory.")
            sys.exit(0)
            
        download_file(FFMPEG_URL, ZIP_PATH)
        success = extract_binaries(ZIP_PATH, EXTRACT_DIR)
        
        # Cleanup
        if os.path.exists(ZIP_PATH):
            os.remove(ZIP_PATH)
        if os.path.exists(EXTRACT_DIR):
            shutil.rmtree(EXTRACT_DIR)
            
        if success:
            print("FFmpeg setup completed successfully!")
        else:
            print("FFmpeg setup failed to extract binaries.")
            sys.exit(1)
            
    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
