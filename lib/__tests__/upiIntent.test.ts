import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseUpiIntentLinks, UPI_APPS, upiAppLaunchUrls, upiLaunchUrls } from "../upiIntent";

const query = "pay?pa=nura@bank&pn=Nura&am=500.00&cu=INR";

test("a known app's intent opens that app first, then plain upi://", () => {
  assert.deepEqual(upiLaunchUrls(`intent://${query}#Intent;scheme=upi;package=com.phonepe.app;end`), [
    `phonepe://${query}`,
    `upi://${query}`,
  ]);
  assert.deepEqual(
    upiLaunchUrls(`intent://${query}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`),
    [`tez://upi/${query}`, `upi://${query}`],
  );
  assert.deepEqual(upiLaunchUrls(`intent://${query}#Intent;package=net.one97.paytm;scheme=upi;end`), [
    `paytmmp://${query}`,
    `upi://${query}`,
  ]);
  assert.deepEqual(upiLaunchUrls(`intent://upi/${query}#Intent;scheme=upi;package=com.dreamplug.androidapp;end`), [
    `credpay://upi/${query}`,
    `upi://upi/${query}`,
  ]);
});

test("an unknown or missing package falls back to the plain link", () => {
  assert.deepEqual(upiLaunchUrls(`intent://${query}#Intent;scheme=upi;package=com.example.pay;end`), [`upi://${query}`]);
  assert.deepEqual(upiLaunchUrls(`intent://${query}#Intent;scheme=upi;end`), [`upi://${query}`]);
  assert.deepEqual(upiLaunchUrls(`intent://${query}#Intent;end`), [`upi://${query}`]);
});

test("links that aren't intents are left alone", () => {
  assert.deepEqual(upiLaunchUrls(`phonepe://${query}`), [`phonepe://${query}`]);
  assert.deepEqual(upiLaunchUrls(`upi://${query}`), [`upi://${query}`]);
});

const upi = "upi://pay?pa=nura@bank&pn=Nura&am=500.00&cu=INR&tr=cf123";
const app = (id: string) => UPI_APPS.find((a) => a.id === id)!;

test("intent links: per-app links from Cashfree's payload are used as given", () => {
  const links = parseUpiIntentLinks({
    data: { url: null, payload: { default: upi, phonepe: "phonepe://pay?x=1", gpay: "tez://upi/pay?x=1", bhim: "bhim://upi/pay?x=1" } },
  });
  assert.equal(links?.defaultUrl, upi);
  assert.deepEqual(upiAppLaunchUrls(app("phonepe"), links!), ["phonepe://pay?x=1", upi]);
  assert.deepEqual(upiAppLaunchUrls(app("gpay"), links!), ["tez://upi/pay?x=1", upi]);
});

test("intent links: without a per-app link, upi:// is rewritten to the app's scheme", () => {
  const links = parseUpiIntentLinks({ data: { url: upi, payload: null } })!;
  const query = upi.slice("upi://".length);
  assert.deepEqual(upiAppLaunchUrls(app("phonepe"), links), [`phonepe://${query}`, upi]);
  assert.deepEqual(upiAppLaunchUrls(app("gpay"), links), [`tez://upi/${query}`, upi]);
  assert.deepEqual(upiAppLaunchUrls(app("paytm"), links), [`paytmmp://${query}`, upi]);
  // No known scheme of its own: plain upi:// only.
  assert.deepEqual(upiAppLaunchUrls(app("bhim"), links), [upi]);
  // "Other app" = the system chooser.
  assert.deepEqual(upiAppLaunchUrls(null, links), [upi]);
});

test("intent links: no usable upi:// link means null", () => {
  assert.equal(parseUpiIntentLinks(null), null);
  assert.equal(parseUpiIntentLinks({ data: { url: "https://pay.example.com/x", payload: null } }), null);
  assert.equal(parseUpiIntentLinks({ message: "bad request" }), null);
});

test("every UPI app scheme is declared for Android queries and iOS", () => {
  const root = path.join(__dirname, "../..");
  const plugin = readFileSync(path.join(root, "plugins/withUpiAppQueries.js"), "utf8");
  const iosSchemes: string[] = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")).expo.ios.infoPlist.LSApplicationQueriesSchemes;
  for (const a of UPI_APPS) {
    const scheme = a.probe.replace("://", "");
    assert.ok(plugin.includes(`"${scheme}"`), `Android <queries> is missing ${scheme}`);
    assert.ok(iosSchemes.includes(scheme), `LSApplicationQueriesSchemes is missing ${scheme}`);
  }
});
