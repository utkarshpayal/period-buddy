import test from "node:test";
import assert from "node:assert/strict";
import type { Reel, ReelComment } from "../api";
import {
  appendComments,
  appendUnique,
  applyLiked,
  applySaved,
  captionNeedsMore,
  formatCommentAge,
  formatCount,
  getYouTubeId,
  hasPoll,
  mapApiReel,
  shouldPrefetch,
  updateReel,
  withPinnedFirst,
} from "../reels";

const apiReel = (over: Partial<Reel> = {}): Reel => ({
  id: "r1",
  title: "Cycle phases",
  creatorId: "doc_1",
  creatorName: "Dr. Asha",
  category: "Wellness",
  directMp4Url: "https://cdn.example/r1.mp4",
  duration: "0:30",
  pollOptions: [],
  thumbnailUrl: "https://cdn.example/r1.jpg",
  verified: true,
  views: 7,
  ...over,
});

test("YouTube ids come from watch, shorts, embed and youtu.be links only", () => {
  assert.equal(getYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ?si=x"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeId("https://cdn.example/video.mp4"), null);
  assert.equal(getYouTubeId(undefined), null);
});

test("mapping prefers the description, viewCount and the server's own state", () => {
  const reel = mapApiReel(
    apiReel({
      description: "  A short caption ",
      tags: ["cycle", ""],
      viewCount: 42,
      likeCount: 3,
      commentCount: 2,
      isLiked: true,
      medicallyReviewed: true,
      reviewedBy: "Dr. Rao",
    }),
  );
  assert.equal(reel.caption, "A short caption");
  assert.deepEqual(reel.tags, ["cycle"]);
  assert.equal(reel.viewCount, 42);
  assert.equal(reel.isLiked, true);
  assert.equal(reel.isSaved, false);
  assert.equal(reel.saveCount, 0);
  assert.equal(reel.youtubeId, null);
  assert.equal(reel.review.medicallyReviewed, true);
  assert.equal(hasPoll(reel), false);

  const bare = mapApiReel(apiReel({ likeCount: -3 }));
  assert.equal(bare.caption, "Cycle phases");
  assert.equal(bare.viewCount, 7);
  assert.equal(bare.likeCount, 0);
});

test("optimistic like/save move the count by one and never below zero", () => {
  const reel = mapApiReel(apiReel({ likeCount: 0, saveCount: 1, isSaved: true }));
  const liked = applyLiked(reel, true);
  assert.equal(liked.likeCount, 1);
  assert.equal(applyLiked(liked, true), liked, "liking twice is a no-op");
  assert.equal(applyLiked(reel, false), reel);
  assert.equal(applyLiked({ isLiked: true, likeCount: 0 }, false).likeCount, 0);
  assert.equal(applySaved(reel, false).saveCount, 0);
});

test("pages are de-duplicated and a deep-linked reel is pinned once", () => {
  const a = mapApiReel(apiReel({ id: "a" }));
  const b = mapApiReel(apiReel({ id: "b" }));
  const c = mapApiReel(apiReel({ id: "c" }));
  assert.deepEqual(withPinnedFirst([a, b, c], b).map((r) => r.id), ["b", "a", "c"]);
  assert.deepEqual(withPinnedFirst([a, a], null).map((r) => r.id), ["a"]);
  const list = [a, b];
  assert.equal(appendUnique(list, [b]), list);
  assert.deepEqual(appendUnique(list, [b, c]).map((r) => r.id), ["a", "b", "c"]);
});

test("updateReel keeps the same array when nothing changed", () => {
  const list = [mapApiReel(apiReel({ id: "a" }))];
  assert.equal(updateReel(list, "zzz", (r) => applyLiked(r, true)), list);
  assert.equal(updateReel(list, "a", (r) => r), list);
  assert.equal(updateReel(list, "a", (r) => applyLiked(r, true))[0].isLiked, true);
});

test("prefetch starts three reels before the end", () => {
  assert.equal(shouldPrefetch(6, 10), false);
  assert.equal(shouldPrefetch(7, 10), true);
  assert.equal(shouldPrefetch(0, 0), false);
});

test("counts are compact", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1000), "1K");
  assert.equal(formatCount(1250), "1.2K");
  assert.equal(formatCount(15300), "15K");
  assert.equal(formatCount(2_400_000), "2.4M");
  assert.equal(formatCount(Number.NaN), "0");
});

test("comment ages", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  assert.equal(formatCommentAge("2026-10-16T11:59:30Z", now), "now");
  assert.equal(formatCommentAge("2026-10-16T11:55:00Z", now), "5m");
  assert.equal(formatCommentAge("2026-10-16T09:00:00Z", now), "3h");
  assert.equal(formatCommentAge("2026-10-14T12:00:00Z", now), "2d");
  assert.equal(formatCommentAge("2026-09-25T12:00:00Z", now), "3w");
  assert.equal(formatCommentAge(undefined, now), "");
});

test("long or multi-line captions get a more toggle", () => {
  assert.equal(captionNeedsMore("short"), false);
  assert.equal(captionNeedsMore("x".repeat(91)), true);
  assert.equal(captionNeedsMore("a\nb\nc"), true);
});

test("comment pages are appended without repeats", () => {
  const row = (id: string): ReelComment => ({
    id,
    reelId: "r",
    text: id,
    createdAt: "",
    author: { name: "A", avatar: null },
    isOwn: false,
    canDelete: false,
  });
  const list = [row("1"), row("2")];
  assert.equal(appendComments(list, [row("2")]), list);
  assert.deepEqual(appendComments(list, [row("2"), row("3")]).map((c) => c.id), ["1", "2", "3"]);
});
