// extension-src/logger.ts
function logExtension(message, details) {
  if (details === undefined) {
    console.log(`[OpenCode] ${message}`);
    return;
  }
  console.log(`[OpenCode] ${message}`, details);
}
function warnExtension(message, details) {
  if (details === undefined) {
    console.warn(`[OpenCode] ${message}`);
    return;
  }
  console.warn(`[OpenCode] ${message}`, details);
}

// extension-src/tabs.ts
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id)
    throw new Error("No active tab found");
  return tab;
}

// extension-src/constants.ts
var APP_ID = "opencode-chrome-annotation";
var PORT_START = 39240;
var PORT_END = 39260;
var DISCOVERY_TIMEOUT_MS = 200;
var CONNECTION_CHECK_INTERVAL_MS = 1e4;
var CONNECTION_STATUS_TIMEOUT_MS = 1200;

// extension-src/side-panel.ts
var SIDE_PANEL_SUPPORTED = typeof chrome.sidePanel !== "undefined";
var selectionSessions = new Map();
var BROADCAST_MESSAGE_TYPES = new Set([
  "connect_tab_to_session",
  "disconnect_tab",
  "start_annotation_from_overlay",
  "remove_queued_annotation",
  "clear_queue",
  "send_queued_annotations",
  "close_session",
  "panel_start_annotation",
  "panel_cancel_selection",
  "panel_submit_annotation",
  "panel_reselect_element",
  "selection_pick",
  "selection_cancel",
  "selection_exited"
]);
function broadcastPanelChanged() {
  try {
    const result = chrome.runtime.sendMessage({ type: "panel_state_changed" });
    if (result && typeof result.catch === "function")
      result.catch(() => {});
  } catch {}
}
function toQueueSummary(entry) {
  const element = entry?.element || null;
  return {
    id: entry?.id,
    comment: entry?.comment,
    tag: element?.tag,
    selector: element?.selector,
    page: entry?.page ? { url: entry.page.url || "", title: entry.page.title || "" } : null,
    element: element ? {
      selector: element.selector || "",
      tag: element.tag || "",
      role: element.role || "",
      text: typeof element.text === "string" ? element.text : "",
      ariaLabel: element.ariaLabel ?? null,
      id: element.id ?? null,
      className: typeof element.className === "string" ? element.className : "",
      rect: element.rect ? {
        x: element.rect.x ?? element.rect.left ?? 0,
        y: element.rect.y ?? element.rect.top ?? 0,
        width: element.rect.width ?? 0,
        height: element.rect.height ?? 0
      } : null
    } : null,
    viewport: entry?.viewport || null,
    hasScreenshot: !!(entry?.screenshot && typeof entry.screenshot.dataUrl === "string"),
    createdAt: entry?.createdAt ?? null
  };
}

