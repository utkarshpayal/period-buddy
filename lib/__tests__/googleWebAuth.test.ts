import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleAuthUrl,
  decodeJwtPayload,
  GOOGLE_DENIED_MESSAGE,
  parseGoogleRedirect,
  PENDING_TTL_MS,
  resolveGoogleRedirect,
  safeReturnPath,
  type PendingGoogleAuth,
} from "../googleWebAuth";

const b64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload: object) => `${b64url({ alg: "RS256" })}.${b64url(payload)}.sig`;

const NOW = 1_800_000_000_000;
const pending: PendingGoogleAuth = {
  state: "s1",
  nonce: "n1",
  role: "partner",
  returnPath: "/signup?role=partner",
  startedAt: NOW - 1000,
};

test("buildGoogleAuthUrl asks for an id_token with state and nonce", () => {
  const url = new URL(buildGoogleAuthUrl({ clientId: "cid", redirectUri: "https://app.example", state: "s", nonce: "n" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example");
  assert.equal(url.searchParams.get("response_type"), "id_token");
  assert.equal(url.searchParams.get("state"), "s");
  assert.equal(url.searchParams.get("nonce"), "n");
});

test("safeReturnPath keeps same-site paths only", () => {
  assert.equal(safeReturnPath("/signup?role=x"), "/signup?role=x");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", null, undefined]) {
    assert.equal(safeReturnPath(bad), "/login", String(bad));
  }
});

test("parseGoogleRedirect reads the hash, then the query, else null", () => {
  assert.deepEqual(parseGoogleRedirect("#id_token=t&state=s"), { idToken: "t", error: undefined, state: "s" });
  assert.deepEqual(parseGoogleRedirect("", "?error=access_denied&state=s"), {
    idToken: undefined,
    error: "access_denied",
    state: "s",
  });
  assert.equal(parseGoogleRedirect("#section", "?postId=1"), null);
});

test("decodeJwtPayload reads base64url payloads and rejects junk", () => {
  assert.deepEqual(decodeJwtPayload(jwt({ nonce: "n1", name: "Aé" })), { nonce: "n1", name: "Aé" });
  assert.equal(decodeJwtPayload("nope"), null);
  assert.equal(decodeJwtPayload("a.!!!.c"), null);
});

test("resolveGoogleRedirect: success when state and nonce match", () => {
  const token = jwt({ nonce: "n1" });
  assert.deepEqual(resolveGoogleRedirect({ idToken: token, state: "s1" }, pending, NOW), {
    kind: "success",
    idToken: token,
    role: "partner",
    returnPath: "/signup?role=partner",
  });
});

test("resolveGoogleRedirect: errors for wrong state, nonce, expiry or denial", () => {
  const ok = jwt({ nonce: "n1" });
  const cases = [
    resolveGoogleRedirect({ idToken: ok, state: "other" }, pending, NOW),
    resolveGoogleRedirect({ idToken: jwt({ nonce: "x" }), state: "s1" }, pending, NOW),
    resolveGoogleRedirect({ idToken: ok, state: "s1" }, pending, pending.startedAt + PENDING_TTL_MS + 1),
    resolveGoogleRedirect({ idToken: ok, state: "s1" }, null, NOW),
  ];
  for (const result of cases) assert.equal(result?.kind, "error");
  assert.equal(cases[3]?.returnPath, "/login");
  const denied = resolveGoogleRedirect({ error: "access_denied", state: "s1" }, pending, NOW);
  assert.deepEqual(denied, { kind: "error", message: GOOGLE_DENIED_MESSAGE, returnPath: "/signup?role=partner" });
  assert.equal(resolveGoogleRedirect(null, pending, NOW), null);
});
