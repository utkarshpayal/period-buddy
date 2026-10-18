# TODO

## Reels: faster start + auto-scroll (later)

**Problems seen**
- Videos take a while to start, both on first open and after swiping.
- When a reel finishes it loops; it should move on to the next one instead.

**Likely causes to check first**
- The MP4s are served straight from S3 (`thenura.s3.us-east-1.amazonaws.com`), so there's no CDN and no edge caching. Full-size uploads may be large and not web-optimized (`moov` atom at the end means the whole file must load before playback).
- Only the next reel is preloaded (`isPreload` in `components/reels/ReelPage.tsx`); a fast swipe outruns it.
- On web, browsers block autoplay with sound, so the first reel can sit waiting until the user taps.
- Thumbnails are full-size images, not small posters.

**Plan**
- [x] **Auto-advance:** when a reel ends, scroll to the next one. Turn off `player.loop` in `components/reels/ReelVideo.tsx`, listen for `playToEnd`, then call `scrollToIndex(active + 1)` in `app/(app)/reels.tsx`. Keep looping for the last reel, or while the comments or poll sheet is open. Make it a setting if people want looping. *(Done, except the setting. Also loops while the inline poll card waits for a vote. YouTube reels still loop.)*
- [ ] **Faster start:**
  - Put the S3 bucket behind CloudFront and serve reels from the CDN URL.
  - On upload, transcode to 720p H.264 with `+faststart`, or HLS (`.m3u8`, adaptive bitrate). expo-video plays HLS natively.
  - Generate a small poster thumbnail (~30 KB) per reel.
- [x] **Preload more:** keep the next reel's player buffered, and the previous one too, so swiping back is instant. Check the memory cost on low-end Android. *(Done; the low-end Android memory check is still open.)*
- [x] **Web:** start muted so autoplay is allowed, and show a "Tap for sound" hint.
- [x] **Measure:** log time-to-first-frame per reel (`onFirstFrameRender` minus activation time) to see the real numbers before and after. *(Dev builds log `[reels] first frame Nms` to the console; nothing is sent to the backend yet.)*
- [x] **Admin portal:** warn when an uploaded video is larger than ~15 MB or isn't web-optimized. *(Done in period-buddy-content: `src/lib/videoUploadCheck.ts`, shown in `MediaUploadField`.)*
