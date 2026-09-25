// sidepanel.js - OpenCode annotation side panel UI
const state = {
  loading: true,
  tab: null,
  claim: null,
  queue: [],
  selection: null,
  sessions: null,
  sessionsContext: null,
  fetchingSessions: false,
  fetchingSessionsStarted: false,
  activeProject: "",
  confirmCloseId: null,
  confirmCloseTimer: null,
  selectedSessionIds: new Set(),
  selectionAnchorId: null,
  confirmBulkClose: false,
  confirmBulkTimer: null,
  settingsOpen: false,
  draft: "",
  pending: false,
  toast: null,
  toastTimer: null,
  addedTick: false,
  tickTimer: null,
  focusTextarea: false
};

const app = document.body;

function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  if (props.text !== undefined)
    node.textContent = props.text;
  if (props.className)
    node.className = props.className;
  if (props.disabled)
    node.disabled = true;
  if (props.checked !== undefined)
    node.checked = Boolean(props.checked);
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs))
      node.setAttribute(key, String(value));
  }
  if (props.on) {
    for (const [event, handler] of Object.entries(props.on))
      node.addEventListener(event, handler);
  }
  for (const child of children) {
    if (child)
      node.appendChild(child);
  }
  return node;
}

const ICON_PATHS = {
  refresh: '<path d="M10 6a4 4 0 1 1-1.17-2.83M10 1.5V3.5H8"/>',
  crosshair: '<circle cx="6" cy="6" r="3.2"/><path d="M6 .8v2.4M6 8.8v2.4M.8 6h2.4M8.8 6h2.4"/>',
  send: '<path d="M11 1L1 5.5l3.5 2L6 11l5-10z"/><path d="M4.5 7.5L11 1"/>',
  gear: '<circle cx="6" cy="6" r="2.1"/><path d="M6 .9v1.7M6 9.4v1.7M.9 6h1.7M9.4 6h1.7M2.4 2.4l1.2 1.2M8.4 8.4l1.2 1.2M9.6 2.4L8.4 3.6M3.6 8.4L2.4 9.6"/>',
  check: '<path d="M2 6.4l2.6 2.6L10 3.4"/>',
  trash: '<path d="M1.8 3.2h8.4M4.4 3.2V2.2h3.2v1M2.8 3.2l.5 6.8h5.4l.5-6.8M4.9 5.4v2.8M7.1 5.4v2.8"/>',
  link: '<path d="M5 3.2l1-1a2.4 2.4 0 0 1 3.4 3.4l-1 1M7 8.8l-1 1A2.4 2.4 0 0 1 2.6 6.4l1-1"/><path d="M4.4 7.6l3.2-3.2"/>',
  plug: '<path d="M4.2 1.2v2.6M7.8 1.2v2.6M2.6 3.8h6.8v1.8a3.4 3.4 0 0 1-6.8 0V3.8zM6 9v1.8"/>'
};

function icon(name, size = 12) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ic");
  svg.innerHTML = ICON_PATHS[name] || "";
  return svg;
}

function addedTickNode() {
  return h("span", { className: "added-tick" }, [
    icon("check", 10),
    h("span", { text: "Added" })
  ]);
}

function toast(kind, text, ttl = 4500) {
  state.toast = { kind, text };
  render();
  if (state.toastTimer)
    clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    state.toast = null;
    render();
  }, ttl);
}

async function currentTab() {
  const win = await chrome.windows.getCurrent();
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab || null;
}

async function sendPanelMessage(payload) {
  const tab = await currentTab();
  return chrome.runtime.sendMessage({ ...payload, tabId: tab?.id });
}

async function ensureOriginAccess() {
  const granted = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  if (granted)
    return;
  const requested = await chrome.permissions.request({ origins: ["<all_urls>"] });
  if (!requested)
    throw new Error("Site access was denied. The extension needs access to pages to select elements and capture screenshots.");
}

