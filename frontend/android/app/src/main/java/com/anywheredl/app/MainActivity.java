package com.anywheredl.app;

import android.os.Bundle;
import android.webkit.DownloadListener;
import android.webkit.WebView;
import android.app.DownloadManager;
import android.net.Uri;
import android.os.Environment;
import android.webkit.URLUtil;
import android.content.Context;
import android.widget.Toast;
import android.util.Log;
import android.content.Intent;

import com.getcapacitor.BridgeActivity;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.ffmpeg.FFmpeg;

public class MainActivity extends BridgeActivity {
    public static String pendingSharedUrl = null;

    private void handleIntent(Intent intent) {
        if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null) {
                pendingSharedUrl = sharedText;
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        handleIntent(getIntent());

        // Register custom AnywhereDLPlugin BEFORE super.onCreate
        registerPlugin(AnywhereDLPlugin.class);

        super.onCreate(savedInstanceState);

        // Initialize youtubedl-android and ffmpeg native engines
        try {
            YoutubeDL.getInstance().init(this);
            FFmpeg.getInstance().init(this);
            Log.d("MainActivity", "youtubedl-android and FFmpeg initialized successfully!");
            
            // Auto-update yt-dlp in the background on startup
            new Thread(() -> {
                try {
                    Log.d("MainActivity", "Auto-updating yt-dlp binary on startup...");
                    YoutubeDL.getInstance().updateYoutubeDL(getApplicationContext(), YoutubeDL.UpdateChannel.STABLE.INSTANCE);
                    Log.d("MainActivity", "yt-dlp binary auto-updated successfully!");
                } catch (Exception e) {
                    Log.e("MainActivity", "Failed to auto-update yt-dlp binary on startup", e);
                }
            }).start();
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to initialize native downloader libraries", e);
            Toast.makeText(getApplicationContext(), "Failed to init native downloader: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }

        // Access the WebView managed by Capacitor
        WebView webView = this.bridge.getWebView();

        // Set the DownloadListener to intercept file stream URLs and download via DownloadManager
        if (webView != null) {
            webView.setDownloadListener(new DownloadListener() {
                @Override
                public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                    try {
                        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                        
                        // Pass user-agent header to ensure compatibility
                        request.addRequestHeader("User-Agent", userAgent);

                        // Guess filename from URL or header information
                        String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                        
                        request.setTitle(fileName);
                        request.setDescription("Downloading media file...");
                        
                        // Set destination to public Downloads folder
                        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                        
                        // Notify when download starts/completes
                        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        
                        // Scan file to make it immediately visible in device media library (music/gallery)
                        request.allowScanningByMediaScanner();

                        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        if (dm != null) {
                            dm.enqueue(request);
                            Toast.makeText(getApplicationContext(), "Downloading: " + fileName, Toast.LENGTH_LONG).show();
                        } else {
                            Toast.makeText(getApplicationContext(), "Failed to get DownloadManager service", Toast.LENGTH_LONG).show();
                        }
                    } catch (Exception e) {
                        Toast.makeText(getApplicationContext(), "Download error: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        e.printStackTrace();
                    }
                }
            });
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }
}

