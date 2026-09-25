// Loss-proof send verification for the annotation queue.
// Loads the REAL background.js in a vm sandbox with stubbed chrome/fetch and
// drives the actual sendQueuedAnnotations + queue store through:
//   1. throw mid-batch            -> failed entry + remainder preserved, history partial
//   2. restart between snapshot and completion (orphaned in-flight snapshot)
//                                 -> queue intact, recovery history entry, retry offerable
//   3. send with no claim         -> throws but queue + history intact (old take() lost this)
//   4. full success               -> queue drained, history sent
//   5. history cap                -> last 20 attempts/tab, no screenshot dataUrls anywhere
//   6. disconnectTab              -> queue + history preserved (no wipe)
//   7. PR #2 surface              -> get_queue_for_copy keeps full fidelity, strips bytes
// Exit non-zero on the first failure. Run: node scripts/verify-send-loss-proof.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url);
const backgroundSrc = fs.readFileSync(new URL("../background.js", import.meta.url), "utf8");

// ---- stubs ---------------------------------------------------------------
const storeData = {};
const sessionArea = {
  async get(keys) {
    if (typeof keys === "string") return { [keys]: storeData[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, storeData[k]]));
    return { ...storeData };
  },
  async set(obj) {
    Object.assign(storeData, obj);
  },
};

// fetchPlan.annotation is consumed per /annotation POST: "ok" | Error instance
// | { status, payload }. /claim and /unclaim always succeed unless told otherwise.
const fetchPlan = { annotation: [] };
function setAnnotationBehaviors(list) {
  fetchPlan.annotation = list.slice();
}
function jsonResponse(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}
async function fetchStub(url) {
  const u = String(url);
  if (u.endsWith("/claim") || u.endsWith("/unclaim")) return jsonResponse(200, { ok: true });
  if (u.endsWith("/annotation")) {
    const next = fetchPlan.annotation.length ? fetchPlan.annotation.shift() : "ok";
    if (next instanceof Error) throw next;
    if (next && typeof next === "object") return jsonResponse(next.status, next.payload);
    return jsonResponse(200, { ok: true });
  }
  if (u.endsWith("/status")) return jsonResponse(200, { app: "opencode-chrome-annotation" });
  return jsonResponse(404, { ok: false, error: "not found" });
}

const chromeStub = {
  runtime: {
    getManifest: () => ({ version: "test" }),
    onMessage: { addListener() {} },
    sendMessage: () => undefined,
  },
  storage: { session: sessionArea },
  tabs: {
    query: async () => [],
    get: async () => {
      throw new Error("no such tab");
    },
    onRemoved: { addListener() {} },
    onUpdated: { addListener() {} },
    onActivated: { addListener() {} },
  },
  scripting: { executeScript: async () => [] },
  action: { onClicked: { addListener() {} } },
  // sidePanel deliberately omitted -> SIDE_PANEL_SUPPORTED === false in tests
};

const sandbox = {
  chrome: chromeStub,
  fetch: fetchStub,
  crypto: globalThis.crypto,
  URL: globalThis.URL,
  AbortController: globalThis.AbortController,
  console,
};
vm.createContext(sandbox);
vm.runInContext(backgroundSrc, sandbox, { filename: "background.js" });
// Let the bottom-of-file restoreClaimState() settle before testing.
await new Promise((r) => setTimeout(r, 20));

const { annotationQueues, claimedTabs, createAnnotationQueueStore } = sandbox;
assert.equal(typeof sandbox.sendQueuedAnnotations, "function", "sendQueuedAnnotations is defined");

function seedEntry(tabId, comment) {
  return annotationQueues.add(tabId, {
    comment,
    page: { url: "https://example.com/", title: "Example" },
    element: { selector: "#x", tag: "div", role: null, text: "hi", className: "a b" },
    viewport: null,
    screenshot: { mime: "image/png", dataUrl: "data:image/png;base64,AAA" },
    createdAt: Date.now(),
  });
}
function setClaim(tabId) {
  claimedTabs.set(tabId, {
    sessionId: "sess-1",
    sessionLabel: "test",
    baseUrl: "http://127.0.0.1:39240",
    origin: "https://example.com/*",
    extensionVersion: "test",
  });
}
function historyJson(tabId) {
  return JSON.stringify(annotationQueues.listHistory(tabId));
}