async function refreshState() {
  try {
    const tab = await currentTab();
    if (tab?.id) {
      const response = await chrome.runtime.sendMessage({ type: "panel_get_state", tabId: tab.id });
      if (response?.ok) {
        const previousPhase = state.selection?.phase;
        state.tab = response.tab;
        state.claim = response.claim;
        state.queue = Array.isArray(response.queue) ? response.queue : [];
        state.selection = response.selection;
        if (!response.claim)
          state.settingsOpen = false;
        if (!response.selection)
          state.draft = "";
        if (previousPhase !== "locked" && response.selection?.phase === "locked")
          state.focusTextarea = true;
      }
    }
  } catch {}
  state.loading = false;
  render();
}

async function fetchSessions() {
  state.fetchingSessions = true;
  state.fetchingSessionsStarted = true;
  state.confirmCloseId = null;
  disarmBulkConfirm();
  render();
  try {
    const response = await sendPanelMessage({ type: "refresh_sessions" });
    if (response?.ok) {
      state.sessions = Array.isArray(response.sessions) ? response.sessions : [];
      state.sessionsContext = response.context || null;
      state.activeProject = "";
      pruneSessionSelection();
    } else {
      toast("error", response?.error || "Failed to fetch sessions");
    }
  } catch (error) {
    toast("error", error?.message || String(error));
  }
  state.fetchingSessions = false;
  render();
}

async function connectSession(session) {
  try {
    const response = await sendPanelMessage({ type: "connect_tab_to_session", session });
    if (!response?.ok)
      toast("error", response?.error || "Failed to connect");
  } catch (error) {
    toast("error", error?.message || String(error));
  }
}

function armConfirmClose(id) {
  state.confirmCloseId = id;
  if (state.confirmCloseTimer)
    clearTimeout(state.confirmCloseTimer);
  state.confirmCloseTimer = setTimeout(() => {
    state.confirmCloseId = null;
    render();
  }, 4000);
  render();
}

async function postCloseSession(session) {
  return sendPanelMessage({
    type: "close_session",
    sessionId: session.id,
    baseUrl: session.baseUrl
  });
}

async function closeSession(session) {
  state.confirmCloseId = null;
  if (state.confirmCloseTimer) {
    clearTimeout(state.confirmCloseTimer);
    state.confirmCloseTimer = null;
  }
  try {
    const response = await postCloseSession(session);
    if (response?.ok) {
      toast("success", "Session closed", 2500);
      fetchSessions();
      return;
    }
    toast("error", response?.error || "Failed to close session");
  } catch (error) {
    toast("error", error?.message || String(error));
  }
}

// Order of session ids as currently visible in the list (grouped/filtered order).
// Rebuilt on every sessionsNode render; used for shift-click range selection.
let lastVisibleSessionIds = [];

function pruneSessionSelection() {
  const liveIds = new Set((state.sessions || []).map((item) => item.id));
  state.selectedSessionIds = new Set(
    [...state.selectedSessionIds].filter((id) => liveIds.has(id))
  );
  if (state.selectionAnchorId && !liveIds.has(state.selectionAnchorId))
    state.selectionAnchorId = null;
}

function disarmBulkConfirm() {
  state.confirmBulkClose = false;
  if (state.confirmBulkTimer) {
    clearTimeout(state.confirmBulkTimer);
    state.confirmBulkTimer = null;
  }
}

function armBulkConfirm() {
  state.confirmBulkClose = true;
  if (state.confirmBulkTimer)
    clearTimeout(state.confirmBulkTimer);
  state.confirmBulkTimer = setTimeout(() => {
    state.confirmBulkClose = false;
    state.confirmBulkTimer = null;
    render();
  }, 4000);
  render();
}

function toggleSessionSelected(session, event) {
  const clickedId = session.id;
  const order = lastVisibleSessionIds;
  if (event?.shiftKey && state.selectionAnchorId && order.includes(state.selectionAnchorId) && order.includes(clickedId)) {
    const [from, to] = [order.indexOf(state.selectionAnchorId), order.indexOf(clickedId)].sort((a, b) => a - b);
    for (let i = from; i <= to; i++)
      state.selectedSessionIds.add(order[i]);
  } else {
    if (state.selectedSessionIds.has(clickedId))
      state.selectedSessionIds.delete(clickedId);
    else
      state.selectedSessionIds.add(clickedId);
    state.selectionAnchorId = clickedId;
  }
  disarmBulkConfirm();
  render();
}

