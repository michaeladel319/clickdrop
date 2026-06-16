package com.anywheredl.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;

import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.mapper.VideoInfo;
import com.yausername.youtubedl_android.mapper.VideoFormat;

import android.os.Environment;
import android.util.Log;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "AnywhereDLPlugin")
public class AnywhereDLPlugin extends Plugin {
    private static final String TAG = "AnywhereDLPlugin";
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void extractMetadata(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL is required");
            return;
        }

        if (url.contains("spotify.com") || url.contains("open.spotify.com")) {
            executor.execute(() -> {
                try {
                    URL urlObj = new URL(url);
                    HttpURLConnection conn = null;
                    int status = 0;
                    int redirectCount = 0;
                    boolean redirect = true;

                    while (redirect && redirectCount < 10) {
                        conn = (HttpURLConnection) urlObj.openConnection();
                        conn.setRequestMethod("GET");
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                        conn.setConnectTimeout(10000);
                        conn.setReadTimeout(10000);
                        conn.setInstanceFollowRedirects(true);

                        status = conn.getResponseCode();
                        if (status == HttpURLConnection.HTTP_MOVED_TEMP
                                || status == HttpURLConnection.HTTP_MOVED_PERM
                                || status == 307
                                || status == 308) {
                            String newUrl = conn.getHeaderField("Location");
                            if (newUrl == null || newUrl.isEmpty()) {
                                break;
                            }
                            urlObj = new URL(urlObj, newUrl);
                            redirectCount++;
                        } else {
                            redirect = false;
                        }
                    }

                    if (status != HttpURLConnection.HTTP_OK) {
                        call.reject("Failed to fetch Spotify metadata, HTTP code: " + status);
                        return;
                    }

                    BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    String inputLine;
                    StringBuilder htmlContent = new StringBuilder();
                    while ((inputLine = in.readLine()) != null) {
                        htmlContent.append(inputLine);
                    }
                    in.close();
                    conn.disconnect();

                    String html = htmlContent.toString();

                    String title = null;
                    String artist = null;
                    String image = null;

                    // 1. Try parsing __NEXT_DATA__ JSON script tag
                    Pattern nextDataPattern = Pattern.compile("<script[^>]+id=\"__NEXT_DATA__\"[^>]*>([^<]+)</script>");
                    Matcher nextDataMatcher = nextDataPattern.matcher(html);
                    if (nextDataMatcher.find()) {
                        String jsonText = nextDataMatcher.group(1);
                        Pattern jsonTitlePattern = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"");
                        Pattern jsonArtistPattern = Pattern.compile("\"artists\"\\s*:\\s*\\[\\s*\\{\\s*\"name\"\\s*:\\s*\"([^\"]+)\"");
                        
                        Matcher jsonTitleMatcher = jsonTitlePattern.matcher(jsonText);
                        Matcher jsonArtistMatcher = jsonArtistPattern.matcher(jsonText);
                        
                        if (jsonTitleMatcher.find()) {
                            title = decodeHtmlEntities(jsonTitleMatcher.group(1));
                        }
                        if (jsonArtistMatcher.find()) {
                            artist = decodeHtmlEntities(jsonArtistMatcher.group(1));
                        }
                    }

                    // 2. Try parsing <title> tag format: "Track Name - song and lyrics by Artist | Spotify"
                    if (title == null || artist == null) {
                        Pattern titleTagPattern = Pattern.compile("<title>([^<]+)</title>", Pattern.CASE_INSENSITIVE);
                        Matcher titleTagMatcher = titleTagPattern.matcher(html);
                        if (titleTagMatcher.find()) {
                            String titleTagText = titleTagMatcher.group(1);
                            Pattern formatPattern = Pattern.compile("(.+?)\\s+-\\s+(?:song|song and lyrics|song & lyrics)\\s+by\\s+(.+?)\\s*\\|\\s*Spotify", Pattern.CASE_INSENSITIVE);
                            Matcher formatMatcher = formatPattern.matcher(titleTagText);
                            if (formatMatcher.find()) {
                                if (title == null) {
                                    title = decodeHtmlEntities(formatMatcher.group(1).trim());
                                }
                                if (artist == null) {
                                    artist = decodeHtmlEntities(formatMatcher.group(2).trim());
                                }
                            }
                        }
                    }

                    // 3. Fallback to Meta tags parsing
                    Pattern metaTagPattern = Pattern.compile("<meta\\s+([^>]+)>");
                    Matcher matcher = metaTagPattern.matcher(html);
                    String ogDesc = null;

                    while (matcher.find()) {
                        String attributes = matcher.group(1);
                        String property = getAttributeValue(attributes, "property");
                        if (property == null || property.isEmpty()) {
                            property = getAttributeValue(attributes, "name");
                        }
                        String contentVal = getAttributeValue(attributes, "content");
                        
                        if (property != null && contentVal != null) {
                            if (property.equals("og:title") && title == null) {
                                title = decodeHtmlEntities(contentVal);
                            } else if (property.equals("og:image")) {
                                image = contentVal;
                            } else if (property.equals("music:musician_description") && artist == null) {
                                artist = decodeHtmlEntities(contentVal);
                            } else if (property.equals("og:description")) {
                                ogDesc = decodeHtmlEntities(contentVal);
                            }
                        }
                    }

                    if (artist == null && ogDesc != null) {
                        String[] parts = ogDesc.split(" · ");
                        if (parts.length > 0) {
                            artist = parts[0];
                        }
                    }

                    if (title == null || title.isEmpty()) {
                        call.reject("Failed to parse Spotify track title");
                        return;
                    }

                    JSObject ret = new JSObject();
                    ret.put("type", "spotify_track");
                    ret.put("title", title);
                    ret.put("artist", artist != null ? artist : "Unknown Artist");
                    ret.put("thumbnail", image != null ? image : "");
                    ret.put("duration", 0);

                    JSArray formatsArray = new JSArray();
                    JSObject mp3 = new JSObject();
                    mp3.put("id", "audio_mp3");
                    mp3.put("label", "Audio (MP3)");
                    formatsArray.put(mp3);
                    ret.put("formats", formatsArray);

                    call.resolve(ret);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to scrape Spotify metadata", e);
                    call.reject(e.getMessage());
                }
            });
            return;
        }

        executor.execute(() -> {
            try {
                // Run yt-dlp to get info
                VideoInfo info = YoutubeDL.getInstance().getInfo(url);
                
                JSObject ret = new JSObject();
                ret.put("title", info.getTitle());
                ret.put("artist", info.getUploader() != null ? info.getUploader() : "Unknown");
                ret.put("thumbnail", info.getThumbnail());
                ret.put("duration", info.getDuration());
                ret.put("type", info.getDuration() > 0 ? "video" : "audio");

                // Process formats
                JSArray formatsArray = new JSArray();
                
                // Add standard formats similar to the backend
                boolean isTiktokOrIg = url.toLowerCase().contains("tiktok.com") || url.toLowerCase().contains("instagram.com");
                if (!isTiktokOrIg) {
                    JSObject mp3 = new JSObject();
                    mp3.put("id", "audio_mp3");
                    mp3.put("label", "Audio (MP3)");
                    formatsArray.put(mp3);
                }
                
                // If there are video formats, add them
                List<VideoFormat> formats = info.getFormats();
                if (formats != null && !formats.isEmpty()) {
                    long bestAudioSize = 0;
                    for (VideoFormat f : formats) {
                        if (f.getAcodec() != null && !f.getAcodec().equals("none") && 
                           (f.getVcodec() == null || f.getVcodec().equals("none"))) {
                            long s = f.getFileSize();
                            if (s > bestAudioSize) bestAudioSize = s;
                        }
                    }

                    java.util.Map<Integer, VideoFormat> videoFormats = new java.util.HashMap<>();
                    for (VideoFormat f : formats) {
                        if (f.getVcodec() != null && !f.getVcodec().equals("none")) {
                            int height = f.getHeight();
                            if (height > 0) {
                                long s = f.getFileSize();
                                long existingS = 0;
                                if (videoFormats.containsKey(height)) {
                                    VideoFormat extF = videoFormats.get(height);
                                    existingS = extF.getFileSize();
                                }
                                if (!videoFormats.containsKey(height) || s > existingS) {
                                    videoFormats.put(height, f);
                                }
                            }
                        }
                    }
                    
                    List<Integer> sortedHeights = new java.util.ArrayList<>(videoFormats.keySet());
                    java.util.Collections.sort(sortedHeights, java.util.Collections.reverseOrder());
                    
                    if (sortedHeights.isEmpty()) {
                        JSObject fbest = new JSObject();
                        fbest.put("id", "best");
                        fbest.put("label", "Best Available quality");
                        formatsArray.put(fbest);
                    } else {
                        for (Integer h : sortedHeights) {
                            VideoFormat vf = videoFormats.get(h);
                            long s = vf.getFileSize();
                            long totalSize = s + bestAudioSize;
                            String label = h + "p";
                            if (totalSize > 0) {
                                double mb = totalSize / (1024.0 * 1024.0);
                                label += String.format(" (%.1f MB)", mb);
                            }
                            JSObject opt = new JSObject();
                            opt.put("id", vf.getFormatId());
                            opt.put("label", label);
                            formatsArray.put(opt);
                        }
                    }
                }

                ret.put("formats", formatsArray);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed to extract metadata", e);
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void startDownload(PluginCall call) {
        String url = call.getString("url");
        String formatId = call.getString("formatId");
        Boolean audioOnly = call.getBoolean("audioOnly", false);
        String taskId = call.getString("taskId");

        if (url == null || url.trim().isEmpty() || taskId == null) {
            call.reject("URL and taskId are required");
            return;
        }

        executor.execute(() -> {
            try {
                File downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloadDir.exists()) {
                    downloadDir.mkdirs();
                }

                YoutubeDLRequest request = new YoutubeDLRequest(url);
                // Set output template to Downloads folder
                request.addOption("-o", downloadDir.getAbsolutePath() + "/%(title)s.%(ext)s");

                // Configure formats exactly like main.py
                if (audioOnly || "audio_mp3".equals(formatId)) {
                    request.addOption("-f", "bestaudio/best");
                    request.addOption("--extract-audio");
                    request.addOption("--audio-format", "mp3");
                    request.addOption("--audio-quality", "192K");
                } else {
                    String fmt = "best";
                    if (formatId != null && !formatId.equals("best")) {
                        fmt = formatId + "+bestaudio/best";
                    }
                    request.addOption("-f", fmt);
                    request.addOption("--merge-output-format", "mp4");
                }

                // Add standard mobile user agents and android extractor args
                request.addOption("--extractor-args", "youtube:player_client=ios,tv,web");

                // Execute the download
                YoutubeDL.getInstance().execute(request, taskId, (progress, etaInSeconds, line) -> {
                    JSObject data = new JSObject();
                    data.put("taskId", taskId);
                    data.put("progress", progress);
                    data.put("eta", etaInSeconds);
                    notifyListeners("downloadProgress", data);
                    return kotlin.Unit.INSTANCE;
                });

                JSObject res = new JSObject();
                res.put("status", "success");
                call.resolve(res);

            } catch (Exception e) {
                Log.e(TAG, "Download failed", e);
                JSObject errorData = new JSObject();
                errorData.put("taskId", taskId);
                errorData.put("error", e.getMessage());
                notifyListeners("downloadFailed", errorData);
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void updateEngine(PluginCall call) {
        executor.execute(() -> {
            try {
                Log.d(TAG, "Updating yt-dlp binary...");
                YoutubeDL.UpdateStatus status = YoutubeDL.getInstance().updateYoutubeDL(getContext(), YoutubeDL.UpdateChannel.STABLE.INSTANCE);
                JSObject ret = new JSObject();
                ret.put("status", status.name());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed to update yt-dlp binary", e);
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getSharedUrl(PluginCall call) {
        JSObject ret = new JSObject();
        if (MainActivity.pendingSharedUrl != null) {
            ret.put("url", MainActivity.pendingSharedUrl);
            MainActivity.pendingSharedUrl = null; // consume
        } else {
            ret.put("url", "");
        }
        call.resolve(ret);
    }

    private String getAttributeValue(String attributes, String attrName) {
        Pattern pattern = Pattern.compile(attrName + "\\s*=\\s*\"([^\"]*)\"|" + attrName + "\\s*=\\s*'([^']*)'");
        Matcher matcher = pattern.matcher(attributes);
        if (matcher.find()) {
            return matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
        }
        return null;
    }

    private String decodeHtmlEntities(String input) {
        if (input == null) return null;
        return input.replace("&amp;", "&")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&quot;", "\"")
                    .replace("&#x27;", "'")
                    .replace("&#39;", "'")
                    .replace("&apos;", "'")
                    .replace("&#x2F;", "/")
                    .replace("&#x60;", "`")
                    .replace("&#x3D;", "=");
    }
}