// ---- 1. throw mid-batch ---------------------------------------------------
{
  const tab = 101;
  setClaim(tab);
  const ids = [await seedEntry(tab, "one"), await seedEntry(tab, "two"), await seedEntry(tab, "three")];
  setAnnotationBehaviors(["ok", new Error("connection refused")]);
  const res = await sandbox.sendQueuedAnnotations({ id: tab });
  assert.equal(res.ok, false, "1: send reports failure");
  assert.equal(res.sent, 1, "1: one entry confirmed sent");
  const remaining = annotationQueues.list(tab);
  // NOTE: JSON comparison because vm-realm arrays carry a different Array
  // prototype than this runner, which trips assert.deepStrictEqual.
  assert.equal(
    JSON.stringify(remaining.map((e) => e.id)),
    JSON.stringify([ids[1], ids[2]]),
    "1: failed entry itself + remainder preserved with stable ids (nothing re-added/duplicated)"
  );
  assert.equal(remaining[0].comment, "two", "1: failed entry payload intact");
  assert.equal(
    remaining[0].screenshot?.dataUrl,
    "data:image/png;base64,AAA",
    "1: screenshot payload stays in queue for retry"
  );
  assert.equal(res.unsent?.length, 2, "1: failure response carries unsent summaries");
  const hist = annotationQueues.listHistory(tab);
  assert.equal(hist.length, 1, "1: one history record");
  assert.equal(hist[0].status, "partial", "1: history status partial");
  assert.equal(hist[0].sentCount, 1, "1: history sentCount");
  assert.equal(hist[0].totalCount, 3, "1: history totalCount");
  assert.match(hist[0].error, /connection refused/, "1: history error message");
  assert.equal(sandbox.annotationQueues.getInFlight(tab), null, "1: in-flight cleared on completion");
  assert.ok(!historyJson(tab).includes("data:image"), "1: history never duplicates screenshot bytes");
  console.log("PASS 1: throw mid-batch preserves failed entry + remainder, records partial history");
}

// ---- 2. restart between snapshot and completion ---------------------------
{
  const tab = 102;
  setClaim(tab);
  const ids = [await seedEntry(tab, "a"), await seedEntry(tab, "b"), await seedEntry(tab, "c")];
  // Simulate exactly what sendQueuedAnnotations persists before POSTing...
  await annotationQueues.setInFlight(tab, {
    attemptId: "attempt-restart-1",
    timestamp: Date.now(),
    entryIds: ids,
    totalCount: ids.length,
  });
  // ...then one POST succeeds + per-entry remove lands, then the worker dies.
  await annotationQueues.remove(tab, ids[0]);
  // "Restart": a brand-new store over the same persisted bytes recovers.
  const fresh = createAnnotationQueueStore();
  await fresh.restore();
  const recoveredQueue = fresh.list(tab);
  assert.equal(
    JSON.stringify(recoveredQueue.map((e) => e.id)),
    JSON.stringify([ids[1], ids[2]]),
    "2: restart leaves unsent entries in the store (no silent loss)"
  );
  const recoveredHist = fresh.listHistory(tab);
  assert.equal(recoveredHist.length, 1, "2: recovery records exactly one history entry");
  assert.equal(recoveredHist[0].status, "partial", "2: recovery status partial (1 of 3 delivered)");
  assert.equal(recoveredHist[0].sentCount, 1, "2: recovery sentCount derived from queue");
  assert.equal(recoveredHist[0].totalCount, 3, "2: recovery totalCount");
  assert.match(recoveredHist[0].error, /restart/i, "2: recovery error names the interruption");
  assert.equal(fresh.getInFlight(tab), null, "2: orphaned in-flight snapshot consumed");
  assert.ok(!JSON.stringify(recoveredHist).includes("data:image"), "2: recovery history has no bytes");
  assert.equal(
    recoveredQueue[0].screenshot?.dataUrl,
    "data:image/png;base64,AAA",
    "2: full payloads stay in queue, history only references ids"
  );
  console.log("PASS 2: worker restart between snapshot and completion recovers with retry intact");
}

