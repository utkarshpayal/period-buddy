import React, { memo, useEffect, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: Record<string, unknown>) => YouTubeIframeApiPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubeIframeApiPlayer = {
  destroy: () => void;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  unMute: () => void;
};

const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

let youtubeApiLoadPromise: Promise<void> | null = null;

/** Loads the YouTube IFrame API once per web session. */
function loadYouTubeIframeApi(): Promise<void> {
  if (youtubeApiLoadPromise) return youtubeApiLoadPromise;
  youtubeApiLoadPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  });
  return youtubeApiLoadPromise;
}

/**
 * HTML for the native WebView player: the real IFrame Player API, so
 * play/pause and mute are JS calls (no reload). `window.__nuraShouldPlay`
 * is the screen's wish, so a reel that became inactive before the player
 * was ready never starts on its own.
 */
function playerHtml(videoId: string, muted: boolean, shouldPlay: boolean) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #000; overflow: hidden; }
      #player { width: 100%; height: 100%; }
      iframe { width: 100% !important; height: 100% !important; }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script>window.__nuraShouldPlay = ${shouldPlay ? "true" : "false"};</script>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
      function onYouTubeIframeAPIReady() {
        window.__ytPlayer = new YT.Player('player', {
          videoId: '${videoId}',
          playerVars: { autoplay: ${shouldPlay ? 1 : 0}, controls: 0, loop: 1, playlist: '${videoId}', playsinline: 1, modestbranding: 1, rel: 0, mute: ${muted ? 1 : 0} },
          events: {
            onReady: function (event) { if (window.__nuraShouldPlay) event.target.playVideo(); },
            onStateChange: function (event) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stateChange', state: event.data }));
            }
          }
        });
      }
    </script>
  </body>
</html>`;
}

/**
 * A YouTube reel (an admin can paste a YouTube link instead of uploading),
 * through the WebView IFrame bridge on native and YT.Player on web. Only the
 * active reel mounts one; `shouldPlay` drives play/pause.
 */
export const YouTubeReel = memo(function YouTubeReel({
  videoId,
  shouldPlay,
  muted,
  onPlayingChange,
}: {
  videoId: string;
  shouldPlay: boolean;
  muted: boolean;
  onPlayingChange: (playing: boolean) => void;
}) {
  const webViewRef = useRef<WebView>(null);
  const webPlayerRef = useRef<YouTubeIframeApiPlayer | null>(null);
  const shouldPlayRef = useRef(shouldPlay);
  shouldPlayRef.current = shouldPlay;
  const elementId = useMemo(() => `yt-reel-${videoId}-${Math.random().toString(36).slice(2)}`, [videoId]);
  // Built once per video: changing the HTML would reload the embed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => playerHtml(videoId, muted, shouldPlay), [videoId]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    loadYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT) return;
      webPlayerRef.current = new window.YT.Player(elementId, {
        videoId,
        playerVars: { autoplay: 0, controls: 0, loop: 1, playlist: videoId, playsinline: 1, modestbranding: 1, rel: 0, mute: muted ? 1 : 0 },
        events: {
          onReady: (event: { target: YouTubeIframeApiPlayer }) => {
            if (shouldPlayRef.current) event.target.playVideo();
          },
          onStateChange: (event: { data: number }) => onPlayingChange(event.data === 1),
        },
      });
    });
    return () => {
      cancelled = true;
      webPlayerRef.current?.destroy?.();
      webPlayerRef.current = null;
    };
    // Only (re)create the player when the video changes; mute/play are effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementId, videoId]);

  useEffect(() => {
    if (Platform.OS === "web") {
      if (shouldPlay) webPlayerRef.current?.playVideo();
      else webPlayerRef.current?.pauseVideo();
      return;
    }
    webViewRef.current?.injectJavaScript(
      `window.__nuraShouldPlay = ${shouldPlay}; window.__ytPlayer && window.__ytPlayer.${shouldPlay ? "playVideo" : "pauseVideo"} && window.__ytPlayer.${shouldPlay ? "playVideo" : "pauseVideo"}(); true;`,
    );
  }, [shouldPlay]);

  useEffect(() => {
    if (Platform.OS === "web") {
      if (muted) webPlayerRef.current?.mute();
      else webPlayerRef.current?.unMute();
      return;
    }
    webViewRef.current?.injectJavaScript(
      `window.__ytPlayer && window.__ytPlayer.${muted ? "mute" : "unMute"} && window.__ytPlayer.${muted ? "mute" : "unMute"}(); true;`,
    );
  }, [muted]);

  useEffect(() => () => onPlayingChange(false), [onPlayingChange]);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "stateChange") onPlayingChange(data.state === 1);
    } catch {
      // Ignore malformed bridge messages.
    }
  }

  if (Platform.OS === "web") {
    return (
      <View style={FILL} pointerEvents="none">
        <div id={elementId} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      allowsInlineMediaPlayback
      domStorageEnabled
      javaScriptEnabled
      mediaPlaybackRequiresUserAction={false}
      originWhitelist={["*"]}
      androidLayerType="hardware"
      onMessage={handleMessage}
      source={{ html }}
      style={[FILL, { backgroundColor: "black" }]}
      pointerEvents="none"
    />
  );
});
