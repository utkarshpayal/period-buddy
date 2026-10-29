import assert from "node:assert/strict";
import test from "node:test";
import {
  VERIFIED_GYNAECOLOGIST_LABEL,
  doctorInitials,
  mapCommunityComment,
  mapCommunityPost,
} from "../../components/community/mapCommunityPost";
import type { CommunityComment, CommunityPost } from "../api";

test("doctorInitials handles various doctor names", () => {
  assert.equal(doctorInitials("Dr. Priya Sharma"), "PS");
  assert.equal(doctorInitials("dr. priya sharma"), "PS");
  assert.equal(doctorInitials("Dr Priya"), "PR");
  assert.equal(doctorInitials("Priya Sharma"), "PS");
  assert.equal(doctorInitials(""), "DR");
  assert.equal(doctorInitials(null), "DR");
  assert.equal(doctorInitials(undefined), "DR");
});

test("mapCommunityComment maps doctor answer with name shown", () => {
  const comment: CommunityComment = {
    _id: "c1",
    content: "Please stay hydrated and take rest.",
    createdAt: new Date().toISOString(),
    isAnonymous: false,
    expert: {
      verified: true,
      showName: true,
      name: "Dr. Priya Sharma",
      specialty: "Gynecologist & Obstetrician",
      avatarUrl: "https://example.com/priya.png",
    },
  };

  const mapped = mapCommunityComment(comment, false);
  assert.equal(mapped.author, "Dr. Priya Sharma");
  assert.equal(mapped.avatar, "PS");
  assert.equal(mapped.avatarUrl, "https://example.com/priya.png");
  assert.equal(mapped.isOwner, false);
  assert.equal(mapped.expert?.verified, true);
  assert.equal(mapped.expert?.showName, true);
  assert.equal(mapped.expert?.specialty, "Gynecologist & Obstetrician");
});

test("mapCommunityComment maps doctor answer with name hidden as Verified gynaecologist", () => {
  const comment: CommunityComment = {
    _id: "c2",
    content: "Consultation is recommended if pain persists.",
    createdAt: new Date().toISOString(),
    isAnonymous: false,
    expert: {
      verified: true,
      showName: false,
      name: null,
      specialty: "Gynecologist",
      avatarUrl: null,
    },
  };

  const mapped = mapCommunityComment(comment, false);
  assert.equal(mapped.author, VERIFIED_GYNAECOLOGIST_LABEL);
  assert.equal(mapped.avatar, "DR");
  assert.equal(mapped.avatarUrl, null);
  assert.equal(mapped.isOwner, false);
  assert.equal(mapped.expert?.verified, true);
  assert.equal(mapped.expert?.showName, false);
});

test("mapCommunityComment maps regular anonymous member comment", () => {
  const comment: CommunityComment = {
    _id: "c3",
    content: "I felt the same symptom last month.",
    createdAt: new Date().toISOString(),
    isAnonymous: true,
  };

  const mapped = mapCommunityComment(comment, false);
  assert.equal(mapped.author, "Anonymous member");
  assert.equal(mapped.avatar, "AU");
  assert.equal(mapped.expert, null);
});

test("mapCommunityComment maps regular non-anonymous member comment", () => {
  const comment: CommunityComment = {
    _id: "c4",
    content: "Hope you feel better soon!",
    createdAt: new Date().toISOString(),
    isAnonymous: false,
  };

  const mapped = mapCommunityComment(comment, false);
  assert.equal(mapped.author, "Community member");
  assert.equal(mapped.avatar, "AU");
  assert.equal(mapped.expert, null);
});

test("mapCommunityComment maps own doctor answer", () => {
  const comment: CommunityComment = {
    _id: "c5",
    content: "My answer as a doctor.",
    createdAt: new Date().toISOString(),
    expert: {
      verified: true,
      showName: true,
      name: "Dr. Ananya Roy",
      specialty: null,
      avatarUrl: null,
    },
  };

  const mapped = mapCommunityComment(comment, true);
  assert.equal(mapped.author, "Dr. Ananya Roy (You)");
  assert.equal(mapped.isOwner, true);
});

test("mapCommunityPost maps expertAnswerCount and comments", () => {
  const post: CommunityPost = {
    _id: "p1",
    id: "p1",
    content: "Is irregular cycle normal after stopping birth control?",
    likes: 5,
    commentsCount: 2,
    expertAnswerCount: 1,
    createdAt: new Date().toISOString(),
    comments: [
      {
        _id: "c1",
        content: "Yes, it takes 2-3 months to stabilize.",
        isAnonymous: false,
        expert: {
          verified: true,
          showName: false,
          name: null,
          specialty: null,
          avatarUrl: null,
        },
      },
      {
        _id: "c2",
        content: "Happened to me too!",
        isAnonymous: true,
      },
    ],
  };

  const mapped = mapCommunityPost(post);
  assert.equal(mapped.expertAnswerCount, 1);
  assert.equal(mapped.comments.length, 2);
  assert.equal(mapped.comments[0].author, VERIFIED_GYNAECOLOGIST_LABEL);
  assert.equal(mapped.comments[0].expert?.verified, true);
  assert.equal(mapped.comments[1].author, "Anonymous member");
  assert.equal(mapped.comments[1].expert, null);
});
