import { useState, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  Music,
  FolderDown,
  AlertCircle,
  X
} from 'lucide-react';

interface AnywhereDLPluginInterface {
  extractMetadata(options: { url: string }): Promise<MediaInfo>;
  startDownload(options: { url: string; formatId: string; audioOnly: boolean; taskId: string }): Promise<{ status: string }>;
  updateEngine(): Promise<{ status: string }>;
  getSharedUrl(): Promise<{ url: string }>;
  addListener(eventName: 'downloadProgress', listenerFunc: (data: { taskId: string; progress: number; eta: number }) => void): Promise<any>;
  addListener(eventName: 'downloadFailed', listenerFunc: (data: { taskId: string; error: string }) => void): Promise<any>;
  removeAllListeners(): Promise<void>;
}

const AnywhereDL = registerPlugin<AnywhereDLPluginInterface>('AnywhereDLPlugin');

interface MediaInfo {
  type: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  formats: { id: string; label: string }[];
  message?: string;
}

interface DownloadTask {
  task_id: string;
  url: string;
  status: string;
  progress: number;
  title: string;
  artist: string;
  speed: number;
  eta: number;
  filename: string | null;
  file_path: string | null;
  type: 'audio' | 'video';
  thumbnail?: string;
  duration?: number;
  error_message?: string;
}

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link extraction state
  const [analyzedMedia, setAnalyzedMedia] = useState<MediaInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('audio_mp3');

  // Active downloads queue
  const [activeTasks, setActiveTasks] = useState<DownloadTask[]>([]);

  // Helper to construct request URLs
  const getApiUrl = (endpoint: string) => {
    const host = window.location.hostname || 'localhost';
    const base = `http://${host}:8000`;
    return `${base}${endpoint}`;
  };

  // Listen to native download events
  useEffect(() => {
    let progressListener: any;
    let failedListener: any;

    if (Capacitor.isNativePlatform()) {
      AnywhereDL.addListener('downloadProgress', (data) => {
        setActiveTasks(prev => {
          const isComplete = data.progress >= 100;
          if (isComplete) {
            setTimeout(() => {
              setActiveTasks(p => p.filter(t => t.task_id !== data.taskId));
            }, 4500);
          }
          return prev.map(t => {
            if (t.task_id === data.taskId) {
              return {
                ...t,
                status: isComplete ? 'completed' : 'downloading',
                progress: data.progress,
                eta: data.eta
              };
            }
            return t;
          });
        });
      }).then(l => { progressListener = l; });

      AnywhereDL.addListener('downloadFailed', (data) => {
        setActiveTasks(prev => {
          return prev.map(t => {
            if (t.task_id === data.taskId) {
              return {
                ...t,
                status: 'failed',
                error_message: data.error
              };
            }
            return t;
          });
        });
      }).then(l => { failedListener = l; });
    }

    return () => {
      if (progressListener) progressListener.remove();
      if (failedListener) failedListener.remove();
    };
  }, []);

  const checkBackendReachable = async (): Promise<boolean> => {
    if (Capacitor.isNativePlatform()) return false; // Always local on mobile
    
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1200); // 1.2s timeout
      const res = await fetch(getApiUrl('/api/settings'), { signal: controller.signal });
      clearTimeout(id);
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  const startSpotifyDownloadDirectly = async (spotifyUrl: string, isBackendActive: boolean) => {
    const selectedFormat = 'audio_mp3';
    const audioOnly = true;

    if (Capacitor.isNativePlatform() && !isBackendActive) {
      // Standalone Mobile Mode: Spotify URL directly starts download not supported without parsing
      return;
    }

    if (isBackendActive) {
      try {
        const downloadUrl = `/api/download?url=${encodeURIComponent(spotifyUrl)}&format_id=${selectedFormat}&audio_only=${audioOnly}`;
        const res = await fetch(getApiUrl(downloadUrl), { method: 'POST' });
        if (!res.ok) throw new Error('Failed to start Spotify download');
        const data = await res.json();

        setUrl('');

        connectToProgress(data.task_id, 'Spotify Track', 'Downloading via PC...');
      } catch (err: any) {
        setError(err.message || 'Failed to trigger Spotify download');
      }
    } else {
      try {
        const downloadUrl = `/api/download?url=${encodeURIComponent(spotifyUrl)}&format_id=${selectedFormat}&audio_only=${audioOnly}`;
        const res = await fetch(getApiUrl(downloadUrl), { method: 'POST' });
        if (!res.ok) throw new Error('Failed to start Spotify download');
        const data = await res.json();

        setUrl('');

        connectToProgress(data.task_id, 'Spotify Track', 'Downloading...');
      } catch (err: any) {
        setError(err.message || 'Failed to trigger Spotify download');
      }
    }
  };

  const handleAnalyze = async (overrideUrl?: string) => {
    // If it's an event object (e.g. from onClick), overrideUrl will be an object. We only want it if it's a string.
    const targetUrl = typeof overrideUrl === 'string' ? overrideUrl : url;
    if (!targetUrl.trim()) return;
    setLoading(true);
    setError(null);
    setAnalyzedMedia(null);

    const isBackendActive = await checkBackendReachable();

    if (targetUrl.includes('spotify.com') || targetUrl.includes('open.spotify.com')) {
      if (Capacitor.isNativePlatform() && !isBackendActive) {
        try {
          const data = await AnywhereDL.extractMetadata({ url: targetUrl.trim() });
          setAnalyzedMedia(data);
          if (data.formats && data.formats.length > 0) {
            setSelectedFormat(data.formats[0].id);
          }
        } catch (err: any) {
          // Fallback to Odesli API if native scraping failed
          try {
            const odesliRes = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(targetUrl.trim())}`);
            if (!odesliRes.ok) throw new Error('Odesli API failed');
            const odesliData = await odesliRes.json();
            const entityId = odesliData.entityUniqueId;
            const trackInfo = odesliData.entitiesByUniqueId[entityId];
            
            if (!trackInfo || !trackInfo.title) throw new Error('No track info found');
            
            setAnalyzedMedia({
              type: 'spotify_track',
              title: trackInfo.title,
              artist: trackInfo.artistName || 'Unknown Artist',
              thumbnail: trackInfo.thumbnailUrl || '',
              duration: 0,
              formats: [{ id: 'audio_mp3', label: 'Audio (MP3)' }]
            });
            setSelectedFormat('audio_mp3');
          } catch(fallbackErr) {
             setError('Failed to extract Spotify metadata. Please make sure it is a valid track link.');
          }
        } finally {
          setLoading(false);
        }
        return;
      }
      setLoading(false);
      await startSpotifyDownloadDirectly(targetUrl.trim(), isBackendActive);
      return;
    }

    try {
      if (Capacitor.isNativePlatform() && !isBackendActive) {
        const data = await AnywhereDL.extractMetadata({ url: targetUrl.trim() });
        setAnalyzedMedia(data);
        if (data.formats && data.formats.length > 0) {
          setSelectedFormat(data.formats[0].id);
        }
      } else {
        const res = await fetch(getApiUrl(`/api/info?url=${encodeURIComponent(targetUrl)}`));
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || 'Failed to parse link metadata');
        }
        const data: MediaInfo = await res.json();
        setAnalyzedMedia(data);
        if (data.formats && data.formats.length > 0) {
          setSelectedFormat(data.formats[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Make sure the link is valid.');
    } finally {
      setLoading(false);
    }
  };

  const triggerDeviceDownload = (filename: string) => {
    const link = document.createElement('a');
    link.href = getApiUrl(`/api/stream/${encodeURIComponent(filename)}`);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStartDownload = async () => {
    const taskId = Math.random().toString(36).substring(2, 11);
    const audioOnly = selectedFormat === 'audio_mp3';
    const isBackendActive = await checkBackendReachable();

    if (Capacitor.isNativePlatform() && !isBackendActive) {
      try {
        let downloadUrl = url.trim();
        if (analyzedMedia?.type === 'spotify_track') {
          downloadUrl = `ytsearch1:"${analyzedMedia.artist}" "${analyzedMedia.title}" official audio`;
        }

        // Add task to active queue
        setActiveTasks(prev => [
          ...prev,
          {
            task_id: taskId,
            url: url,
            status: 'downloading',
            progress: 0.0,
            title: analyzedMedia?.title || 'Downloading...',
            artist: analyzedMedia?.artist || 'Native Downloader',
            speed: 0,
            eta: 0,
            filename: null,
            file_path: null,
            type: audioOnly ? 'audio' : 'video',
            thumbnail: analyzedMedia?.thumbnail
          }
        ]);

        setAnalyzedMedia(null);
        setUrl('');

        // Trigger native download
        await AnywhereDL.startDownload({
          url: downloadUrl,
          formatId: selectedFormat,
          audioOnly: audioOnly,
          taskId: taskId
        });

      } catch (err: any) {
        setError(err.message || 'Failed to start native download');
        setActiveTasks(prev => prev.filter(t => t.task_id !== taskId));
      }
    } else {
      try {
        let downloadUrl = `/api/download?url=${encodeURIComponent(url)}&format_id=${selectedFormat}&audio_only=${audioOnly}`;

        const res = await fetch(getApiUrl(downloadUrl), { method: 'POST' });
        if (!res.ok) throw new Error('Failed to start download');
        const data = await res.json();

        setAnalyzedMedia(null);
        setUrl('');

        connectToProgress(data.task_id);
      } catch (err: any) {
        setError(err.message || 'Failed to trigger download');
      }
    }
  };

  const connectToProgress = (taskId: string, customTitle?: string, customArtist?: string) => {
    const eventSource = new EventSource(getApiUrl(`/api/progress/${taskId}`));

    setActiveTasks(prev => {
      if (prev.some(t => t.task_id === taskId)) return prev;
      return [...prev, {
        task_id: taskId,
        url: url,
        status: 'pending',
        progress: 0.0,
        title: customTitle || 'Connecting...',
        artist: customArtist || 'Queueing',
        speed: 0,
        eta: 0,
        filename: null,
        file_path: null,
        type: selectedFormat === 'audio_mp3' ? 'audio' : 'video'
      }];
    });

    eventSource.onmessage = (event) => {
      const task: DownloadTask = JSON.parse(event.data);

      setActiveTasks(prev => {
        return prev.map(t => {
          if (t.task_id === taskId) {
            return { ...t, ...task };
          }
          return t;
        });
      });

      if (task.status === 'completed') {
        eventSource.close();
        if (task.filename) {
          triggerDeviceDownload(task.filename);
        }
        setTimeout(() => {
          setActiveTasks(prev => prev.filter(t => t.task_id !== taskId));
        }, 4500);
      } else if (task.status === 'failed') {
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setActiveTasks(prev =>
        prev.map(t => t.task_id === taskId ? { ...t, status: 'failed', error_message: 'Lost connection to server' } : t)
      );
    };
  };

  useEffect(() => {
    const checkSharedUrl = async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        const res = await AnywhereDL.getSharedUrl();
        if (res.url) {
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const matches = res.url.match(urlRegex);
          const finalUrl = matches ? matches[0] : res.url;
          setUrl(finalUrl);
          handleAnalyze(finalUrl);
        }
      } catch (e) {
        console.error("Failed to check shared URL", e);
      }
    };

    checkSharedUrl();

    let appStateListener: any;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          checkSharedUrl();
        }
      }).then(l => { appStateListener = l; });
    }

    return () => {
      if (appStateListener) appStateListener.remove();
    };
  }, []);

  return (
    <div className="app-container" style={{ paddingBottom: '2rem' }}>
      {/* 1. Header (Logo & Settings) */}
      <header className="profile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <FolderDown className="w-7 h-7 text-indigo-500" />
          <h1 className="profile-name" style={{ fontSize: '1.35rem', fontFamily: 'Outfit, sans-serif' }}>clickdrop</h1>
        </div>
      </header>

      {/* Main Downloader Body */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h2 className="section-title" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <FolderDown className="w-6 h-6 text-indigo-400" /> Link Downloader
        </h2>
        <p style={{ fontSize: '0.8rem', color: '#7d879c', margin: 0 }}>
          Paste a YouTube, TikTok, Instagram, Facebook, or Spotify link to analyze and download:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            className="search-field"
            style={{ padding: '0.875rem 1rem' }}
            placeholder="Paste your link here (e.g. https://www.youtube.com/watch?v=...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            onClick={() => handleAnalyze()}
            className="glow-button"
            disabled={loading || !url.trim()}
            style={{ height: '2.875rem' }}
          >
            {loading ? <span className="spinner"></span> : 'Analyze & Extract Media'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '1rem', textAlign: 'center' }}>
          <div className="premium-spinner"></div>
          <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>Extracting Media Content...</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Resolving formats and fetching metadata from server</span>
        </div>
      )}

      {error && (
        <div className="alert-error">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Analysis results */}
      {analyzedMedia && (
        <div className="glass-panel">
          <button onClick={() => setAnalyzedMedia(null)} className="close-btn">
            <X className="w-4 h-4" />
          </button>
          <h3 className="section-title" style={{ fontSize: '0.875rem' }}>URL Extract</h3>
          
          <div className="media-preview-card">
            {analyzedMedia.thumbnail ? (
              <img src={analyzedMedia.thumbnail} alt="thumb" className="preview-thumb" />
            ) : (
              <div className="preview-thumb-fallback"><Music className="w-6 h-6" /></div>
            )}
            <div className="preview-details">
              <span className="preview-title">{analyzedMedia.title || 'Unknown Title'}</span>
              <span className="preview-artist">{analyzedMedia.artist || 'Unknown Artist'}</span>
            </div>
          </div>

          <div className="form-group">
            <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)} className="select-field">
              {analyzedMedia.formats.map(fmt => (
                <option key={fmt.id} value={fmt.id}>{fmt.label}</option>
              ))}
            </select>
          </div>
          <button onClick={handleStartDownload} className="glow-button">Download</button>
        </div>
      )}

      {/* Active Queue */}
      {activeTasks.length > 0 && (
        <div className="library-queue-card">
          <span className="form-label" style={{ fontWeight: 'bold' }}>Active Downloads Queue:</span>
          {activeTasks.map(task => (
            <div key={task.task_id} className="lib-queue-item">
              <div className="lib-queue-header">
                <span className="lib-queue-title">{task.title}</span>
                <span className="lib-queue-pct">{task.progress}%</span>
              </div>
              <div className="lib-queue-track">
                <div className="lib-queue-bar" style={{ width: `${task.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