// extension-src/server-api.ts
async function fetchJson(url, options = {}) {
  const {
    method = "GET",
    body,
    timeoutMs,
    throwOnHttp = true
  } = options;
  const controller = Number.isFinite(timeoutMs) ? new AbortController : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const headers = {};
    let payloadBody;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payloadBody = JSON.stringify(body);
    }
    const response = await fetch(url, {
      method,
      headers,
      body: payloadBody,
      signal: controller?.signal
    });
    const payload = await response.json().catch(() => null);
    if (throwOnHttp && !response.ok)
      throw new Error(`status ${response.status}`);
    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  } finally {
    if (timeout)
      clearTimeout(timeout);
  }
}
async function discoverInstances() {
  const ports = [];
  for (let portNumber = PORT_START;portNumber <= PORT_END; portNumber++)
    ports.push(portNumber);
  const settled = await Promise.allSettled(ports.map(async (portNumber) => {
    const result = await fetchJson(`http://127.0.0.1:${portNumber}/status`, {
      timeoutMs: DISCOVERY_TIMEOUT_MS
    });
    if (result.payload?.app !== APP_ID)
      throw new Error("not annotation server");
    return { baseUrl: `http://127.0.0.1:${portNumber}`, status: result.payload };
  }));
  return settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
}
async function postJson(baseUrl, path, body) {
  const result = await fetchJson(`${baseUrl}${path}`, {
    method: "POST",
    body: body || {}
  });
  const payload = result.payload || {};
  if (payload?.ok === false) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Request failed (${result.status})`);
  }
  return payload;
}
async function requestSessionState() {
  const instances = await discoverInstances();
  if (!instances.length) {
    return {
      sessions: [],
      context: { reason: "plugin-not-found", instanceCount: 0 }
    };
  }
  const byId = new Map;
  for (const instance of instances) {
    try {
      const result = await fetchJson(`${instance.baseUrl}/sessions`, { throwOnHttp: false });
      if (!result.ok)
        continue;
      const payload = result.payload;
      const list = Array.isArray(payload?.sessions) ? payload.sessions : [];
      for (const item of list) {
        if (typeof item?.id !== "string" || item.id.startsWith("plugin:"))
          continue;
        const prev = byId.get(item.id);
        const prevUpdated = Number(prev?.updatedAt) || 0;
        const nextUpdated = Number(item?.updatedAt) || 0;
        if (!prev || nextUpdated >= prevUpdated)
          byId.set(item.id, { ...item, baseUrl: instance.baseUrl });
      }
    } catch {}
  }
  const sessions = Array.from(byId.values());
  return {
    sessions,
    context: {
      reason: sessions.length ? undefined : "no-sessions",
      instanceCount: instances.length
    }
  };
}
async function checkServerStatus(baseUrl, timeoutMs) {
  try {
    const result = await fetchJson(`${baseUrl}/status`, {
      timeoutMs,
      throwOnHttp: false
    });
    if (!result.ok)
      return false;
    return result.payload?.app === APP_ID;
  } catch {
    return false;
  }
}

// extension-src/ui-overlays.ts
async function injectConnectionOverlay(tabId, openQueue = false) {
  if (SIDE_PANEL_SUPPORTED)
    return;
  const queueEntries = annotationQueues.list(tabId).map((entry) => ({
    id: entry.id,
    comment: entry.comment,
    tag: entry.element?.tag,
    selector: entry.element?.selector
  }));
  const linkedLabel = claimedTabs.get(tabId)?.sessionLabel || "Connected";
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      files: ["injected/dom.js"]
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      args: [queueEntries, openQueue === true, linkedLabel],
      func: (entries, openPanel, linkedLabelArg) => {
        const h = globalThis.__opc_h;
        const makeDockable = globalThis.__opc_makeDockable;
        if (typeof makeDockable !== "function") {
          throw new Error("OpenCode dock helper is unavailable");
        }
        globalThis.__opc_lastQueueCount = entries.length;
        if (openPanel) {
          globalThis.__opc_queuePanelOpen = true;
        }
        const PANEL_STYLE = {
          panel: [
            "position:fixed",
            "right:12px",
            "z-index:2147483647",
            "width:min(360px,calc(100vw - 24px))",
            "max-height:min(420px,calc(100vh - 96px))",
            "overflow:auto",
            "padding:10px",
            "border-radius:12px",
            "background:rgba(255,255,255,0.97)",
            "color:#111111",
            "border:1px solid rgba(0,0,0,0.12)",
            "box-shadow:0 14px 40px rgba(0,0,0,0.35)",
            "font:12px/1.35 ui-sans-serif,system-ui,sans-serif",
            "pointer-events:auto",
            "backdrop-filter:blur(8px)",
            "user-select:none",
            "-webkit-user-select:none"
          ].join(";"),
          header: "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 2px 8px;",
          title: "font-weight:700;margin:2px 4px 8px;color:#111111;",
          titleHeader: "font-weight:700;color:#111111;",
          close: "display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:#111111;cursor:pointer;font:700 14px/1 ui-sans-serif,system-ui,sans-serif;padding:0 2px;",
          empty: "padding:8px 4px 2px;color:#111111;",
          item: "padding:8px 2px;border-top:1px solid rgba(0,0,0,0.08);",
          itemHeader: "display:flex;align-items:center;justify-content:space-between;gap:8px;",
          itemIndex: "font-weight:600;color:#6b7280;margin-right:6px;",
          itemMeta: "margin-top:2px;color:#6b7280;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.92;",
          itemComment: "margin-top:4px;color:#111111;word-break:break-word;line-height:1.45;",
          itemRemove: "border:0;background:transparent;color:#111111;cursor:pointer;font:700 14px/1 ui-sans-serif,system-ui,sans-serif;padding:0 4px;",
          footer: "display:flex;gap:8px;justify-content:flex-end;margin-top:10px;",
          secondary: "padding:6px 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:transparent;color:#111111;cursor:pointer;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;",
          primary: "padding:6px 10px;border-radius:999px;border:0;background:#111111;color:#ffffff;cursor:pointer;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;"
        };
        function createCloseIcon() {
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("viewBox", "0 0 12 12");
          svg.setAttribute("width", "12");
          svg.setAttribute("height", "12");
          svg.setAttribute("aria-hidden", "true");
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", "M2 2 L10 10 M10 2 L2 10");
          path.setAttribute("stroke", "currentColor");
          path.setAttribute("stroke-width", "1.8");
          path.setAttribute("stroke-linecap", "round");
          svg.appendChild(path);
          return svg;
        }
        function sendRuntimeMessage(payload) {
          try {
            chrome.runtime.sendMessage(payload);
          } catch {}
        }
        function buildPanel(dock) {
          const count = entries.length;
          const panel = h("div", { attrs: { id: "__opc_queue_panel" }, style: PANEL_STYLE.panel + (dock === "bottom" ? ";bottom:48px;top:auto" : ";top:48px;bottom:auto") });
          panel.appendChild(h("div", { style: PANEL_STYLE.header }, [
            h("div", { text: `Queued annotations (${count})`, style: PANEL_STYLE.titleHeader }),
            h("button", {
              style: PANEL_STYLE.close,
              attrs: { type: "button", "aria-label": "Close queued annotations" },
              on: {
                click: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  globalThis.__opc_queuePanelOpen = false;
                  panel.remove();
                }
              }
            }, [createCloseIcon()])
          ]));
          if (!count) {
            panel.appendChild(h("div", { text: "No queued annotations yet", style: PANEL_STYLE.empty }));
            return panel;
          }
          entries.forEach((entry, index) => {
            const excerpt = typeof entry.comment === "string" && entry.comment.length > 140 ? `${entry.comment.slice(0, 140)}...` : entry.comment || "";
            panel.appendChild(h("div", { style: PANEL_STYLE.item }, [
              h("div", { style: PANEL_STYLE.itemHeader }, [
                h("div", {}, [
                  h("span", { text: `${index + 1}.`, style: PANEL_STYLE.itemIndex }),
                  h("span", { text: `${entry.tag || ""} ${entry.selector || ""}`.trim(), style: PANEL_STYLE.itemMeta })
                ]),
                h("button", {
                  text: "\u00d7",
                  style: PANEL_STYLE.itemRemove,
                  attrs: { type: "button", "aria-label": `Remove queued annotation ${index + 1}` },
                  on: {
                    click: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      sendRuntimeMessage({ type: "remove_queued_annotation", id: entry.id });
                    }
                  }
                })
              ]),
              h("div", { text: excerpt, style: PANEL_STYLE.itemComment })
            ]));
          });
          panel.appendChild(h("div", { style: PANEL_STYLE.footer }, [
            h("button", {
              text: "Clear",
              style: PANEL_STYLE.secondary,
              attrs: { type: "button" },
              on: {
                click: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  sendRuntimeMessage({ type: "clear_queue" });
                }
              }
            }),
            h("button", {
              text: "Send all to OpenCode",
              style: PANEL_STYLE.primary,
              attrs: { type: "button" },
              on: {
                click: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  sendRuntimeMessage({ type: "send_queued_annotations" });
                }
              }
            })
          ]));
          return panel;
        }
        let overlay = document.getElementById("__opc_connection_overlay");
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = "__opc_connection_overlay";
          overlay.style.cssText = [
            "position:fixed",
            "left:50%",
            "z-index:2147483647",
            "transform:translateX(-50%)",
            "display:flex",
            "align-items:center",
            "gap:8px",
            "padding:6px 8px 6px 10px",
            "border-radius:999px",
            "background:rgba(255,255,255,0.97)",
            "color:#111111",
            "border:1px solid rgba(0,0,0,0.12)",
            "box-shadow:0 8px 24px rgba(0,0,0,0.22)",
            "font:12px/1.2 ui-sans-serif,system-ui,sans-serif",
            "pointer-events:auto",
            "backdrop-filter:blur(8px)",
            "cursor:grab",
            "user-select:none",
            "-webkit-user-select:none"
          ].join(";");
          const label2 = document.createElement("button");
          label2.type = "button";
          label2.dataset.role = "label";
          label2.title = "Linked OpenCode chat - click to switch";
          label2.style.cssText = [
            "border:0",
            "background:transparent",
            "color:#111111",
            "font:600 12px/1.2 ui-sans-serif,system-ui,sans-serif",
            "cursor:pointer",
            "padding:0",
            "max-width:200px",
            "overflow:hidden",
            "text-overflow:ellipsis",
            "white-space:nowrap",
            "text-align:left"
          ].join(";");
          label2.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            sendRuntimeMessage({ type: "refresh_sessions" });
          });
          overlay.appendChild(label2);
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Annotate";
          button.style.cssText = [
            "border:0",
            "border-radius:999px",
            "padding:4px 8px",
            "background:#111111",
            "color:#ffffff",
            "font:600 11px/1 ui-sans-serif,system-ui,sans-serif",
            "cursor:pointer"
          ].join(";");
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            sendRuntimeMessage({ type: "start_annotation_from_overlay" });
          });
          overlay.appendChild(button);
          const queueButton = document.createElement("button");
          queueButton.type = "button";
          queueButton.setAttribute("aria-label", "Queued annotations");
          queueButton.style.cssText = [
            "position:relative",
            "border:1px solid rgba(0,0,0,0.12)",
            "border-radius:999px",
            "padding:4px 8px",
            "background:transparent",
            "color:#111111",
            "font:600 11px/1 ui-sans-serif,system-ui,sans-serif",
            "cursor:pointer"
          ].join(";");
          queueButton.textContent = "Queue";
          if (entries.length) {
            const badge = document.createElement("span");
            badge.textContent = String(entries.length);
            badge.style.cssText = [
              "margin-left:5px",
              "padding:1px 5px",
              "border-radius:999px",
              "background:#bbf7d0",
              "color:#111111",
              "font:700 10px/1.4 ui-sans-serif,system-ui,sans-serif",
              "vertical-align:super"
            ].join(";");
            queueButton.appendChild(badge);
          }
          queueButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            globalThis.__opc_queuePanelOpen = !globalThis.__opc_queuePanelOpen;
            document.getElementById("__opc_queue_panel")?.remove();
            if (globalThis.__opc_queuePanelOpen) {
              document.documentElement.appendChild(buildPanel(overlay.dataset.dock));
            }
          });
          overlay.appendChild(queueButton);
          const closeButton = document.createElement("button");
          closeButton.type = "button";
          closeButton.setAttribute("aria-label", "Disconnect tab");
          closeButton.style.cssText = [
            "border:0",
            "padding:0 2px",
            "background:transparent",
            "color:#111111",
            "font:700 14px/1 ui-sans-serif,system-ui,sans-serif",
            "cursor:pointer"
          ].join(";");
          closeButton.appendChild(createCloseIcon());
          closeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            sendRuntimeMessage({ type: "disconnect_tab" });
          });
          overlay.appendChild(closeButton);
          document.documentElement.appendChild(overlay);
        }
        const dockable = makeDockable(overlay, { blockDragSelector: "button", snapThreshold: 10 });
        dockable.applyDockPosition(overlay.dataset.dock);
        const label = overlay.querySelector("[data-role='label']");
        if (label)
          label.textContent = linkedLabelArg;
        document.getElementById("__opc_queue_panel")?.remove();
        if (globalThis.__opc_queuePanelOpen) {
          document.documentElement.appendChild(buildPanel(overlay.dataset.dock));
        }
      }
    });
  } catch (error) {
    warnExtension("Failed to inject connection overlay", { tabId, error: error instanceof Error ? error.message : String(error) });
  }
}
async function removeConnectionOverlay(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: () => {
        document.getElementById("__opc_connection_overlay")?.remove();
        document.getElementById("__opc_queue_panel")?.remove();
        delete globalThis.__opc_queuePanelOpen;
      }
    });
  } catch {}
}
async function showAnnotationError(tabId, message) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    args: [message],
    func: (errorMessage) => {
      const existing = document.getElementById("__opc_annotation_error");
      if (existing)
        existing.remove();
      const panel = document.createElement("div");
      panel.id = "__opc_annotation_error";
      panel.textContent = `OpenCode annotation failed: ${errorMessage}`;
      panel.style.cssText = [
        "position:fixed",
        "right:16px",
        "bottom:16px",
        "z-index:2147483647",
        "max-width:360px",
        "padding:12px 14px",
        "border-radius:10px",
        "background:#ffe4e6",
        "color:#111111",
        "border:1px solid rgba(0,0,0,0.10)",
        "box-shadow:0 10px 30px rgba(0,0,0,0.35)",
        "font:13px/1.4 ui-sans-serif,system-ui,sans-serif",
        "transform:translateX(calc(100% + 40px))",
        "opacity:0",
        "transition:transform 180ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease"
      ].join(";");
      document.documentElement.appendChild(panel);
      requestAnimationFrame(() => {
        panel.style.transform = "translateX(0)";
        panel.style.opacity = "1";
      });
      setTimeout(() => {
        panel.style.transform = "translateX(calc(100% + 40px))";
        panel.style.opacity = "0";
        setTimeout(() => panel.remove(), 220);
      }, 7000);
    }
  });
}
async function showSendToast(tabId, message) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    args: [message],
    func: (successMessage) => {
      const existing = document.getElementById("__opc_annotation_sent");
      if (existing)
        existing.remove();
      const panel = document.createElement("div");
      panel.id = "__opc_annotation_sent";
      panel.textContent = successMessage;
      panel.style.cssText = [
        "position:fixed",
        "right:16px",
        "bottom:16px",
        "z-index:2147483647",
        "max-width:360px",
        "padding:12px 14px",
        "border-radius:10px",
        "background:#d1fae5",
        "color:#111111",
        "border:1px solid rgba(0,0,0,0.10)",
        "box-shadow:0 10px 30px rgba(0,0,0,0.35)",
        "font:13px/1.4 ui-sans-serif,system-ui,sans-serif",
        "transform:translateX(calc(100% + 40px))",
        "opacity:0",
        "transition:transform 180ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease"
      ].join(";");
      document.documentElement.appendChild(panel);
      requestAnimationFrame(() => {
        panel.style.transform = "translateX(0)";
        panel.style.opacity = "1";
      });
      setTimeout(() => {
        panel.style.transform = "translateX(calc(100% + 40px))";
        panel.style.opacity = "0";
        setTimeout(() => panel.remove(), 220);
      }, 3500);
    }
  });
}

// extension-src/session-picker.ts
function sessionPickerScript(items, context, currentSessionId) {
  const h = globalThis.__opc_h;
  const makeDockable = globalThis.__opc_makeDockable;
  if (typeof h !== "function" || typeof makeDockable !== "function") {
    throw new Error("OpenCode UI helpers are unavailable");
  }
  if (typeof globalThis.__opc_cleanupSessionPicker === "function") {
    globalThis.__opc_cleanupSessionPicker();
  }
  const STYLE = {
    collapsed: [
      "position:fixed",
      "left:50%",
      "z-index:2147483647",
      "transform:translateX(-50%)",
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:6px 8px 6px 10px",
      "border-radius:999px",
      "background:rgba(255,255,255,0.97)",
      "color:#111111",
      "border:1px solid rgba(0,0,0,0.12)",
      "box-shadow:0 8px 24px rgba(0,0,0,0.22)",
      "font:12px/1.2 ui-sans-serif,system-ui,sans-serif",
      "pointer-events:auto",
      "backdrop-filter:blur(8px)",
      "cursor:grab",
      "user-select:none",
      "-webkit-user-select:none"
    ].join(";"),
    expanded: [
      "position:fixed",
      "left:50%",
      "z-index:2147483647",
      "transform:translateX(-50%)",
      "display:flex",
      "flex-direction:column",
      "max-height:min(560px,calc(100vh - 64px))",
      "width:min(420px,calc(100vw - 20px))",
      "padding:10px",
      "border-radius:14px",
      "background:rgba(255,255,255,0.97)",
      "color:#111111",
      "border:1px solid rgba(0,0,0,0.12)",
      "box-shadow:0 14px 40px rgba(0,0,0,0.35)",
      "font:12px/1.35 ui-sans-serif,system-ui,sans-serif",
      "pointer-events:auto",
      "backdrop-filter:blur(8px)",
      "cursor:grab",
      "user-select:none",
      "-webkit-user-select:none"
    ].join(";"),
    row: "display:flex;align-items:center;gap:8px;",
    label: "font-weight:600;",
    annotate: "border:0;border-radius:999px;padding:4px 8px;background:#111111;color:#ffffff;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;",
    title: "font-weight:700;margin:2px 4px 8px;color:#111111;",
    header: "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 2px 8px;",
    empty: "padding:8px 4px 2px;color:#111111;",
    emptyTitle: "font-weight:700;margin-bottom:6px;",
    emptyText: "margin:0 0 8px;color:#6b7280;line-height:1.45;",
    emptyList: "margin:0;padding-left:18px;color:#6b7280;line-height:1.5;",
    retry: "margin-top:10px;border:0;border-radius:999px;padding:6px 10px;background:#111111;color:#ffffff;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;",
    itemButton: [
      "display:block",
      "width:100%",
      "text-align:left",
      "padding:7px 2px 7px 4px",
      "margin:0",
      "border:0",
      "border-radius:0",
      "border-bottom:1px solid rgba(0,0,0,0.08)",
      "background:transparent",
      "color:#111111",
      "cursor:pointer"
    ].join(";"),
    itemButtonFocused: [
      "background:#f3f4f6"
    ].join(";"),
    name: "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
    groupHeader: "display:flex;align-items:baseline;gap:6px;margin:10px 2px 2px;padding-top:6px;border-top:1px solid rgba(0,0,0,0.08);overflow:hidden;",
    groupName: "font-weight:700;color:#111111;font-size:11px;flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
    groupPath: "color:#6b7280;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
    meta: "margin-top:2px;color:#6b7280;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.92;",
    chipsRow: "display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 2px 8px;flex:none;",
    chip: "padding:4px 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:transparent;color:#111111;cursor:pointer;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;",
    chipActive: "background:#111111;color:#ffffff;border-color:#111111;",
    list: "flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;margin:0 2px;",
    close: "display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:#111111;cursor:pointer;font:700 14px/1 ui-sans-serif,system-ui,sans-serif;padding:0 2px;"
  };
  function ensureOverlay() {
    let overlay2 = document.getElementById("__opc_connection_overlay");
    const existed2 = !!overlay2;
    if (!overlay2) {
      overlay2 = h("div", { attrs: { id: "__opc_connection_overlay" } });
      document.documentElement.appendChild(overlay2);
    }
    return { overlay: overlay2, existed: existed2 };
  }
  function renderCollapsed(overlay2, labelText) {
    overlay2.innerHTML = "";
    overlay2.style.cssText = STYLE.collapsed;
    const dockable2 = makeDockable(overlay2, { blockDragSelector: "button", snapThreshold: 10 });
    dockable2.applyDockPosition(overlay2.dataset.dock);
    const label = h("span", {
      text: labelText,
      style: STYLE.label,
      attrs: { "data-role": "label" }
    });
    const annotate = h("button", {
      text: "Annotate",
      style: STYLE.annotate,
      attrs: { type: "button" },
      on: {
        click: (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            chrome.runtime.sendMessage({ type: "start_annotation_from_overlay" });
          } catch {}
        }
      }
    });
    overlay2.appendChild(h("div", { style: STYLE.row, attrs: { "data-role": "row" } }, [label, annotate]));
    const queueCount = Number(globalThis.__opc_lastQueueCount) || 0;
    if (queueCount > 0) {
      const queueButton = h("button", {
        text: `Queue (${queueCount})`,
        style: "margin-left:8px;border:1px solid rgba(0,0,0,0.12);border-radius:999px;padding:4px 8px;background:transparent;color:#111111;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;",
        attrs: { type: "button", "aria-label": "Queued annotations" },
        on: {
          click: (event) => {
            event.preventDefault();
            event.stopPropagation();
            try {
              chrome.runtime.sendMessage({ type: "show_annotation_queue" });
            } catch {}
          }
        }
      });
      const row = overlay2.querySelector("[data-role='row']");
      if (row)
        row.appendChild(queueButton);
      else
        overlay2.appendChild(queueButton);
    }
  }
  function sessionButton(onSelect, item) {
    const isLinked = Boolean(currentSessionId) && item.id === currentSessionId;
    return h("button", {
      style: STYLE.itemButton,
      attrs: { type: "button", "data-role": "session-item", "data-session-id": item.id },
      on: {
        click: () => {
          try {
            chrome.runtime.sendMessage({ type: "connect_tab_to_session", session: item });
          } catch {}
          onSelect();
        }
      }
    }, [
      h("div", { style: "display:flex;align-items:center;gap:6px;" }, [
        h("span", { text: item.title || item.id, style: STYLE.name }),
        isLinked ? h("span", {
          text: "Linked",
          style: "flex:none;padding:1px 6px;border-radius:999px;background:#bfdbfe;color:#111111;font:700 10px/1.4 ui-sans-serif,system-ui,sans-serif;"
        }) : null
      ]),
      h("div", {
        text: item.directory || item.id,
        style: STYLE.meta
      })
    ]);
  }
  function emptyStateContent() {
    if (context.reason === "no-sessions") {
      return {
        title: "No OpenCode session available",
        text: "The local plugin responded, but it did not report an active OpenCode session for this project.",
        steps: [
          "Open OpenCode in the project you want to edit",
          "Make sure the annotation plugin is enabled in that OpenCode config",
          "Restart OpenCode if you just changed the config"
        ]
      };
    }
    return {
      title: "OpenCode plugin not found",
      text: "The extension could not find a local OpenCode annotation server on ports 39240-39260.",
      steps: [
        "Install npm package: opencode-chrome-annotation",
        "Add it to your OpenCode config",
        "Restart OpenCode in your project"
      ]
    };
  }
  function renderEmptyState() {
    const content = emptyStateContent();
    return h("div", { style: STYLE.empty }, [
      h("div", { text: content.title, style: STYLE.emptyTitle }),
      h("p", {
        text: content.text,
        style: STYLE.emptyText
      }),
      h("ol", { style: STYLE.emptyList }, content.steps.map((step) => h("li", { text: step }))),
      h("button", {
        text: "Try again",
        style: STYLE.retry,
        attrs: { type: "button" },
        on: {
          click: () => {
            try {
              chrome.runtime.sendMessage({ type: "refresh_sessions" });
            } catch {}
          }
        }
      })
    ]);
  }
  function createCloseIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M2 2 L10 10 M10 2 L2 10");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
    return svg;
  }
  function createRefreshIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M10 6a4 4 0 1 1-1.17-2.83M10 1.5V3.5H8");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.4");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("fill", "none");
    svg.appendChild(path);
    return svg;
  }
  const { overlay, existed } = ensureOverlay();
  const dockable = makeDockable(overlay, { blockDragSelector: "button", snapThreshold: 10 });
  const priorLabel = overlay.querySelector("[data-role='label']")?.textContent || "Connected";
  overlay.style.cssText = STYLE.expanded;
  dockable.applyDockPosition(overlay.dataset.dock);
  overlay.innerHTML = "";
  const close = () => {
    cleanupKeyboard();
    if (!existed) {
      overlay.remove();
      return;
    }
    renderCollapsed(overlay, priorLabel);
  };
  overlay.appendChild(h("div", { style: STYLE.header }, [
    h("div", { text: "Connect this tab to OpenCode", style: STYLE.title }),
    h("div", { style: "display:flex;align-items:center;gap:2px;" }, [
      h("button", {
        style: STYLE.close,
        attrs: { type: "button", "aria-label": "Refresh chat list" },
        on: {
          click: (event) => {
            event.preventDefault();
            event.stopPropagation();
            try {
              chrome.runtime.sendMessage({ type: "refresh_sessions" });
            } catch {}
          }
        }
      }, [createRefreshIcon()]),
      h("button", {
        style: STYLE.close,
        attrs: { type: "button", "aria-label": "Close session picker" },
        on: { click: close }
      }, [createCloseIcon()])
    ])
  ]));
  let sessionButtons = [];
  let focusedIndex = -1;
  function setFocusedIndex(nextIndex, scroll = true) {
    if (!sessionButtons.length) {
      focusedIndex = -1;
      return;
    }
    const count = sessionButtons.length;
    focusedIndex = (nextIndex % count + count) % count;
    sessionButtons.forEach((button, index) => {
      button.style.cssText = STYLE.itemButton + (index === focusedIndex ? `;${STYLE.itemButtonFocused}` : "");
    });
    sessionButtons[focusedIndex].focus({ preventScroll: true });
    if (scroll)
      sessionButtons[focusedIndex].scrollIntoView({ block: "nearest" });
  }
  if (items.length) {
    const groups = [];
    const byDirectory = new Map();
    for (const item of items) {
      const dir = item.directory || "";
      let group = byDirectory.get(dir);
      if (!group) {
        group = { directory: dir, items: [] };
        byDirectory.set(dir, group);
        groups.push(group);
      }
      group.items.push(item);
    }
    function projectNameFor(directory) {
      const segments = directory.split("/").filter(Boolean);
      return segments.length ? segments[segments.length - 1] : directory || "Unknown project";
    }
    let activeProject = "";
    if (groups.length > 1) {
      const chipsRow = h("div", { style: STYLE.chipsRow });
      const chipDefs = [{ label: `All (${items.length})`, value: "" }].concat(groups.map((group) => ({
        label: `${projectNameFor(group.directory)} (${group.items.length})`,
        value: group.directory
      })));
      function syncChips() {
        for (const chipEl of chipsRow.querySelectorAll("[data-role='project-chip']")) {
          const isActive = (chipEl.getAttribute("data-value") || "") === activeProject;
          chipEl.style.cssText = STYLE.chip + (isActive ? `;${STYLE.chipActive}` : "");
          chipEl.setAttribute("aria-pressed", isActive ? "true" : "false");
        }
      }
      for (const def of chipDefs) {
        chipsRow.appendChild(h("button", {
          text: def.label,
          style: STYLE.chip,
          attrs: { type: "button", "data-role": "project-chip", "data-value": def.value },
          on: {
            click: (event) => {
              event.preventDefault();
              event.stopPropagation();
              activeProject = def.value;
              syncChips();
              renderList();
            }
          }
        }));
      }
      syncChips();
      overlay.appendChild(chipsRow);
    }
    const listContainer = h("div", { style: STYLE.list, attrs: { "data-role": "session-list" } });
    overlay.appendChild(listContainer);
    function appendSessionButtons() {
      const visibleGroups = activeProject ? groups.filter((group) => group.directory === activeProject) : groups;
      for (const group of visibleGroups) {
        if (!activeProject && visibleGroups.length > 1) {
          listContainer.appendChild(h("div", { style: STYLE.groupHeader }, [
            h("span", { text: projectNameFor(group.directory), style: STYLE.groupName }),
            h("span", { text: group.directory, style: STYLE.groupPath })
          ]));
        }
        for (const item of group.items) {
          listContainer.appendChild(sessionButton(close, item));
        }
      }
    }
    function renderList() {
      listContainer.innerHTML = "";
      appendSessionButtons();
      sessionButtons = Array.from(listContainer.querySelectorAll("[data-role='session-item']"));
      const linkedIndex = currentSessionId ? sessionButtons.findIndex((button) => button.dataset.sessionId === currentSessionId) : -1;
      listContainer.scrollTop = 0;
      setFocusedIndex(linkedIndex >= 0 ? linkedIndex : 0, false);
    }
    renderList();
  } else {
    overlay.appendChild(renderEmptyState());
  }
  function onKeyDown(event) {
    if (!overlay.isConnected)
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!sessionButtons.length)
      return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedIndex(focusedIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedIndex(focusedIndex - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (focusedIndex >= 0)
        sessionButtons[focusedIndex].click();
    }
  }
  function cleanupKeyboard() {
    document.removeEventListener("keydown", onKeyDown, true);
    if (globalThis.__opc_cleanupSessionPicker === cleanupKeyboard) {
      delete globalThis.__opc_cleanupSessionPicker;
    }
  }
  document.addEventListener("keydown", onKeyDown, true);
  globalThis.__opc_cleanupSessionPicker = cleanupKeyboard;
  if (focusedIndex >= 0)
    setFocusedIndex(focusedIndex, false);
}
async function showSessionPicker(tabId, sessions, context = { instanceCount: sessions.length ? 1 : 0 }, currentSessionId = null) {
  if (SIDE_PANEL_SUPPORTED)
    return;
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    files: ["injected/dom.js"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    args: [sessions.slice(0, 24), context, currentSessionId],
    func: sessionPickerScript
  });
}

// extension-src/annotation-picker.ts
function annotationPickerScript() {
  const h = globalThis.__opc_h;
  if (typeof h !== "function") {
    throw new Error("OpenCode UI helper is unavailable");
  }
  const STYLE = {
    root: "position:fixed;inset:0;z-index:2147483647;pointer-events:none;",
    box: "position:fixed;border:2px solid rgba(165,180,252,0.95);background:rgba(165,180,252,0.18);box-shadow:0 0 0 1px rgba(0,0,0,0.12);pointer-events:none;",
    panel: "position:fixed;right:16px;bottom:16px;width:320px;padding:12px;background:rgba(255,255,255,0.97);color:#111111;border:1px solid rgba(0,0,0,0.12);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.35);font:12px/1.4 ui-sans-serif,system-ui,sans-serif;pointer-events:auto;display:none;backdrop-filter:blur(8px);",
    title: "font-weight:600;margin-bottom:8px;",
    targetInfo: "margin-bottom:8px;color:#6b7280;word-break:break-word;",
    textarea: "width:100%;min-height:96px;resize:vertical;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:#ffffff;color:#111111;padding:10px;box-sizing:border-box;",
    actions: "display:flex;gap:8px;justify-content:flex-end;margin-top:10px;",
    cancel: "padding:8px 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:transparent;color:#111111;cursor:pointer;",
    submit: "padding:8px 12px;border-radius:999px;border:0;background:#111111;color:#ffffff;font-weight:600;cursor:pointer;",
    finish: "padding:8px 12px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:#e9e4ff;color:#111111;font-weight:600;cursor:pointer;"
  };
  const ROLE_BY_TAG = {
    A: "link",
    BUTTON: "button",
    INPUT: "textbox",
    SELECT: "combobox",
    TEXTAREA: "textbox"
  };
  function removeExistingRoot() {
    document.getElementById("__opc_annotation_root")?.remove();
  }
  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function")
      return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  function inferRole(el) {
    return el.getAttribute("role") || ROLE_BY_TAG[el.tagName] || "";
  }
  function buildSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE)
      return "";
    if (el.id)
      return `#${cssEscape(el.id)}`;
    const parts = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      if (current.classList && current.classList.length) {
        part += "." + Array.from(current.classList).slice(0, 2).map(cssEscape).join(".");
      }
      const parent = current.parentElement;
      if (parent) {
        const currentTag = current.tagName;
        const siblings = Array.from(parent.children).filter((child) => child.tagName === currentTag);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      parts.unshift(part);
      if (current.parentElement?.id) {
        parts.unshift(`#${cssEscape(current.parentElement.id)}`);
        break;
      }
      current = current.parentElement;
    }
    return parts.join(" > ");
  }
  function describeElement(el) {
    const rect = el.getBoundingClientRect();
    return {
      selector: buildSelector(el),
      tag: el.tagName.toLowerCase(),
      role: inferRole(el),
      text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 500),
      ariaLabel: el.getAttribute("aria-label"),
      id: el.id || null,
      className: typeof el.className === "string" ? el.className : "",
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }
  function describeViewport() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }
  function createUI() {
    const root = h("div", { style: STYLE.root, attrs: { id: "__opc_annotation_root" } });
    root.id = "__opc_annotation_root";
    const box = h("div", { style: STYLE.box });
    const targetInfo = h("div", { style: STYLE.targetInfo });
    const textarea = h("textarea", { style: STYLE.textarea });
    textarea.placeholder = "What should OpenCode change here?";
    const cancelButton = h("button", {
      text: "Cancel",
      style: STYLE.cancel,
      attrs: { type: "button" }
    });
    const queueButton = h("button", {
      text: "Add to queue",
      style: STYLE.submit,
      attrs: { type: "button" }
    });
    const finishButton = h("button", {
      text: "Add & finish",
      style: STYLE.finish,
      attrs: { type: "button" }
    });
    const panel = h("div", { style: STYLE.panel }, [
      h("div", { text: "Annotate selection", style: STYLE.title }),
      targetInfo,
      textarea,
      h("div", { style: STYLE.actions }, [cancelButton, queueButton, finishButton])
    ]);
    root.appendChild(box);
    root.appendChild(panel);
    document.documentElement.appendChild(root);
    return { root, box, panel, targetInfo, textarea, cancelButton, queueButton, finishButton };
  }
  function updateHighlight(box, el) {
    if (!el) {
      box.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }
  return new Promise((resolve) => {
    removeExistingRoot();
    const ui = createUI();
    const state = {
      selected: null,
      locked: false,
      finished: false
    };
    function removeListeners() {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    }
    function finish(resultPayload) {
      if (state.finished)
        return;
      state.finished = true;
      removeListeners();
      ui.root.remove();
      resolve(resultPayload);
    }
    function finishWithQueuedAnimation(resultPayload) {
      if (state.finished)
        return;
      state.finished = true;
      removeListeners();
      ui.queueButton.disabled = true;
      ui.finishButton.disabled = true;
      ui.cancelButton.disabled = true;
      ui.textarea.disabled = true;
      ui.queueButton.textContent = "Queued";
      ui.panel.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease";
      ui.box.style.transition = "opacity 160ms ease";
      requestAnimationFrame(() => {
        ui.panel.style.transform = "translateX(calc(100% + 40px))";
        ui.panel.style.opacity = "0";
        ui.box.style.opacity = "0";
      });
      setTimeout(() => {
        ui.root.remove();
        resolve(resultPayload);
      }, 240);
    }
    function submitAnnotation(finishMode) {
      if (!state.selected) {
        finish({ cancelled: true });
        return;
      }
      finishWithQueuedAnimation({
        cancelled: false,
        finish: finishMode === true,
        comment: ui.textarea.value.trim(),
        element: describeElement(state.selected),
        viewport: describeViewport()
      });
    }
    function onMouseMove(event) {
      if (state.locked)
        return;
      const el = document.elementFromPoint(event.clientX, event.clientY);
      if (!el || ui.root.contains(el))
        return;
      state.selected = el;
      updateHighlight(ui.box, el);
    }
    function onClick(event) {
      if (event.target instanceof Node && ui.panel.contains(event.target))
        return;
      if (state.locked)
        return;
      const el = document.elementFromPoint(event.clientX, event.clientY);
      if (!el || ui.root.contains(el))
        return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      state.locked = true;
      state.selected = el;
      updateHighlight(ui.box, el);
      ui.targetInfo.textContent = `${el.tagName.toLowerCase()} ${buildSelector(el)}`.trim();
      ui.panel.style.display = "block";
      ui.textarea.focus();
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish({ cancelled: true });
        return;
      }
      if (state.locked && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        submitAnnotation(false);
      }
    }
    ui.cancelButton.addEventListener("click", () => finish({ cancelled: true }));
    ui.queueButton.addEventListener("click", () => submitAnnotation(false));
    ui.finishButton.addEventListener("click", () => submitAnnotation(true));
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  });
}
async function runAnnotationPicker(tabId) {
  logExtension("Starting annotation picker", { tabId });
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    files: ["injected/dom.js"]
  });
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: annotationPickerScript
  });
  const picked = result[0]?.result || null;
  if (!picked) {
    warnExtension("Annotation picker returned no result", { tabId });
    return null;
  }
  if (picked.cancelled === true) {
    logExtension("Annotation picker cancelled", { tabId });
  } else {
    logExtension("Annotation picker selected element", {
      tabId,
      selector: picked.element?.selector,
      tag: picked.element?.tag,
      commentLength: typeof picked.comment === "string" ? picked.comment.length : 0
    });
  }
  return picked;
}