// ---- 3. send with no claim -------------------------------------------------
{
  const tab = 103;
  await seedEntry(tab, "x");
  await seedEntry(tab, "y");
  await assert.rejects(
    sandbox.sendQueuedAnnotations({ id: tab }),
    /not connected/,
    "3: still throws without a claim"
  );
  assert.equal(annotationQueues.list(tab).length, 2, "3: queue untouched (old take() deleted it here)");
  const hist = annotationQueues.listHistory(tab);
  assert.equal(hist.length, 1, "3: failed attempt recorded");
  assert.equal(hist[0].status, "failed", "3: history status failed");
  assert.equal(hist[0].totalCount, 2, "3: history totalCount");
  console.log("PASS 3: claim-missing send throws yet preserves queue + history");
}

// ---- 4. full success -------------------------------------------------------
{
  const tab = 104;
  setClaim(tab);
  await seedEntry(tab, "m");
  await seedEntry(tab, "n");
  setAnnotationBehaviors(["ok", "ok"]);
  const res = await sandbox.sendQueuedAnnotations({ id: tab });
  assert.equal(res.ok, true, "4: send reports success");
  assert.equal(res.sent, 2, "4: both entries sent");
  assert.equal(annotationQueues.list(tab).length, 0, "4: confirmed-sent entries removed");
  const hist = annotationQueues.listHistory(tab);
  assert.equal(hist[0].status, "sent", "4: history status sent");
  assert.equal(hist[0].sentCount, 2, "4: history sentCount");
  console.log("PASS 4: full success drains queue and logs a sent attempt");
}

// ---- 5. history cap + no bytes ---------------------------------------------
{
  const tab = 105;
  for (let i = 0; i < 25; i++) {
    await annotationQueues.recordAttempt(tab, {
      attemptId: `a-${i}`,
      timestamp: Date.now(),
      status: i % 2 ? "failed" : "sent",
      sentCount: 0,
      totalCount: 1,
      error: i % 2 ? "boom" : "",
      entryIds: [`id-${i}`],
    });
  }
  const hist = annotationQueues.listHistory(tab);
  assert.equal(hist.length, 20, "5: history capped at last 20 attempts");
  assert.equal(hist[0].attemptId, "a-24", "5: most recent first");
  assert.ok(!JSON.stringify(hist).includes("data:image"), "5: no screenshot bytes in history");
  console.log("PASS 5: history capped at 20/tab, metadata only");
}

// ---- 6. disconnect preserves -----------------------------------------------
{
  const tab = 106;
  setClaim(tab);
  await seedEntry(tab, "keep-me");
  await annotationQueues.recordAttempt(tab, {
    attemptId: "a-disc",
    timestamp: Date.now(),
    status: "failed",
    sentCount: 0,
    totalCount: 1,
    error: "boom",
    entryIds: ["x"],
  });
  const out = await sandbox.disconnectTab({ id: tab });
  assert.equal(out, true, "6: disconnect reports true");
  assert.equal(claimedTabs.get(tab), undefined, "6: claim cleared");
  assert.equal(annotationQueues.list(tab).length, 1, "6: queue NOT wiped on disconnect");
  assert.equal(annotationQueues.listHistory(tab).length, 1, "6: history NOT wiped on disconnect");
  console.log("PASS 6: disconnectTab preserves queue + history for retry after reconnect");
}

// ---- 7. PR #2 copy surface intact -------------------------------------------
{
  const tab = 107;
  setClaim(tab);
  await seedEntry(tab, "copy me");
  const res = await sandbox.runMessageAction({ type: "get_queue_for_copy" }, { id: tab }, {});
  assert.equal(res.ok, true, "7: get_queue_for_copy ok");
  assert.equal(res.annotations.length, 1, "7: one annotation");
  assert.equal(res.annotations[0].element.className, "a b", "7: FULL className preserved");
  assert.equal(res.annotations[0].hasScreenshot, true, "7: screenshot flagged, not embedded");
  assert.ok(!JSON.stringify(res.annotations).includes("data:image"), "7: no dataUrl bytes in copy payload");
  const state = await sandbox.runMessageAction({ type: "panel_get_state" }, { id: tab }, {});
  assert.equal(state.ok, true, "7: panel_get_state ok");
  assert.ok(Array.isArray(state.history), "7: panel state carries history");
  assert.ok("inFlight" in state, "7: panel state carries inFlight");
  console.log("PASS 7: PR #2 copy/formatter surface intact; panel state carries history");
}

console.log("\nAll send-loss proofs passed: failed sends never drop entries.");
