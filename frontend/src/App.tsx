import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import {
  ArrowRight,
  ChevronLeft,
  Bell,
  Link as LinkIcon,
  Download,
  Share2,
  MoreVertical,
  RotateCw,
  Trash2,
  ArrowDownToLine,
  Video,
  Music,
  Sparkles,
  Layers,
  X,
  Check,
  Clock
} from 'lucide-react';

import onboardingPoster from './assets/onboarding_poster.jpg';
import fashionThumb from './assets/fashion_video_thumb.jpg';
import tetemaThumb from './assets/tetema_thumb.jpg';

export type ScreenType = 'welcome' | 'home' | 'downloads';
export type FilterTab = 'all' | 'complete' | 'failed';
export type MediaKind = 'video' | 'audio';

export interface MediaInfo {
  id: string;
  platform: string;
  url: string;
  title: string;
  description?: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  uploader: string | null;
  uploaderUrl?: string | null;
  qualities: {
    video: string[];
    audio: string[];
  };
  formats: {
    video: string[];
    audio: string[];
  };
}

export interface ActiveJob {
  id: string;
  title: string;
  desc?: string;
  thumbnail?: string | null;
  sizeLabel?: string;
  progress: number;
  status: 'QUEUED' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  dateGroup: string;
  filename?: string | null;
  speed?: number;
  eta?: number;
  kind?: MediaKind;
  format?: string;
}