// extension-src/side-panel-selection.ts
async function sendSelectionCommand(tabId, command) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: command });
    return true;
  } catch {
    return false;
  }
}
async function exitSelectionSession(tabId) {
  await sendSelectionCommand(tabId, "opc_selection_exit");
  selectionSessions.delete(tabId);
}
async function startSelectionSession(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.id)
    throw new Error("No active tab found");
  const claim = claimedTabs.get(tabId);
  if (!claim?.baseUrl || !claim?.sessionId)
    throw new Error("Tab is not connected to an OpenCode instance");
  try {
    await postJson(claim.baseUrl, "/claim", claimRequestBody(tabId, claim.sessionId));
  } catch (error) {
    warnExtension("Failed to refresh upstream tab claim before annotating", {
      tabId,
      sessionId: claim.sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  if (selectionSessions.has(tabId)) {
    const reentered = await sendSelectionCommand(tabId, "opc_selection_reenter");
    if (reentered) {
      selectionSessions.set(tabId, { phase: "hover", element: null, viewport: null });
      return;
    }
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["injected/selection.js"]
  });
  selectionSessions.set(tabId, { phase: "hover", element: null, viewport: null });
}
async function submitPanelAnnotation(tabId, message) {
  const session = selectionSessions.get(tabId);
  if (!session || session.phase !== "locked" || !session.element)
    throw new Error("No element is selected");
  const claim = claimedTabs.get(tabId);
  if (!claim?.baseUrl || !claim?.sessionId)
    throw new Error("Tab is not connected to an OpenCode instance");
  const element = session.element;
  const viewport = session.viewport;
  const comment = typeof message.comment === "string" ? message.comment.trim() : "";
  await exitSelectionSession(tabId);
  await new Promise((resolve) => setTimeout(resolve, 60));
  const tab = await chrome.tabs.get(tabId);
  const screenshot = await captureVisibleTabWithTimeout(tab.windowId);
  const cropped = await cropScreenshot(tabId, screenshot, element.rect, viewport);
  const dataUrl = cropped || screenshot;
  logExtension("Captured annotation screenshot from side panel", {
    tabId,
    cropped: !!cropped,
    bytesApprox: Math.round(dataUrl.length * 3 / 4)
  });
  try {
    await annotationQueues.add(tabId, {
      comment,
      page: {
        url: tab.url || "",
        title: tab.title || ""
      },
      element,
      viewport,
      screenshot: {
        mime: "image/png",
        dataUrl
      },
      createdAt: Date.now()
    });
  } catch (error) {
    warnExtension("Failed to persist annotation queue", {
      tabId,
      error: error instanceof Error ? error.message : String(error)
    });
    await showAnnotationError(tabId, "Annotation queue is full - send or remove queued annotations").catch(() => {});
    throw new Error("Annotation queue is full - send or remove queued annotations");
  }
  logExtension("Annotation queued from side panel", {
    tabId,
    selector: element?.selector,
    commentLength: comment.length
  });
  if (message.finish !== true)
    await startSelectionSession(tabId);
}

// extension-src/connection-monitor.ts
function createConnectionMonitor({ claimedTabs, removeConnectionOverlay: removeConnectionOverlay2, extensionVersion }) {
  let timer = null;
  function heartbeatClaim(tabId, claim) {
    if (!claim?.baseUrl || !claim?.sessionId)
      return null;
    return postJson(claim.baseUrl, "/claim", {
      tabId,
      sessionId: claim.sessionId,
      extensionVersion
    });
  }
  function stop() {
    if (timer === null)
      return;
    clearInterval(timer);
    timer = null;
  }
  function ensure() {
    if (timer !== null)
      return;
    timer = setInterval(() => {
      check().catch(() => {});
    }, CONNECTION_CHECK_INTERVAL_MS);
  }
  async function check() {
    if (!claimedTabs.size()) {
      stop();
      return;
    }
    const baseUrls = new Set;
    for (const claim of claimedTabs.values()) {
      if (claim?.baseUrl)
        baseUrls.add(claim.baseUrl);
    }
    const settled = await Promise.allSettled(Array.from(baseUrls).map(async (baseUrl) => ({
      baseUrl,
      ok: await checkServerStatus(baseUrl, CONNECTION_STATUS_TIMEOUT_MS)
    })));
    const disconnected = new Set;
    for (const result of settled) {
      if (result.status !== "fulfilled")
        continue;
      if (!result.value.ok)
        disconnected.add(result.value.baseUrl);
    }
    await Promise.allSettled(Array.from(claimedTabs.entries()).map(([tabId, claim]) => {
      if (disconnected.has(claim?.baseUrl))
        return null;
      return heartbeatClaim(tabId, claim);
    }));
    if (!disconnected.size)
      return;
    for (const [tabId, claim] of claimedTabs.entries()) {
      if (!disconnected.has(claim?.baseUrl))
        continue;
      claimedTabs.delete(tabId);
      await removeConnectionOverlay2(tabId);
    }
    broadcastPanelChanged();
    warnExtension("Lost connection to OpenCode instance", {
      disconnectedInstances: Array.from(disconnected),
      remainingClaims: claimedTabs.size()
    });
    if (!claimedTabs.size())
      stop();
  }
  return { ensure, stop, check };
}

// extension-src/claims-store.ts
function createClaimsStore() {
  const claims = new Map;
  const storageKey = "opencodeChromeAnnotationClaims";
  function storage() {
    return chrome.storage?.session || chrome.storage?.local;
  }
  async function save() {
    const area = storage();
    if (!area)
      return;
    await area.set({
      [storageKey]: Array.from(claims.entries())
    });
  }
  return {
    async restore() {
      const area = storage();
      if (!area)
        return;
      const result = await area.get(storageKey);
      const entries = Array.isArray(result?.[storageKey]) ? result[storageKey] : [];
      claims.clear();
      for (const [tabId, claim] of entries) {
        if (Number.isFinite(Number(tabId)) && claim?.sessionId && claim?.baseUrl) {
          claims.set(Number(tabId), claim);
        }
      }
    },
    get(tabId) {
      if (tabId === undefined)
        return;
      return claims.get(tabId);
    },
    set(tabId, claim) {
      claims.set(tabId, claim);
      save().catch(() => {});
    },
    delete(tabId) {
      if (tabId === undefined)
        return false;
      const deleted = claims.delete(tabId);
      if (deleted)
        save().catch(() => {});
      return deleted;
    },
    entries() {
      return claims.entries();
    },
    values() {
      return claims.values();
    },
    size() {
      return claims.size;
    }
  };
}

// extension-src/annotation-queue-store.ts
var MAX_SEND_HISTORY_PER_TAB = 20;
function nextSendAttemptId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `attempt-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}
function createAnnotationQueueStore() {
  const queues = new Map;
  const sendHistory = new Map;
  const inFlightSends = new Map;
  const storageKey = "opencodeChromeAnnotationQueues";
  const historyStorageKey = "opencodeChromeAnnotationSendHistory";
  const inFlightStorageKey = "opencodeChromeAnnotationInFlightSends";
  function storage() {
    return chrome.storage?.session || chrome.storage?.local;
  }
  async function save() {
    const area = storage();
    if (!area)
      return;
    await area.set({
      [storageKey]: Array.from(queues.entries()),
      [historyStorageKey]: Array.from(sendHistory.entries()),
      [inFlightStorageKey]: Array.from(inFlightSends.entries())
    });
  }
  function normalizeEntry(entry) {
    if (!entry || typeof entry !== "object")
      return null;
    const comment = typeof entry.comment === "string" ? entry.comment : "";
    if (!comment && !entry.element)
      return null;
    return {
      id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
      comment,
      element: entry.element || null,
      viewport: entry.viewport || null,
      page: entry.page || null,
      screenshot: entry.screenshot && typeof entry.screenshot.dataUrl === "string" ? {
        mime: typeof entry.screenshot.mime === "string" ? entry.screenshot.mime : "image/png",
        dataUrl: entry.screenshot.dataUrl
      } : null,
      createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now()
    };
  }
  function normalizeHistoryRecord(record) {
    if (!record || typeof record !== "object")
      return null;
    const status = record.status === "sent" || record.status === "partial" || record.status === "failed" ? record.status : "failed";
    const entryIds = Array.isArray(record.entryIds) ? record.entryIds.filter((id) => typeof id === "string" && id) : [];
    return {
      attemptId: typeof record.attemptId === "string" && record.attemptId ? record.attemptId : nextSendAttemptId(),
      timestamp: Number.isFinite(record.timestamp) ? record.timestamp : Date.now(),
      status,
      sentCount: Number.isFinite(record.sentCount) && record.sentCount >= 0 ? Math.floor(record.sentCount) : 0,
      totalCount: Number.isFinite(record.totalCount) && record.totalCount >= 0 ? Math.floor(record.totalCount) : entryIds.length,
      error: typeof record.error === "string" ? record.error : "",
      entryIds
    };
  }
  function normalizeInFlight(snapshot) {
    if (!snapshot || typeof snapshot !== "object")
      return null;
    const entryIds = Array.isArray(snapshot.entryIds) ? snapshot.entryIds.filter((id) => typeof id === "string" && id) : [];
    if (!entryIds.length)
      return null;
    return {
      attemptId: typeof snapshot.attemptId === "string" && snapshot.attemptId ? snapshot.attemptId : nextSendAttemptId(),
      timestamp: Number.isFinite(snapshot.timestamp) ? snapshot.timestamp : Date.now(),
      entryIds,
      totalCount: Number.isFinite(snapshot.totalCount) && snapshot.totalCount >= 0 ? Math.floor(snapshot.totalCount) : entryIds.length
    };
  }
  function pushHistoryRecord(tabId, record) {
    const normalized = normalizeHistoryRecord(record);
    if (!normalized)
      return null;
    const list = sendHistory.get(tabId) || [];
    list.unshift(normalized);
    sendHistory.set(tabId, list.slice(0, MAX_SEND_HISTORY_PER_TAB));
    return normalized;
  }
  return {
    async restore() {
      const area = storage();
      if (!area)
        return;
      const result = await area.get([storageKey, historyStorageKey, inFlightStorageKey]);
      const entries = Array.isArray(result?.[storageKey]) ? result[storageKey] : [];
      queues.clear();
      for (const [tabId, list] of entries) {
        if (!Number.isFinite(Number(tabId)) || !Array.isArray(list))
          continue;
        const normalized = list.map(normalizeEntry).filter(Boolean);
        if (normalized.length)
          queues.set(Number(tabId), normalized);
      }
      const historyEntries = Array.isArray(result?.[historyStorageKey]) ? result[historyStorageKey] : [];
      sendHistory.clear();
      for (const [tabId, list] of historyEntries) {
        if (!Number.isFinite(Number(tabId)) || !Array.isArray(list))
          continue;
        const normalized = list.map(normalizeHistoryRecord).filter(Boolean).slice(0, MAX_SEND_HISTORY_PER_TAB);
        if (normalized.length)
          sendHistory.set(Number(tabId), normalized);
      }
      const inFlightEntries = Array.isArray(result?.[inFlightStorageKey]) ? result[inFlightStorageKey] : [];
      inFlightSends.clear();
      let recovered = false;
      for (const [tabId, snapshot] of inFlightEntries) {
        if (!Number.isFinite(Number(tabId)))
          continue;
        const normalized = normalizeInFlight(snapshot);
        if (!normalized)
          continue;
        // A persisted in-flight snapshot with no matching completion means the
        // worker restarted (or crashed) mid-send. The queue itself was never
        // destructively cleared, so whatever is still queued is intact: recover
        // by recording the interruption as a failed/partial attempt instead of
        // silently losing the batch.
        const numericTabId = Number(tabId);
        const queuedIds = new Set((queues.get(numericTabId) || []).map((entry) => entry.id));
        const stillQueued = normalized.entryIds.filter((id) => queuedIds.has(id)).length;
        const delivered = Math.max(0, normalized.totalCount - stillQueued);
        pushHistoryRecord(numericTabId, {
          attemptId: normalized.attemptId,
          timestamp: normalized.timestamp,
          status: stillQueued === 0 ? "sent" : delivered > 0 ? "partial" : "failed",
          sentCount: stillQueued === 0 ? normalized.totalCount : delivered,
          totalCount: normalized.totalCount,
          error: stillQueued === 0 ? "" : `Send interrupted (worker restarted mid-send) — ${stillQueued} of ${normalized.totalCount} preserved in queue for retry`,
          entryIds: normalized.entryIds
        });
        recovered = true;
      }
      if (recovered)
        await save();
    },
    list(tabId) {
      if (tabId === undefined)
        return [];
      const list = queues.get(tabId);
      return list ? list.slice() : [];
    },
    async add(tabId, entry) {
      const normalized = normalizeEntry(entry);
      if (!normalized)
        return null;
      const list = queues.get(tabId) || [];
      list.push(normalized);
      queues.set(tabId, list);
      await save();
      return normalized.id;
    },
    async remove(tabId, id) {
      const list = queues.get(tabId);
      if (!list)
        return false;
      const next = list.filter((entry) => entry.id !== id);
      if (next.length === list.length)
        return false;
      if (next.length)
        queues.set(tabId, next);
      else
        queues.delete(tabId);
      await save();
      return true;
    },
    async clear(tabId) {
      if (!queues.delete(tabId))
        return false;
      await save();
      return true;
    },
    async take(tabId) {
      const list = queues.get(tabId) || [];
      queues.delete(tabId);
      await save();
      return list;
    },
    listHistory(tabId) {
      if (tabId === undefined)
        return [];
      const list = sendHistory.get(tabId);
      return list ? list.slice() : [];
    },
    async recordAttempt(tabId, record) {
      if (tabId === undefined)
        return null;
      const stored = pushHistoryRecord(tabId, record);
      await save();
      return stored;
    },
    getInFlight(tabId) {
      if (tabId === undefined)
        return null;
      return inFlightSends.get(tabId) || null;
    },
    async setInFlight(tabId, snapshot) {
      if (tabId === undefined)
        return null;
      const normalized = normalizeInFlight(snapshot);
      if (!normalized)
        return null;
      inFlightSends.set(tabId, normalized);
      await save();
      return normalized;
    },
    async clearInFlight(tabId) {
      if (tabId === undefined || !inFlightSends.has(tabId))
        return false;
      inFlightSends.delete(tabId);
      await save();
      return true;
    },
    delete(tabId) {
      queues.delete(tabId);
      save().catch(() => {});
    }
  };
}

// extension-src/background.ts
var claimedTabs = createClaimsStore();
var annotationQueues = createAnnotationQueueStore();
var extensionVersion = chrome.runtime.getManifest().version;
var monitor = createConnectionMonitor({
  claimedTabs,
  removeConnectionOverlay,
  extensionVersion
});
var MESSAGE_TYPE = {
  START_ANNOTATION: "start_annotation_from_overlay",
  CONNECT_TAB: "connect_tab_to_session",
  DISCONNECT_TAB: "disconnect_tab",
  REFRESH_SESSIONS: "refresh_sessions",
  SHOW_QUEUE: "show_annotation_queue",
  REMOVE_QUEUED: "remove_queued_annotation",
  CLEAR_QUEUE: "clear_queue",
  SEND_QUEUE: "send_queued_annotations",
  CLOSE_SESSION: "close_session",
  PANEL_GET_STATE: "panel_get_state",
  PANEL_START: "panel_start_annotation",
  PANEL_CANCEL: "panel_cancel_selection",
  PANEL_SUBMIT: "panel_submit_annotation",
  PANEL_RESELECT: "panel_reselect_element",
  SELECTION_PICK: "selection_pick",
  SELECTION_CANCEL: "selection_cancel",
  SELECTION_EXITED: "selection_exited",
  GET_QUEUE_COPY: "get_queue_for_copy"
};
function isSupportedMessage(message) {
  const type = typeof message === "object" && message !== null ? message.type : undefined;
  return typeof type === "string" && Object.values(MESSAGE_TYPE).includes(type);
}
function toOriginPattern(url) {
  if (typeof url !== "string" || !url)
    return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol))
      return null;
    return `${parsed.origin}/*`;
  } catch {
    return null;
  }
}
function sessionLabel(session) {
  return session?.title || session?.id;
}
function claimRequestBody(tabId, sessionId) {
  return { tabId, sessionId, extensionVersion };
}
async function ensureSiteAccess(tab) {
  if (!chrome.permissions?.request)
    return;
  const origin = toOriginPattern(tab?.url);
  if (!origin) {
    throw new Error("This page cannot be annotated. Open an http(s) page and try again.");
  }
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error("Site access was denied for this page.");
  }
}
async function sendQueuedAnnotations(tab) {
  // Loss-proof send: work from a non-destructive snapshot and remove entries
  // one-by-one only after each POST succeeds. Any throw — or a worker restart
  // between snapshot and completion — leaves unsent entries in the store, and
  // the persisted in-flight snapshot lets restore() recover the attempt.
  const entries = annotationQueues.list(tab.id);
  if (!entries.length)
    return { ok: true, sent: 0 };
  const claim = claimedTabs.get(tab.id);
  if (!claim?.baseUrl || !claim?.sessionId) {
    await annotationQueues.recordAttempt(tab.id, {
      attemptId: nextSendAttemptId(),
      timestamp: Date.now(),
      status: "failed",
      sentCount: 0,
      totalCount: entries.length,
      error: "Tab is not connected to an OpenCode instance",
      entryIds: entries.map((entry) => entry.id)
    });
    throw new Error("Tab is not connected to an OpenCode instance");
  }
  const attemptId = nextSendAttemptId();
  const timestamp = Date.now();
  await annotationQueues.setInFlight(tab.id, {
    attemptId,
    timestamp,
    entryIds: entries.map((entry) => entry.id),
    totalCount: entries.length
  });
  let sent = 0;
  try {
    try {
      await postJson(claim.baseUrl, "/claim", claimRequestBody(tab.id, claim.sessionId));
    } catch {}
    let failure = null;
    for (const entry of entries) {
      try {
        await postJson(claim.baseUrl, "/annotation", {
          ...claimRequestBody(tab.id, claim.sessionId),
          annotation: {
            comment: entry.comment,
            page: entry.page,
            element: entry.element,
            viewport: entry.viewport,
            screenshot: entry.screenshot
          }
        });
        await annotationQueues.remove(tab.id, entry.id);
        sent += 1;
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        break;
      }
    }
    await annotationQueues.clearInFlight(tab.id);
    if (failure) {
      const record = {
        attemptId,
        timestamp,
        status: sent > 0 ? "partial" : "failed",
        sentCount: sent,
        totalCount: entries.length,
        error: failure.message,
        entryIds: entries.map((entry) => entry.id)
      };
      await annotationQueues.recordAttempt(tab.id, record);
      warnExtension("Failed to send queued annotations", {
        tabId: tab.id,
        sent,
        total: entries.length,
        error: failure.message
      });
      await showAnnotationError(tab.id, `Failed to send queued annotations (${sent} of ${entries.length} delivered): ${failure.message}`).catch(() => {});
      await injectConnectionOverlay(tab.id, true).catch(() => {});
      const unsent = annotationQueues.list(tab.id).map(toQueueSummary);
      return { ok: false, sent, failed: entries.length - sent, error: failure.message, unsent, history: record };
    }
    const record = {
      attemptId,
      timestamp,
      status: "sent",
      sentCount: sent,
      totalCount: entries.length,
      error: "",
      entryIds: entries.map((entry) => entry.id)
    };
    await annotationQueues.recordAttempt(tab.id, record);
    logExtension("Queued annotations delivered to OpenCode instance", {
      tabId: tab.id,
      baseUrl: claim.baseUrl,
      sent
    });
    await showSendToast(tab.id, `Sent ${sent} annotations to OpenCode`).catch(() => {});
    await injectConnectionOverlay(tab.id).catch(() => {});
    return { ok: true, sent, failed: 0, history: record };
  } catch (error) {
    // Unexpected throw mid-batch: confirmed-sent entries were already removed
    // one-by-one above, so everything still queued is intact by construction.
    // Record the attempt so the failure is visible instead of silent.
    const text = error instanceof Error ? error.message : String(error);
    try {
      await annotationQueues.clearInFlight(tab.id);
    } catch {}
    try {
      await annotationQueues.recordAttempt(tab.id, {
        attemptId,
        timestamp,
        status: sent > 0 ? "partial" : "failed",
        sentCount: sent,
        totalCount: entries.length,
        error: text,
        entryIds: entries.map((entry) => entry.id)
      });
    } catch {}
    throw error;
  }
}
async function runMessageAction(message, tab, sender) {
  if (message.type === "panel_get_state") {
    const tabId = tab?.id;
    return {
      ok: true,
      tab: tabId !== undefined ? { id: tabId, url: tab.url, title: tab.title } : null,
      claim: tabId !== undefined ? claimedTabs.get(tabId) || null : null,
      queue: tabId !== undefined ? annotationQueues.list(tabId).map(toQueueSummary) : [],
      history: tabId !== undefined ? annotationQueues.listHistory(tabId) : [],
      inFlight: tabId !== undefined ? annotationQueues.getInFlight(tabId) : null,
      selection: tabId !== undefined ? selectionSessions.get(tabId) || null : null
    };
  }
  if (message.type === "connect_tab_to_session") {
    logExtension("Session picker selection received", {
      tabId: tab?.id,
      sessionId: message.session?.id,
      sessionLabel: sessionLabel(message.session)
    });
    await claimTabForSession(tab, message.session);
    return { ok: true };
  }
  if (message.type === "disconnect_tab") {
    const disconnected = await disconnectTab(tab);
    return { ok: true, disconnected };
  }
  if (message.type === "refresh_sessions") {
    const { sessions, context } = await requestSessionState();
    if (SIDE_PANEL_SUPPORTED)
      return { ok: true, sessions, context };
    if (!tab.id)
      throw new Error("No active tab found");
    await showSessionPicker(tab.id, sessions, context, claimedTabs.get(tab.id)?.sessionId);
    return { ok: true, sessions: sessions.length };
  }
  if (message.type === "panel_start_annotation") {
    if (!tab.id)
      throw new Error("No active tab found");
    await startSelectionSession(tab.id);
    return { ok: true };
  }
  if (message.type === "panel_cancel_selection") {
    if (!tab.id)
      throw new Error("No active tab found");
    await exitSelectionSession(tab.id);
    return { ok: true };
  }
  if (message.type === "panel_reselect_element") {
    if (!tab.id)
      throw new Error("No active tab found");
    const reentered = await sendSelectionCommand(tab.id, "opc_selection_reenter");
    if (reentered) {
      const session = selectionSessions.get(tab.id);
      if (session) {
        session.phase = "hover";
        session.element = null;
        session.viewport = null;
      }
    } else {
      selectionSessions.delete(tab.id);
      await startSelectionSession(tab.id);
    }
    return { ok: true };
  }
  if (message.type === "panel_submit_annotation") {
    if (!tab.id)
      throw new Error("No active tab found");
    await submitPanelAnnotation(tab.id, message);
    return { ok: true };
  }
  if (message.type === "selection_pick") {
    const selectionTabId = sender?.tab?.id;
    const session = selectionTabId !== undefined ? selectionSessions.get(selectionTabId) : null;
    if (session) {
      session.phase = "locked";
      session.element = message.element || null;
      session.viewport = message.viewport || null;
    }
    return { ok: true };
  }
  if (message.type === "selection_cancel" || message.type === "selection_exited") {
    const selectionTabId = sender?.tab?.id;
    if (selectionTabId !== undefined)
      selectionSessions.delete(selectionTabId);
    return { ok: true };
  }
  if (message.type === "close_session") {
    const sessionId = typeof message.sessionId === "string" ? message.sessionId : "";
    const baseUrl = typeof message.baseUrl === "string" ? message.baseUrl : "";
    if (!sessionId || !baseUrl)
      throw new Error("sessionId and baseUrl are required");
    try {
      await postJson(baseUrl, "/session/close", { sessionId });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes("404"))
        throw new Error("This OpenCode plugin version cannot close sessions. Update the opencode-chrome-annotation plugin and restart OpenCode.");
      throw error;
    }
    logExtension("Closed OpenCode session", { sessionId, baseUrl });
    for (const [claimedTabId, claim] of Array.from(claimedTabs.entries())) {
      if (claim?.sessionId !== sessionId)
        continue;
      await disconnectTab({ id: claimedTabId }).catch(() => {});
    }
    return { ok: true };
  }
  if (message.type === "show_annotation_queue") {
    if (!tab.id)
      throw new Error("No active tab found");
    await injectConnectionOverlay(tab.id, true);
    return { ok: true, queued: annotationQueues.list(tab.id).length };
  }
  if (message.type === "remove_queued_annotation") {
    if (!tab.id)
      throw new Error("No active tab found");
    await annotationQueues.remove(tab.id, message.id);
    await injectConnectionOverlay(tab.id, true);
    return { ok: true };
  }
  if (message.type === "clear_queue") {
    if (!tab.id)
      throw new Error("No active tab found");
    const hadEntries = annotationQueues.list(tab.id).length > 0;
    await annotationQueues.clear(tab.id);
    await injectConnectionOverlay(tab.id, hadEntries);
    return { ok: true };
  }
  if (message.type === "send_queued_annotations") {
    if (!tab.id)
      throw new Error("No active tab found");
    return await sendQueuedAnnotations(tab);
  }
  if (message.type === "get_queue_for_copy") {
    if (!tab.id)
      throw new Error("No active tab found");
    const annotations = annotationQueues.list(tab.id).map(toQueueSummary);
    const screenshotsRetained = annotations.filter((entry) => entry.hasScreenshot).length;
    return { ok: true, annotations, screenshotsRetained };
  }
  const result = await startAnnotationMode(tab);
  if (tab.id && result?.queued > 0)
    await injectConnectionOverlay(tab.id, true);
  return { ok: true, cancelled: !!result?.cancelled, queued: result?.queued || 0 };
}
async function handleMessage(message, sender) {
  let tab = null;
  if (Number.isFinite(message?.tabId)) {
    try {
      tab = await chrome.tabs.get(message.tabId);
    } catch {
      tab = null;
    }
  }
  if (!tab && sender.tab?.id)
    tab = sender.tab;
  if (!tab)
    tab = await getActiveTab();
  try {
    return await runMessageAction(message, tab, sender);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (message.type === "connect_tab_to_session") {
      warnExtension("Failed to connect tab to OpenCode session", {
        tabId: tab?.id,
        sessionId: message.session?.id,
        error: text
      });
    }
    if (tab?.id)
      await showAnnotationError(tab.id, text).catch(() => {});
    return { ok: false, error: text };
  }
}
async function claimTabForSession(tab, session) {
  if (!tab.id)
    throw new Error("No active tab found");
  logExtension("Connecting tab to OpenCode session", {
    tabId: tab?.id,
    sessionId: session?.id,
    sessionLabel: sessionLabel(session),
    baseUrl: session?.baseUrl
  });
  await postJson(session.baseUrl, "/claim", claimRequestBody(tab.id, session.id));
  claimedTabs.set(tab.id, {
    sessionId: session.id,
    sessionLabel: sessionLabel(session),
    baseUrl: session.baseUrl,
    origin: toOriginPattern(tab.url),
    extensionVersion
  });
  await injectConnectionOverlay(tab.id);
  broadcastPanelChanged();
  monitor.ensure();
  logExtension("Connected tab to OpenCode session", {
    tabId: tab?.id,
    sessionId: session?.id,
    sessionLabel: sessionLabel(session),
    baseUrl: session?.baseUrl
  });
}
async function disconnectTab(tab) {
  if (!tab.id)
    return false;
  const claim = claimedTabs.get(tab?.id);
  if (!claim)
    return false;
  if (claim?.baseUrl && claim?.sessionId) {
    try {
      await postJson(claim.baseUrl, "/unclaim", claimRequestBody(tab.id, claim.sessionId));
    } catch (error) {
      warnExtension("Failed to clear upstream tab claim", {
        tabId: tab?.id,
        sessionId: claim?.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  claimedTabs.delete(tab.id);
  // Preserve the annotation queue + send history across disconnects: a
  // disconnect during a failing period must not discard unsent work. Entries
  // stay queued (with screenshots) for retry or copy once the tab reconnects.
  await removeConnectionOverlay(tab.id);
  broadcastPanelChanged();
  if (!claimedTabs.size())
    monitor.stop();
  logExtension("Disconnected tab from OpenCode session", {
    tabId: tab?.id,
    sessionId: claim?.sessionId
  });
  return true;
}
async function cropScreenshot(tabId, dataUrl, rect, viewport) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      files: ["injected/dom.js"]
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: (source, rectArg, viewportArg) => globalThis.__opc_cropDataUrl(source, rectArg, viewportArg, 12),
      args: [dataUrl, rect, viewport]
    });
    return results[0]?.result || null;
  } catch {
    return null;
  }
}
async function captureVisibleTabWithTimeout(windowId, timeoutMs = 1e4) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Screenshot capture timed out. The tab may have navigated. Reconnect and try again.")), timeoutMs);
  });
  try {
    return await Promise.race([chrome.tabs.captureVisibleTab(windowId, { format: "png" }), timeout]);
  } finally {
    if (timer)
      clearTimeout(timer);
  }
}
async function startAnnotationMode(tabOverride) {
  const tab = tabOverride?.id ? tabOverride : await getActiveTab();
  if (!tab?.id || !tab.windowId)
    throw new Error("No active tab found");
  const claim = claimedTabs.get(tab.id);
  if (!claim?.baseUrl || !claim?.sessionId) {
    throw new Error("Tab is not connected to an OpenCode instance");
  }
  try {
    await postJson(claim.baseUrl, "/claim", claimRequestBody(tab.id, claim.sessionId));
  } catch (error) {
    warnExtension("Failed to refresh upstream tab claim before annotating", {
      tabId: tab.id,
      sessionId: claim.sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  logExtension("Starting annotation queue mode", {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title
  });
  let queued = 0;
  for (;;) {
    const picked = await runAnnotationPicker(tab.id);
    if (!picked || picked.cancelled === true)
      break;
    logExtension("Capturing annotation screenshot", { tabId: tab.id, windowId: tab.windowId });
    const screenshot = await captureVisibleTabWithTimeout(tab.windowId);
    const cropped = await cropScreenshot(tab.id, screenshot, picked.element?.rect, picked.viewport);
    const dataUrl = cropped || screenshot;
    logExtension("Captured annotation screenshot", {
      tabId: tab.id,
      cropped: !!cropped,
      bytesApprox: Math.round(dataUrl.length * 3 / 4)
    });
    try {
      await annotationQueues.add(tab.id, {
        comment: picked.comment || "",
        page: {
          url: tab.url || "",
          title: tab.title || ""
        },
        element: picked.element,
        viewport: picked.viewport,
        screenshot: {
          mime: "image/png",
          dataUrl
        },
        createdAt: Date.now()
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      warnExtension("Failed to persist annotation queue", { tabId: tab.id, error: text });
      await showAnnotationError(tab.id, "Annotation queue is full - send or remove queued annotations");
      break;
    }
    queued += 1;
    logExtension("Annotation queued", {
      tabId: tab.id,
      selector: picked.element?.selector,
      commentLength: (picked.comment || "").length,
      queued
    });
    await injectConnectionOverlay(tab.id, true);
    if (picked.finish === true)
      break;
  }
  return { cancelled: false, queued };
}
chrome.tabs.onRemoved.addListener((tabId) => {
  claimedTabs.delete(tabId);
  // Preserve the annotation queue + send history when a tab closes: tab IDs
  // are never reused within a browser session, so retained entries cannot be
  // confused with a new tab, and a failing send period must not silently drop
  // unsent work. Retained data lives in session storage and clears with the
  // browser session.
  if (!claimedTabs.size())
    monitor.stop();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete")
    return;
  const claim = claimedTabs.get(tabId);
  if (!claim)
    return;
  const nextOrigin = toOriginPattern(tab?.url);
  if (nextOrigin && claim.origin && nextOrigin !== claim.origin) {
    disconnectTab({ ...tab, id: tabId }).catch(() => {});
    return;
  }
  if (SIDE_PANEL_SUPPORTED) {
    removeConnectionOverlay(tabId);
    broadcastPanelChanged();
    return;
  }
  injectConnectionOverlay(tabId);
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (SIDE_PANEL_SUPPORTED) {
    broadcastPanelChanged();
    return;
  }
  const claim = claimedTabs.get(tabId);
  if (claim)
    injectConnectionOverlay(tabId);
});
async function restoreClaimState() {
  await claimedTabs.restore();
  await annotationQueues.restore();
  for (const [tabId, claim] of Array.from(claimedTabs.entries())) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const nextOrigin = toOriginPattern(tab?.url);
      if (!nextOrigin || claim.origin && nextOrigin !== claim.origin) {
        claimedTabs.delete(tabId);
        continue;
      }
      await injectConnectionOverlay(tabId);
    } catch {
      claimedTabs.delete(tabId);
    }
  }
  broadcastPanelChanged();
  if (claimedTabs.size())
    monitor.ensure();
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isSupportedMessage(message))
    return false;
  handleMessage(message, sender).then((response) => {
    if (BROADCAST_MESSAGE_TYPES.has(message.type))
      broadcastPanelChanged();
    sendResponse(response);
  }).catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});
chrome.action.onClicked.addListener(async (clickedTab) => {
  if (SIDE_PANEL_SUPPORTED) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      await chrome.sidePanel.open({ windowId: clickedTab.windowId });
    } catch (error) {
      warnExtension("Failed to open side panel", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }
  try {
    const tab = clickedTab?.id ? clickedTab : await getActiveTab();
    if (!tab.id)
      throw new Error("No active tab found");
    await ensureSiteAccess(tab);
    const { sessions, context } = await requestSessionState();
    await showSessionPicker(tab.id, sessions, context, claimedTabs.get(tab.id)?.sessionId);
    logExtension(sessions.length ? "Session picker shown" : "OpenCode setup help shown", undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnExtension("Failed to show session picker", { error: message });
    const tab = await getActiveTab().catch(() => null);
    if (tab?.id)
      await showAnnotationError(tab.id, message).catch(() => {});
  }
});
if (SIDE_PANEL_SUPPORTED) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    warnExtension("Failed to set side panel behavior", {
      error: error instanceof Error ? error.message : String(error)
    });
  });
}
restoreClaimState().catch((error) => {
  warnExtension("Failed to restore tab claims", { error: error instanceof Error ? error.message : String(error) });
});