function clearSessionSelection() {
  state.selectedSessionIds = new Set();
  state.selectionAnchorId = null;
  disarmBulkConfirm();
  render();
}

async function closeSelectedSessions() {
  const ids = [...state.selectedSessionIds];
  disarmBulkConfirm();
  state.confirmCloseId = null;
  const byId = new Map((state.sessions || []).map((item) => [item.id, item]));
  let closed = 0;
  let failed = 0;
  for (const id of ids) {
    const session = byId.get(id);
    if (!session)
      continue;
    try {
      const response = await postCloseSession(session);
      if (response?.ok) {
        closed++;
        state.selectedSessionIds.delete(id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  if (closed && !failed)
    toast("success", closed === 1 ? "Closed 1 session" : `Closed ${closed} sessions`, 2500);
  else if (closed && failed)
    toast("error", `Closed ${closed} session${closed === 1 ? "" : "s"}, ${failed} failed`);
  else if (failed)
    toast("error", failed === 1 ? "Failed to close 1 session" : `Failed to close ${failed} sessions`);
  fetchSessions();
}

async function disconnectTab() {
  try {
    const response = await sendPanelMessage({ type: "disconnect_tab" });
    if (!response?.ok) {
      toast("error", response?.error || "Failed to disconnect");
      return;
    }
    state.settingsOpen = false;
    render();
  } catch (error) {
    toast("error", error?.message || String(error));
  }
}

async function startAnnotation() {
  try {
    const tab = await currentTab();
    await ensureOriginAccess();
    const response = await chrome.runtime.sendMessage({ type: "panel_start_annotation", tabId: tab?.id });
    if (!response?.ok)
      toast("error", response?.error || "Failed to start selection");
  } catch (error) {
    toast("error", error?.message || String(error));
  }
  render();
}

async function cancelSelection() {
  try {
    const response = await sendPanelMessage({ type: "panel_cancel_selection" });
    if (!response?.ok) {
      toast("error", response?.error || "Failed to cancel selection");
      return;
    }
    state.selection = null;
    state.draft = "";
    render();
  } catch (error) {
    toast("error", error?.message || String(error));
  }
}

async function reselectElement() {
  if (state.pending)
    return;
  try {
    const response = await sendPanelMessage({ type: "panel_reselect_element" });
    if (!response?.ok) {
      toast("error", response?.error || "Failed to reselect");
      return;
    }
    if (state.selection)
      state.selection = { phase: "hover", element: null, viewport: null };
    render();
  } catch (error) {
    toast("error", error?.message || String(error));
  }
}

async function submitSelection(finish) {
  if (state.pending)
    return;
  state.pending = true;
  render();
  try {
    const response = await sendPanelMessage({
      type: "panel_submit_annotation",
      comment: state.draft,
      finish
    });
    if (response?.ok) {
      state.draft = "";
      if (finish !== true)
        state.selection = { phase: "hover", element: null, viewport: null };
      state.addedTick = true;
      if (state.tickTimer)
        clearTimeout(state.tickTimer);
      state.tickTimer = setTimeout(() => {
        state.addedTick = false;
        render();
      }, 1600);
    } else {
      toast("error", response?.error || "Failed to add annotation");
    }
  } catch (error) {
    toast("error", error?.message || String(error));
  }
  state.pending = false;
  render();
}

async function sendQueue() {
  if (state.pending)
    return;
  if (!state.queue.length) {
    toast("error", "No queued annotations to send");
    return;
  }
  state.pending = true;
  render();
  try {
    const response = await sendPanelMessage({ type: "send_queued_annotations" });
    if (response?.ok) {
      const sent = response.sent || 0;
      toast("success", sent === 1 ? "Sent 1 annotation to OpenCode" : `Sent ${sent} annotations to OpenCode`);
    } else {
      toast("error", response?.error || "Failed to send annotations");
    }
  } catch (error) {
    toast("error", error?.message || String(error));
  }
  state.pending = false;
  render();
}

async function clearQueue() {
  try {
    const response = await sendPanelMessage({ type: "clear_queue" });
    if (!response?.ok)
      toast("error", response?.error || "Failed to clear queue");
  } catch (error) {
    toast("error", error?.message || String(error));
  }
}

async function removeQueued(id) {
  try {
    const response = await sendPanelMessage({ type: "remove_queued_annotation", id });
    if (!response?.ok)
      toast("error", response?.error || "Failed to remove annotation");
  } catch (error) {
    toast("error", error?.message || String(error));
  }
}

function projectNameFor(directory) {
  const segments = (directory || "").split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1] : directory || "Unknown project";
}

function formatRelative(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0)
    return "";
  const diff = Date.now() - value;
  if (diff < 0)
    return "now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1)
    return "now";
  if (minutes < 60)
    return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7)
    return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toastNode() {
  return h("div", { className: `toast ${state.toast.kind}`, text: state.toast.text });
}

function sessionsNode() {
  const root = h("div", { className: "section" });
  root.appendChild(h("div", { className: "header" }, [
    h("div", { className: "row" }, [
      h("img", { attrs: { src: "icons/icon48.png", alt: "", class: "logo" } }),
      h("div", { className: "title", text: "Connect this tab to OpenCode" })
    ]),
    h("button", {
      className: "icon-btn",
      attrs: { type: "button", "aria-label": "Refresh chat list", title: "Refresh chat list" },
      on: { click: fetchSessions }
    }, [icon("refresh")])
  ]));
  if (!state.fetchingSessionsStarted || state.fetchingSessions) {
    root.appendChild(h("div", { className: "hint", text: "Looking for OpenCode…" }));
    return root;
  }
  if (!Array.isArray(state.sessions) || !state.sessions.length) {
    root.appendChild(emptyStateNode());
    return root;
  }
  const groups = [];
  const byDirectory = new Map();
  for (const item of state.sessions) {
    const dir = item.directory || "";
    let group = byDirectory.get(dir);
    if (!group) {
      group = { directory: dir, items: [] };
      byDirectory.set(dir, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  if (groups.length > 1) {
    const chipsRow = h("div", { className: "chips" });
    const chipDefs = [{ label: `All (${state.sessions.length})`, value: "" }].concat(groups.map((group) => ({
      label: `${projectNameFor(group.directory)} (${group.items.length})`,
      value: group.directory
    })));
    for (const def of chipDefs) {
      const chip = h("button", {
        className: `chip${state.activeProject === def.value ? " active" : ""}`,
        text: def.label,
        attrs: { type: "button" },
        on: {
          click: () => {
            state.activeProject = def.value;
            render();
          }
        }
      });
      chipsRow.appendChild(chip);
    }
    root.appendChild(chipsRow);
  }
  const listContainer = h("div", { className: "list" });
  const visibleGroups = state.activeProject ? groups.filter((group) => group.directory === state.activeProject) : groups;
  const linkedId = state.claim?.sessionId || null;
  lastVisibleSessionIds = visibleGroups.flatMap((group) => group.items.map((item) => item.id));
  if (state.selectedSessionIds.size) {
    const count = state.selectedSessionIds.size;
    const isBulkConfirming = state.confirmBulkClose;
    root.appendChild(h("div", { className: "bulk-bar" }, [
      h("span", { className: "bulk-count", text: `${count} selected` }),
      h("button", {
        className: `btn small${isBulkConfirming ? " confirm" : ""}`,
        text: isBulkConfirming ? "Sure?" : `Close ${count} session${count === 1 ? "" : "s"}`,
        attrs: { type: "button", "aria-label": `Close ${count} selected session${count === 1 ? "" : "s"}`, title: "Close selected sessions" },
        on: {
          click: () => {
            if (isBulkConfirming) {
              closeSelectedSessions();
              return;
            }
            armBulkConfirm();
          }
        }
      }),
      h("button", {
        className: "btn small",
        text: "Clear",
        attrs: { type: "button", "aria-label": "Clear session selection", title: "Clear selection" },
        on: { click: clearSessionSelection }
      })
    ]));
  }
  for (const group of visibleGroups) {
    for (const item of group.items) {
      const isLinked = Boolean(linkedId) && item.id === linkedId;
      const isConfirming = state.confirmCloseId === item.id;
      const isSelected = state.selectedSessionIds.has(item.id);
      listContainer.appendChild(h("div", { className: `session-row${isSelected ? " selected" : ""}` }, [
        h("input", {
          className: "session-select",
          checked: isSelected,
          attrs: { type: "checkbox", "aria-label": `Select session ${item.title || item.id}` },
          on: {
            click: (event) => toggleSessionSelected(item, event)
          }
        }),
        h("button", {
          className: "session-item",
          attrs: { type: "button" },
          on: {
            click: () => connectSession(item)
          }
        }, [
          h("div", { className: "row" }, [
            h("div", { className: "session-name grow", text: item.title || item.id }),
            isLinked ? h("span", { className: "linked-chip", text: "Linked" }) : null,
            h("span", { className: "session-date", text: formatRelative(item.updatedAt) })
          ]),
          h("div", { className: "session-meta", text: item.directory || item.id })
        ]),
        h("button", {
          className: `session-close${isConfirming ? " confirm" : ""}`,
          text: isConfirming ? "Sure?" : "×",
          attrs: { type: "button", "aria-label": `Close session ${item.title || item.id}`, title: "Close session" },
          on: {
            click: () => {
              if (isConfirming) {
                closeSession(item);
                return;
              }
              armConfirmClose(item.id);
            }
          }
        })
      ]));
    }
  }
  root.appendChild(listContainer);
  return root;
}

function emptyStateNode() {
  const reason = state.sessionsContext?.reason;
  const content = reason === "no-sessions"
    ? {
      title: "No OpenCode session available",
      text: "The local plugin responded, but it did not report an active OpenCode session for this project.",
      steps: [
        "Open OpenCode in the project you want to edit",
        "Make sure the annotation plugin is enabled in that OpenCode config",
        "Restart OpenCode if you just changed the config"
      ]
    }
    : {
      title: "OpenCode plugin not found",
      text: "The extension could not find a local OpenCode annotation server on ports 39240-39260.",
      steps: [
        "Install npm package: opencode-chrome-annotation",
        "Add it to your OpenCode config",
        "Restart OpenCode in your project"
      ]
    };
  return h("div", {}, [
    h("div", { className: "empty-icon" }, [icon("plug", 16)]),
    h("div", { className: "empty-title", text: content.title }),
    h("p", { className: "empty-text", text: content.text }),
    h("ol", { className: "empty-list" }, content.steps.map((step) => h("li", { text: step }))),
    h("div", { className: "row end" }, [
      h("button", {
        className: "btn",
        text: "Try again",
        attrs: { type: "button" },
        on: { click: fetchSessions }
      })
    ])
  ]);
}

function toolbarNode() {
  const children = [];
  if (state.selection) {
    children.push(h("button", {
      className: "btn",
      text: "Cancel",
      attrs: { type: "button" },
      on: { click: cancelSelection }
    }));
  } else {
    children.push(h("button", {
      className: "btn primary",
      attrs: { type: "button" },
      on: { click: startAnnotation }
    }, [icon("crosshair"), h("span", { text: "Select element" })]));
    if (state.addedTick)
      children.push(addedTickNode());
  }
  children.push(h("button", {
    className: "btn primary",
    attrs: { type: "button" },
    disabled: state.pending || !state.queue.length,
    on: { click: sendQueue }
  }, [icon("send"), h("span", { text: "Send all" })]));
  children.push(h("div", { className: "grow" }));
  children.push(h("button", {
    className: "icon-btn",
    attrs: { type: "button", "aria-label": "Settings", title: "Settings" },
    on: {
      click: () => {
        state.settingsOpen = !state.settingsOpen;
        render();
      }
    }
  }, [icon("gear")]));
  return h("div", { className: "toolbar" }, children);
}

function settingsNode() {
  const claim = state.claim;
  return h("div", { className: "card" }, [
    h("div", { className: "row" }, [
      icon("link"),
      h("div", { className: "hint grow", text: `Linked chat: ${claim.sessionLabel || claim.sessionId || "Connected"}` })
    ]),
    h("div", { className: "row end" }, [
      h("button", {
        className: "btn small",
        text: "Disconnect",
        attrs: { type: "button" },
        on: { click: disconnectTab }
      })
    ])
  ]);
}

function selectionNode() {
  const selection = state.selection;
  if (!selection)
    return null;
  if (selection.phase === "hover") {
    return h("div", { className: "row" }, [
      h("div", { className: "hint grow", text: "Click an element on the page…" }),
      state.addedTick ? addedTickNode() : null
    ]);
  }
  const root = h("div", { className: "card" });
  const info = selection.element || {};
  root.appendChild(h("div", {
    className: "element-info",
    text: `${info.tag || ""} ${info.selector || ""}`.trim() || "Selected element"
  }));
  const textarea = h("textarea", {
    className: "textarea",
    attrs: { placeholder: "What should OpenCode change here?" }
  });
  textarea.value = state.draft;
  textarea.addEventListener("input", () => {
    state.draft = textarea.value;
  });
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitSelection(false);
    }
  });
  root.appendChild(textarea);
  root.appendChild(h("div", { className: "row" }, [
    h("button", {
      className: "btn primary grow",
      text: "Add to queue",
      attrs: { type: "button" },
      disabled: state.pending,
      on: { click: () => submitSelection(false) }
    }),
    h("button", {
      className: "btn",
      text: "Add & finish",
      attrs: { type: "button" },
      disabled: state.pending,
      on: { click: () => submitSelection(true) }
    })
  ]));
  root.appendChild(h("button", {
    className: "btn small",
    text: "Reselect",
    attrs: { type: "button" },
    disabled: state.pending,
    on: { click: reselectElement }
  }));
  return root;
}

function queueNode() {
  if (!state.queue.length)
    return null;
  const root = h("div", { className: "section" });
  root.appendChild(h("div", { className: "row between" }, [
    h("div", { className: "title", text: "Queued" }),
    h("button", {
      className: "btn small",
      attrs: { type: "button" },
      on: { click: clearQueue }
    }, [icon("trash"), h("span", { text: "Clear" })])
  ]));
  const listContainer = h("div", { className: "list" });
  state.queue.forEach((entry, index) => {
    const rawComment = typeof entry.comment === "string" ? entry.comment : "";
    const excerpt = rawComment.length > 140 ? `${rawComment.slice(0, 140)}...` : rawComment;
    const label = `${entry.tag || ""} ${entry.selector || ""}`.trim() || "element";
    listContainer.appendChild(h("div", { className: "queue-item" }, [
      h("div", { className: "row between" }, [
        h("div", { className: "queue-meta", text: `${index + 1}. ${label}` }),
        h("button", {
          className: "icon-btn",
          text: "×",
          attrs: { type: "button", "aria-label": `Remove queued annotation ${index + 1}` },
          on: { click: () => removeQueued(entry.id) }
        })
      ]),
      excerpt ? h("div", { className: "queue-comment", text: excerpt }) : null
    ]));
  });
  root.appendChild(listContainer);
  return root;
}

function connectedNode() {
  const root = h("div", { className: "contents" });
  root.appendChild(toolbarNode());
  if (state.settingsOpen)
    root.appendChild(settingsNode());
  const selection = selectionNode();
  if (selection)
    root.appendChild(selection);
  const queue = queueNode();
  if (queue)
    root.appendChild(queue);
  return root;
}

function buildUI() {
  const root = h("div", { className: "root" });
  if (state.loading) {
    root.appendChild(h("div", { className: "hint", text: "Loading…" }));
    return root;
  }
  if (state.claim)
    root.appendChild(connectedNode());
  else
    root.appendChild(sessionsNode());
  if (state.toast)
    root.appendChild(toastNode());
  return root;
}

function render() {
  const ui = buildUI();
  app.replaceChildren(ui);
  if (state.focusTextarea) {
    state.focusTextarea = false;
    const textarea = ui.querySelector("textarea");
    if (textarea)
      textarea.focus();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "panel_state_changed")
    refreshState();
});

chrome.tabs.onActivated.addListener(() => {
  refreshState();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape")
    return;
  if (!state.selection)
    return;
  event.preventDefault();
  cancelSelection();
});

(async () => {
  await refreshState();
  fetchSessions();
})();