const formatDuration = (sec?: number | null) => {
  if (!sec || isNaN(sec)) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const getQualityLabel = (q: string) => {
  if (!q) return '';
  const lower = q.toLowerCase();
  if (lower === 'highest') return 'Highest (HD)';
  if (lower === 'best') return 'Best Quality';
  if (/^\d+p$/i.test(q)) return q;
  if (/^\d+$/i.test(q)) return `${q}p`;
  return q;
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [downloadFilter, setDownloadFilter] = useState<FilterTab>('all');
  const [inputUrl, setInputUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Analyzed media state
  const [analyzedMedia, setAnalyzedMedia] = useState<MediaInfo | null>(null);
  const [selectedKind, setSelectedKind] = useState<MediaKind>('video');
  const [selectedQuality, setSelectedQuality] = useState<string>('highest');
  const [selectedFormat, setSelectedFormat] = useState<string>('mp4');

  const DOWNLOADS_STORAGE_KEY = 'anywhere_downloads_history_v1';

  const getInitialDownloads = (): ActiveJob[] => {
    try {
      const raw = localStorage.getItem(DOWNLOADS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Only return real downloads initiated by the user (filter out any mock cards)
          return parsed.filter((j: any) => j && !j.id?.startsWith('mock-'));
        }
      }
    } catch (e) {
      console.error('Failed to load downloads history', e);
    }
    return [];
  };

  // Downloads items loaded from local storage (real downloads only)
  const [jobs, setJobs] = useState<ActiveJob[]>(getInitialDownloads);
  // Kebab menu: tracks the open job *and* the anchor button's viewport rect,
  // because the popover is rendered through a portal (see below) and positioned
  // from that rect rather than by CSS flow.
  const [openMenu, setOpenMenu] = useState<{
    jobId: string;
    rect: DOMRect;
    flipUp: boolean;
    height: number;
  } | null>(null);
  const openMenuJobId = openMenu?.jobId ?? null;
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync jobs to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(jobs));
    } catch (e) {
      console.error('Failed to save downloads history to localStorage', e);
    }
  }, [jobs]);

  // Close kebab menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      setOpenMenu(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Measures the open popover once and flips it above the button when it would
  // run past the bottom of the viewport, so the last card's menu stays usable.
  useLayoutEffect(() => {
    if (!openMenu || !popoverRef.current) return;
    const height = popoverRef.current.offsetHeight;
    const fitsBelow = openMenu.rect.bottom + 6 + height <= window.innerHeight;
    if (openMenu.height !== height || openMenu.flipUp !== !fitsBelow) {
      setOpenMenu((cur) => (cur ? { ...cur, height, flipUp: !fitsBelow } : cur));
    }
  }, [openMenu]);

  const handleDeleteJob = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setOpenMenu(null);
  };

  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

  const homeTabRef = useRef<HTMLButtonElement>(null);
  const downloadsTabRef = useRef<HTMLButtonElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  const filterAllRef = useRef<HTMLButtonElement>(null);
  const filterCompleteRef = useRef<HTMLButtonElement>(null);
  const filterFailedRef = useRef<HTMLButtonElement>(null);
  const [filterIndicatorStyle, setFilterIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const activeEl = currentScreen === 'home' ? homeTabRef.current : downloadsTabRef.current;
      if (activeEl) {
        setIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
        });
      }
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => {
      window.removeEventListener('resize', updateIndicator);
    };
  }, [currentScreen, jobs.length]);

  useLayoutEffect(() => {
    const updateFilterIndicator = () => {
      let targetEl: HTMLButtonElement | null = null;
      if (downloadFilter === 'all') targetEl = filterAllRef.current;
      else if (downloadFilter === 'complete') targetEl = filterCompleteRef.current;
      else if (downloadFilter === 'failed') targetEl = filterFailedRef.current;

      if (targetEl) {
        setFilterIndicatorStyle({
          left: targetEl.offsetLeft,
          width: targetEl.offsetWidth,
        });
      }
    };

    updateFilterIndicator();
    window.addEventListener('resize', updateFilterIndicator);
    return () => {
      window.removeEventListener('resize', updateFilterIndicator);
    };
  }, [downloadFilter, currentScreen]);

  const openSocialPlatform = (platform: 'tiktok' | 'instagram' | 'facebook' | 'x' | 'pinterest') => {
    const configs = {
      tiktok: {
        android: 'intent://www.tiktok.com/#Intent;package=com.zhiliaoapp.musically;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.tiktok.com;end;',
        ios: 'snssdk1233://',
        web: 'https://www.tiktok.com'
      },
      instagram: {
        android: 'intent://instagram.com/#Intent;package=com.instagram.android;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.instagram.com;end;',
        ios: 'instagram://app',
        web: 'https://www.instagram.com'
      },
      facebook: {
        android: 'intent://facebook.com/#Intent;package=com.facebook.katana;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.facebook.com;end;',
        ios: 'fb://',
        web: 'https://www.facebook.com'
      },
      x: {
        android: 'intent://twitter.com/#Intent;package=com.twitter.android;scheme=https;S.browser_fallback_url=https%3A%2F%2Fx.com;end;',
        ios: 'twitter://',
        web: 'https://x.com'
      },
      pinterest: {
        android: 'intent://pinterest.com/#Intent;package=com.pinterest;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.pinterest.com;end;',
        ios: 'pinterest://',
        web: 'https://www.pinterest.com'
      }
    };

    const target = configs[platform];
    if (!target) return;

    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);

    if (!isAndroid && !isIOS) {
      // Desktop: Open website in new tab
      window.open(target.web, '_blank', 'noopener,noreferrer');
      return;
    }

    // Mobile (Android or iOS)
    let appOpened = false;
    const onHidden = () => {
      if (document.hidden) {
        appOpened = true;
      }
    };

    document.addEventListener('visibilitychange', onHidden, { once: true });
    window.addEventListener('pagehide', () => { appOpened = true; }, { once: true });
    window.addEventListener('blur', () => { appOpened = true; }, { once: true });

    if (isAndroid) {
      // Android Chrome & browsers natively handle intent:// with automatic S.browser_fallback_url fallback.
      // Also provide a JS timeout guard in case of browsers that ignore intents.
      window.location.href = target.android;

      setTimeout(() => {
        document.removeEventListener('visibilitychange', onHidden);
        if (!appOpened && !document.hidden) {
          window.location.href = target.web;
        }
      }, 1500);
      return;
    }

    if (isIOS) {
      // iOS: Try custom URL scheme. If app is installed, iOS launches it or prompts to open.
      // If not installed, page remains visible and redirects to web site.
      window.location.href = target.ios;

      setTimeout(() => {
        document.removeEventListener('visibilitychange', onHidden);
        if (!appOpened && !document.hidden) {
          window.location.href = target.web;
        }
      }, 1500);
    }
  };

  const safeParseResponse = async (res: Response, endpointDesc = 'server') => {
    const text = await res.text();
    if (!text || !text.trim()) {
      throw new Error(`Empty response from ${endpointDesc} (${getApiBase()}, Status ${res.status}). Ensure the server is online.`);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (text.trim().toLowerCase().startsWith('<!doctype') || text.includes('<html')) {
        throw new Error(
          `Cannot connect to ${endpointDesc} at ${getApiBase()}. Received HTML instead of JSON API response.`
        );
      }
      throw new Error(`${endpointDesc} at ${getApiBase()} returned: "${text.slice(0, 80)}" (Status ${res.status})`);
    }
    return parsed;
  };

  const getApiBase = () => {
    if (typeof window !== 'undefined' && localStorage.getItem('anywhere_custom_api_url')) {
      return localStorage.getItem('anywhere_custom_api_url')!.replace(/\/+$/, '');
    }
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
    }
    if (Capacitor.isNativePlatform()) {
      // In native Android APK, relative /v2 loops back to the local asset server (index.html).
      // Fallback to host machine LAN IP on port 3001
      return 'http://192.168.1.10:3001/v2';
    }
    return '/v2';
  };

  useEffect(() => {
    return () => {
      eventSourcesRef.current.forEach((es) => es.close());
      eventSourcesRef.current.clear();
    };
  }, []);

  const handleAnalyze = async (sampleUrl?: string) => {
    const target = (sampleUrl || inputUrl).trim();
    if (!target) return;

    setAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`${getApiBase()}/media/info?url=${encodeURIComponent(target)}`);
      const data: MediaInfo = await safeParseResponse(res, 'Media Info');
      if (!res.ok) {
        throw new Error((data as any)?.message || `Error ${res.status}`);
      }
      setAnalyzedMedia(data);

      const kind: MediaKind = data.qualities?.video?.length ? 'video' : 'audio';
      setSelectedKind(kind);
      setSelectedQuality(data.qualities?.[kind]?.[0] || (kind === 'video' ? 'highest' : 'best'));
      setSelectedFormat(data.formats?.[kind]?.[0] || (kind === 'video' ? 'mp4' : 'mp3'));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to extract video information');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleStartDownload = async () => {
    if (!analyzedMedia && !inputUrl.trim()) return;
    const targetUrl = analyzedMedia?.url || inputUrl.trim();
    const title = analyzedMedia?.title || 'Video Downloader Media';
    const thumb = analyzedMedia?.thumbnail || fashionThumb;

    try {
      const res = await fetch(`${getApiBase()}/downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          kind: selectedKind,
          quality: selectedQuality,
          format: selectedFormat
        })
      });

      const jobData = await safeParseResponse(res, 'Download Job');
      if (!res.ok) {
        throw new Error((jobData as any)?.message || 'Failed to start download job');
      }

      const jobId = jobData.id;

      const todayFormatted = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).format(new Date());

      const newJob: ActiveJob = {
        id: jobId,
        title,
        desc: analyzedMedia?.uploader || 'High Quality Download',
        thumbnail: thumb,
        sizeLabel: 'Starting...',
        progress: 0,
        status: 'DOWNLOADING',
        dateGroup: todayFormatted,
        kind: selectedKind,
        format: selectedFormat
      };

      setJobs((prev) => [newJob, ...prev]);
      setCurrentScreen('downloads');
      setAnalyzedMedia(null);
      setInputUrl('');

      // Connect SSE
      const sse = new EventSource(`${getApiBase()}/downloads/${jobId}/events`);
      eventSourcesRef.current.set(jobId, sse);

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      progress: Math.round(data.percentage || 0),
                      sizeLabel: `${(data.downloadedBytes / (1024 * 1024)).toFixed(1)} / ${(data.totalBytes / (1024 * 1024)).toFixed(1)} MB`,
                      speed: data.speed,
                      eta: data.eta
                    }
                  : j
              )
            );
          } else if (data.type === 'complete') {
            const filename = data.job?.filename;
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      status: 'COMPLETED',
                      progress: 100,
                      filename,
                      sizeLabel: `${((data.job?.fileSizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB`
                    }
                  : j
              )
            );
            if (filename) {
              triggerDirectDownload(filename);
            }
            sse.close();
          } else if (data.type === 'error') {
            setJobs((prev) =>
              prev.map((j) => (j.id === jobId ? { ...j, status: 'FAILED' } : j))
            );
            sse.close();
          }
        } catch (e) {}
      };

      sse.onerror = () => {
        sse.close();
      };
    } catch (err: any) {
      setErrorMessage(err.message || 'Download failed');
    }
  };

  const triggerDirectDownload = (filename: string) => {
    const link = document.createElement('a');
    link.href = `${getApiBase()}/files/${encodeURIComponent(filename)}`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Grouped jobs filtering
  const filteredJobs = jobs.filter((j) => {
    if (downloadFilter === 'complete') return j.status === 'COMPLETED';
    if (downloadFilter === 'failed') return j.status === 'FAILED';
    return true;
  });

  const dateGroups = Array.from(new Set(filteredJobs.map((j) => j.dateGroup)));

  return (
    <div className="app-container">
      {/* =====================================================================
          SCREEN 1: ONBOARDING / WELCOME
          ===================================================================== */}
      {currentScreen === 'welcome' && (
        <div className="onboarding-screen">
          <div className="onboarding-inner">
            <div className="onboarding-visual-area">
              <div className="cards-stack-wrapper">
                <div
                  className="stack-card card-back"
                  style={{ backgroundImage: `url(${onboardingPoster})` }}
                />
                <div
                  className="stack-card card-mid"
                  style={{ backgroundImage: `url(${onboardingPoster})` }}
                />
                <div
                  className="stack-card card-front"
                  style={{ backgroundImage: `url(${onboardingPoster})` }}
                />
              </div>
            </div>

            <div className="onboarding-bottom-sheet">
              {/* Center black app badge with dual triangles */}
              <div className="app-logo-badge">
                <div className="app-logo-symbol">
                  <svg width="36" height="28" viewBox="0 0 34 26" fill="none">
                    <polygon points="4,2 16,13 4,24" fill="#ffffff" />
                    <polygon points="30,2 18,13 30,24" fill="#ffffff" />
                  </svg>
                </div>
              </div>

              <div className="snipster-pill">Snipster</div>
              <h1 className="onboarding-title">All Videos Download</h1>
              <p className="onboarding-subtitle">One-click Fast Download</p>

              <button
                className="arrow-action-btn"
                onClick={() => setCurrentScreen('home')}
                aria-label="Get Started"
              >
                <ArrowRight className="w-6 h-6 stroke-[2.5]" />
              </button>

              <div className="carousel-dots">
                <div className="dot-circle"></div>
                <div className="dot-pill"></div>
                <div className="dot-circle"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 2: VIDEO DOWNLOADER (HOME)
          ===================================================================== */}
      {currentScreen !== 'welcome' && (
        <div
          key="screen-home"
          className={`responsive-shell screen-view-animate ${currentScreen === 'home' ? '' : 'screen-pane-hidden'}`}
        >
          <div className="main-screen-container">
            {/* Simple Centered Header */}
            <div className="screen-header-centered">
              <h1 className="header-app-title">Video & Audio Downloader</h1>
              <p className="header-app-subtitle">Download videos and MP3 audio from any platform instantly</p>
            </div>

            {/* Search Input Bar */}
            <div className="link-search-row">
              <div className="link-input-capsule">
                <LinkIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Paste your link here or auto-detect"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAnalyze();
                  }}
                />
              </div>

              <button
                className="input-submit-btn"
                onClick={() => handleAnalyze()}
                disabled={analyzing}
                aria-label="Submit link"
              >
                {analyzing ? (
                  <RotateCw className="w-5 h-5 spin-anim" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </button>
            </div>

            <p className="disclaimer-caption">
              Reminder: Respect creators' work and intellectual property rights.
            </p>

            {/* Error notice if any */}
            {errorMessage && (
              <div className="liquid-glass-error-banner">
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Social Divider */}
            <div className="social-section-divider">
              <div className="divider-line" />
              <span className="divider-label">Open Social App to Copy Link</span>
              <div className="divider-line" />
            </div>

            {/* Social Apps Row */}
            <div className="social-apps-grid">
              <button
                className="social-app-item"
                onClick={() => openSocialPlatform('tiktok')}
                title="Open TikTok app or site"
              >
                <div className="social-circle-icon bg-tiktok">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.83 4.46 6.27 6.27 0 0 0 1.86-4.49V8.76a8.28 8.28 0 0 0 4.9 1.58V6.89a4.88 4.88 0 0 1-1-.2z"/>
                  </svg>
                </div>
                <span className="social-app-name">Tiktok</span>
              </button>

              <button
                className="social-app-item"
                onClick={() => openSocialPlatform('instagram')}
                title="Open Instagram app or site"
              >
                <div className="social-circle-icon bg-instagram">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
                  </svg>
                </div>
                <span className="social-app-name">Instagram</span>
              </button>

              <button
                className="social-app-item"
                onClick={() => openSocialPlatform('facebook')}
                title="Open Facebook app or site"
              >
                <div className="social-circle-icon bg-facebook">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <span className="social-app-name">Facebook</span>
              </button>

              <button
                className="social-app-item"
                onClick={() => openSocialPlatform('x')}
                title="Open X app or site"
              >
                <div className="social-circle-icon bg-x">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <span className="social-app-name">X</span>
              </button>

              <button
                className="social-app-item"
                onClick={() => openSocialPlatform('pinterest')}
                title="Open Pinterest app or site"
              >
                <div className="social-circle-icon bg-pinterest">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.546.535 6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/>
                  </svg>
                </div>
                <span className="social-app-name">Pinterest</span>
              </button>
            </div>

            {/* Analyzed Media Card (Redesigned Liquid Glass Download Options) */}
            {analyzedMedia && (
              <div className="analyzed-media-card">
                {/* Header with Creator Info & Actions */}
                <div className="media-author-bar">
                  <div className="author-info-block">
                    <img
                      src={analyzedMedia.thumbnail || fashionThumb}
                      alt="Thumbnail"
                      className="author-avatar"
                    />
                    <div className="author-names">
                      <span className="author-display-name" title={analyzedMedia.title}>
                        {analyzedMedia.title}
                      </span>
                      <div className="author-sub-meta">
                        <span className="author-handle">
                          {analyzedMedia.uploader || 'Creator'}
                        </span>
                        {analyzedMedia.platform && (
                          <span className="platform-tag-pill">
                            {analyzedMedia.platform}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="author-action-icons">
                    <button
                      className="card-icon-btn"
                      onClick={() => {
                        if (navigator.share) {
                          navigator.share({ url: inputUrl || window.location.href });
                        }
                      }}
                      title="Share link"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      className="card-icon-btn close-btn"
                      onClick={() => setAnalyzedMedia(null)}
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Cinematic 16:9 Thumbnail with Overlay Badges */}
                <div className="media-thumbnail-wrapper">
                  <img
                    src={analyzedMedia.thumbnail || fashionThumb}
                    alt="Media thumbnail"
                    className="media-thumbnail-img"
                  />

                  <div className="thumb-top-badges">
                    <span className="thumb-frosted-badge">
                      <Sparkles className="w-3 h-3 text-purple-300" />
                      {analyzedMedia.platform ? analyzedMedia.platform.toUpperCase() : 'MEDIA'}
                    </span>
                  </div>

                  {analyzedMedia.durationSeconds && (
                    <div className="thumb-bottom-badges">
                      <span className="thumb-frosted-badge duration">
                        <Clock className="w-3 h-3 text-white" />
                        {formatDuration(analyzedMedia.durationSeconds)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Download Options Panel */}
                <div className="download-options-tray">
                  {/* Segmented Type Switcher (Video vs Audio) */}
                  <div className="options-segmented-switcher">
                    <button
                      type="button"
                      className={`options-type-btn ${selectedKind === 'video' ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedKind('video');
                        setSelectedQuality(analyzedMedia.qualities.video?.[0] || 'highest');
                        setSelectedFormat(analyzedMedia.formats.video?.[0] || 'mp4');
                      }}
                    >
                      <Video className="w-4 h-4" />
                      <span>Video</span>
                      <span className="type-format-tag">MP4</span>
                    </button>
                    <button
                      type="button"
                      className={`options-type-btn ${selectedKind === 'audio' ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedKind('audio');
                        setSelectedQuality(analyzedMedia.qualities.audio?.[0] || 'best');
                        setSelectedFormat(analyzedMedia.formats.audio?.[0] || 'mp3');
                      }}
                    >
                      <Music className="w-4 h-4" />
                      <span>Audio</span>
                      <span className="type-format-tag">MP3</span>
                    </button>
                  </div>

                  {/* Quick-Select Resolution & Quality Chips */}
                  {(analyzedMedia.qualities[selectedKind] || []).length > 0 && (
                    <div className="options-chips-section">
                      <div className="options-section-label">
                        <Layers className="w-3.5 h-3.5 text-purple-600" />
                        <span>Resolution & Quality</span>
                      </div>
                      <div className="options-chips-scroll">
                        {(analyzedMedia.qualities[selectedKind] || []).map((q) => {
                          const isSelected = selectedQuality === q;
                          return (
                            <button
                              key={q}
                              type="button"
                              className={`quality-chip-btn ${isSelected ? 'active' : ''}`}
                              onClick={() => setSelectedQuality(q)}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              <span>{getQualityLabel(q)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Output Format Chips (if multiple available) */}
                  {(analyzedMedia.formats[selectedKind] || []).length > 1 && (
                    <div className="options-chips-section">
                      <div className="options-section-label">
                        <span>Format</span>
                      </div>
                      <div className="options-chips-scroll">
                        {(analyzedMedia.formats[selectedKind] || []).map((fmt) => {
                          const isSelected = selectedFormat === fmt;
                          return (
                            <button
                              key={fmt}
                              type="button"
                              className={`quality-chip-btn format-chip ${isSelected ? 'active' : ''}`}
                              onClick={() => setSelectedFormat(fmt)}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              <span>{fmt.toUpperCase()}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Integrated Download CTA Button */}
                <button
                  className="card-integrated-download-btn"
                  onClick={handleStartDownload}
                >
                  <Download className="w-5 h-5 stroke-[2.2]" />
                  <span>
                    Download {selectedKind === 'video' ? 'Video' : 'Audio'} • {getQualityLabel(selectedQuality)}
                  </span>
                </button>
              </div>
            )}

            {/* Simple Feature Highlights (Shown when no media is analyzed) */}
            {!analyzedMedia && (
              <div className="home-feature-hints-grid">
                <div className="feature-hint-card">
                  <div className="feature-hint-icon">⚡</div>
                  <div className="feature-hint-title">High Speed</div>
                  <div className="feature-hint-desc">Fast multi-thread download</div>
                </div>
                <div className="feature-hint-card">
                  <div className="feature-hint-icon">🎬</div>
                  <div className="feature-hint-title">HD & 4K</div>
                  <div className="feature-hint-desc">Original quality video</div>
                </div>
                <div className="feature-hint-card">
                  <div className="feature-hint-icon">🎵</div>
                  <div className="feature-hint-title">MP3 Audio</div>
                  <div className="feature-hint-desc">Instant audio extractor</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 3: DOWNLOADS LIST (MATCHES CROPPED HEADER & LAYOUT EXACTLY)
          ===================================================================== */}
      {currentScreen !== 'welcome' && (
        <div
          key="screen-downloads"
          className={`responsive-shell screen-view-animate ${currentScreen === 'downloads' ? '' : 'screen-pane-hidden'}`}
        >
          <div className="downloads-screen-container">
            {/* Top Curved Violet Glow Banner with Header Controls */}
            <div className="downloads-top-banner">
              {/* Navigation Row: Back Button, Title, Bell Button */}
              <div className="downloads-nav-row">
                <button
                  className="circle-nav-btn"
                  onClick={() => setCurrentScreen('home')}
                  aria-label="Back to home"
                >
                  <ChevronLeft className="w-5 h-5 stroke-[2.4]" />
                </button>

                <h1 className="downloads-title-text">Downloads</h1>

                <button className="circle-nav-btn" aria-label="Notifications">
                  <Bell className="w-5 h-5 fill-black" />
                </button>
              </div>

              {/* Segmented Filter Pills (All / Complete / Failed) */}
              <div className="segmented-tab-capsule">
                {filterIndicatorStyle && (
                  <div
                    className="segmented-sliding-pill"
                    style={{
                      left: `${filterIndicatorStyle.left}px`,
                      width: `${filterIndicatorStyle.width}px`,
                    }}
                  />
                )}
                <button
                  ref={filterAllRef}
                  className={`segment-btn ${downloadFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setDownloadFilter('all')}
                >
                  All
                </button>
                <button
                  ref={filterCompleteRef}
                  className={`segment-btn ${downloadFilter === 'complete' ? 'active' : ''}`}
                  onClick={() => setDownloadFilter('complete')}
                >
                  Complete
                </button>
                <button
                  ref={filterFailedRef}
                  className={`segment-btn ${downloadFilter === 'failed' ? 'active' : ''}`}
                  onClick={() => setDownloadFilter('failed')}
                >
                  Failed
                </button>
              </div>
            </div>

            {/* Download Items Grouped by Date */}
            <div
              key={downloadFilter}
              className="downloads-filter-animate"
              style={{ flex: 1, marginTop: '0.25rem' }}
            >
              {filteredJobs.length === 0 ? (
                <div className="empty-downloads-container">
                  <div className="empty-downloads-icon-wrap">
                    <ArrowDownToLine className="w-6 h-6 text-purple-600 stroke-[2]" />
                  </div>
                  <h3 className="empty-downloads-title">No Downloads</h3>
                  <p className="empty-downloads-subtitle">
                    {downloadFilter === 'all'
                      ? 'Your downloaded videos will appear here and save automatically.'
                      : `No ${downloadFilter} downloads in your history.`}
                  </p>
                  <button
                    onClick={() => setCurrentScreen('home')}
                    className="empty-state-cta-btn"
                  >
                    Start a Download
                  </button>
                </div>
              ) : (
                dateGroups.map((date) => (
                  <div key={date}>
                    <div className="date-group-heading">{date}</div>

                    {filteredJobs
                      .filter((j) => j.dateGroup === date)
                      .map((job) => {
                        const isCompleted = job.status === 'COMPLETED';
                        const isFailed = job.status === 'FAILED';
                        const isDownloading = job.status === 'DOWNLOADING';
                        const isPaused = job.status === 'PAUSED';

                        return (
                          <div key={job.id} className="download-item-card">
                            <div className="download-thumb-box">
                              <img
                                src={job.thumbnail || tetemaThumb}
                                alt="thumb"
                                className="download-thumb-img"
                              />
                            </div>

                            <div className="download-info-mid">
                              <span className="download-item-title" title={job.title}>
                                {job.title}
                              </span>
                              {job.desc && (
                                <span className="download-item-desc" title={job.desc}>
                                  {job.desc}
                                </span>
                              )}

                              <div className="card-bottom-row">
                                <div className="card-metrics-col">
                                  {(isDownloading || isPaused) && (
                                    <>
                                      <div className="card-stats-row">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                          {job.kind === 'audio' && (
                                            <span className="audio-tag-badge">MP3</span>
                                          )}
                                          <span className="stat-label">{job.sizeLabel}</span>
                                        </div>
                                        <span className="stat-pct">{isPaused ? 'Paused' : `${job.progress}%`}</span>
                                      </div>
                                      <div className="progress-track-bar">
                                        <div
                                          className="progress-bar-fill"
                                          style={{
                                            width: `${job.progress}%`,
                                            opacity: isPaused ? 0.55 : 1
                                          }}
                                        />
                                      </div>
                                    </>
                                  )}

                                  {isCompleted && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {job.kind === 'audio' && (
                                        <span className="audio-tag-badge">MP3</span>
                                      )}
                                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>
                                        {job.sizeLabel}
                                      </span>
                                      {job.filename && (
                                        <button
                                          onClick={() => triggerDirectDownload(job.filename!)}
                                          className="liquid-save-badge-btn"
                                        >
                                          Save
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {isFailed && (
                                    <>
                                      <div className="card-stats-row">
                                        <span className="stat-label failed-text">{job.sizeLabel}</span>
                                        <span className="stat-pct failed-text">Failed</span>
                                      </div>
                                      <div className="progress-track-bar">
                                        <div className="progress-bar-fill failed" style={{ width: '100%' }} />
                                      </div>
                                    </>
                                  )}
                                </div>

                                <div className="card-actions-group">
                                  {isDownloading && (
                                    <button
                                      className="circle-outline-pause-btn"
                                      title="Pause"
                                      onClick={() =>
                                        setJobs((prev) =>
                                          prev.map((j) => (j.id === job.id ? { ...j, status: 'PAUSED' } : j))
                                        )
                                      }
                                    >
                                      <svg width="21" height="21" viewBox="0 0 22 22" fill="none" className="modern-card-icon">
                                        <circle cx="11" cy="11" r="9.25" stroke="currentColor" strokeWidth="1.35" />
                                        <rect x="8.5" y="7.25" width="1.6" height="7.5" rx="0.8" fill="currentColor" />
                                        <rect x="11.9" y="7.25" width="1.6" height="7.5" rx="0.8" fill="currentColor" />
                                      </svg>
                                    </button>
                                  )}

                                  {isPaused && (
                                    <button
                                      className="circle-outline-pause-btn"
                                      title="Resume"
                                      onClick={() =>
                                        setJobs((prev) =>
                                          prev.map((j) => (j.id === job.id ? { ...j, status: 'DOWNLOADING' } : j))
                                        )
                                      }
                                    >
                                      <svg width="21" height="21" viewBox="0 0 22 22" fill="none" className="modern-card-icon">
                                        <circle cx="11" cy="11" r="9.25" stroke="currentColor" strokeWidth="1.35" />
                                        <path
                                          d="M9.25 7.6C9.25 7.15 9.75 6.85 10.15 7.1L15.2 10.5C15.55 10.75 15.55 11.25 15.2 11.5L10.15 14.9C9.75 15.15 9.25 14.85 9.25 14.4V7.6Z"
                                          fill="currentColor"
                                        />
                                      </svg>
                                    </button>
                                  )}

                                  {isFailed && (
                                    <button
                                      className="circle-outline-pause-btn"
                                      title="Reload"
                                      onClick={() => {
                                        setJobs((prev) =>
                                          prev.map((j) =>
                                            j.id === job.id
                                              ? { ...j, status: 'DOWNLOADING', progress: 15 }
                                              : j
                                          )
                                        );
                                      }}
                                    >
                                      <svg width="21" height="21" viewBox="0 0 22 22" fill="none" className="modern-card-icon">
                                        <path
                                          d="M19.7 11C19.7 15.8 15.8 19.7 11 19.7C6.2 19.7 2.3 15.8 2.3 11C2.3 6.2 6.2 2.3 11 2.3C14.3 2.3 17.2 4.15 18.7 7"
                                          stroke="currentColor"
                                          strokeWidth="1.35"
                                          strokeLinecap="round"
                                        />
                                        <path
                                          d="M19.2 2.7V7.2H14.7"
                                          stroke="currentColor"
                                          strokeWidth="1.35"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </button>
                                  )}

                                  <div className="card-menu-container">
                                    <button
                                      className="card-kebab-btn"
                                      title="Options"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setOpenMenu((cur) =>
                                          cur?.jobId === job.id
                                            ? null
                                            : { jobId: job.id, rect, flipUp: false, height: 0 },
                                        );
                                      }}
                                    >
                                      <MoreVertical className="w-3.5 h-3.5 text-gray-700" />
                                    </button>

                                    {openMenuJobId === job.id &&
                                      openMenu &&
                                      createPortal(
                                        <div
                                          ref={popoverRef}
                                          className="card-options-popover"
                                          style={{
                                            position: 'fixed',
                                            top: openMenu.flipUp
                                              ? openMenu.rect.top - 6 - openMenu.height
                                              : openMenu.rect.bottom + 6,
                                            right: window.innerWidth - openMenu.rect.right,
                                            margin: 0,
                                          }}
                                        >
                                          {isCompleted && job.filename && (
                                            <button
                                              className="card-options-item"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                triggerDirectDownload(job.filename!);
                                                setOpenMenu(null);
                                              }}
                                            >
                                              <ArrowDownToLine className="w-3.5 h-3.5 text-purple-600" />
                                              Save File
                                            </button>
                                          )}
                                          <button
                                            className="card-options-item delete-item"
                                            onClick={(e) => handleDeleteJob(job.id, e)}
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Delete from history
                                          </button>
                                        </div>,
                                        document.body,
                                      )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Liquid Glass Floating Navigation */}
      <nav className="liquid-glass-nav" aria-label="Main Navigation">
        <div className="liquid-nav-track">
          {indicatorStyle && (
            <div
              className="liquid-sliding-indicator"
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
              }}
            />
          )}

          <button
            ref={homeTabRef}
            className={`liquid-nav-item ${currentScreen === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentScreen('home')}
            aria-label="Home"
          >
            <span className="liquid-icon-wrap">
              <svg
                className="liquid-nav-svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill={currentScreen === 'home' ? 'currentColor' : 'none'}
                fillOpacity={currentScreen === 'home' ? 0.22 : 0}
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 10.5 12 3l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                <path d="M9 22v-7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7" />
              </svg>
            </span>
            <span className="liquid-nav-text">Home</span>
          </button>

          <button
            ref={downloadsTabRef}
            className={`liquid-nav-item ${currentScreen === 'downloads' ? 'active' : ''}`}
            onClick={() => setCurrentScreen('downloads')}
            aria-label="Downloads"
          >
            <span className="liquid-icon-wrap">
              <svg
                className={`liquid-nav-svg ${jobs.some((j) => j.status === 'DOWNLOADING') ? 'anim-bounce' : ''}`}
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill={currentScreen === 'downloads' ? 'currentColor' : 'none'}
                fillOpacity={currentScreen === 'downloads' ? 0.22 : 0}
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              {jobs.some((j) => j.status === 'DOWNLOADING') && (
                <span className="liquid-pulse-dot" />
              )}
            </span>
            <span className="liquid-nav-text">Downloads</span>
            <span
              className={`liquid-count-badge ${currentScreen === 'downloads' ? 'badge-active' : ''}`}
            >
              {jobs.length}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
