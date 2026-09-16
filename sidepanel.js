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
  draft: "",
  pending: false,
  banner: null,
  bannerTimer: null,
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

function svgIcon(pathData, size = 12, strokeWidth = 1.6) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", String(strokeWidth));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("fill", "none");
  svg.appendChild(path);
  return svg;
}
function refreshIcon() {
  return svgIcon("M10 6a4 4 0 1 1-1.17-2.83M10 1.5V3.5H8");
}

function setBanner(kind, text, ttl = 5000) {
  state.banner = { kind, text };
  render();
  if (state.bannerTimer)
    clearTimeout(state.bannerTimer);
  state.bannerTimer = setTimeout(() => {
    state.banner = null;
    render();
  }, ttl);
}

function originPatternFrom(url) {
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

async function currentTab() {
  const win = await chrome.windows.getCurrent();
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab || null;
}

async function sendPanelMessage(payload) {
  const tab = await currentTab();
  return chrome.runtime.sendMessage({ ...payload, tabId: tab?.id });
}

async function ensureOriginAccess(tab) {
  const origin = originPatternFrom(tab?.url);
  if (!origin)
    throw new Error("This page cannot be annotated. Open an http(s) page and try again.");
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (granted)
    return;
  const requested = await chrome.permissions.request({ origins: [origin] });
  if (!requested)
    throw new Error("Site access was denied for this page.");
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
  render();
  try {
    const response = await sendPanelMessage({ type: "panel_refresh_sessions" });
    if (response?.ok) {
      state.sessions = Array.isArray(response.sessions) ? response.sessions : [];
      state.sessionsContext = response.context || null;
      state.activeProject = "";
    } else {
      setBanner("error", response?.error || "Failed to fetch sessions");
    }
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
  state.fetchingSessions = false;
  render();
}

async function connectSession(session) {
  try {
    const response = await sendPanelMessage({ type: "connect_tab_to_session", session });
    if (!response?.ok)
      setBanner("error", response?.error || "Failed to connect");
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
}

async function disconnectTab() {
  try {
    const response = await sendPanelMessage({ type: "disconnect_tab" });
    if (!response?.ok)
      setBanner("error", response?.error || "Failed to disconnect");
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
}

async function startAnnotation() {
  try {
    const tab = await currentTab();
    await ensureOriginAccess(tab);
    const response = await chrome.runtime.sendMessage({ type: "panel_start_annotation", tabId: tab?.id });
    if (!response?.ok)
      setBanner("error", response?.error || "Failed to start selection");
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
  render();
}

async function cancelSelection() {
  try {
    const response = await sendPanelMessage({ type: "panel_cancel_selection" });
    if (!response?.ok) {
      setBanner("error", response?.error || "Failed to cancel selection");
      return;
    }
    state.selection = null;
    state.draft = "";
    render();
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
}

async function reselectElement() {
  if (state.pending)
    return;
  try {
    const response = await sendPanelMessage({ type: "panel_reselect_element" });
    if (!response?.ok) {
      setBanner("error", response?.error || "Failed to reselect");
      return;
    }
    if (state.selection)
      state.selection = { phase: "hover", element: null, viewport: null };
    render();
  } catch (error) {
    setBanner("error", error?.message || String(error));
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
      setBanner("success", "Added to queue", 2500);
    } else {
      setBanner("error", response?.error || "Failed to add annotation");
    }
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
  state.pending = false;
  render();
}

async function sendQueue() {
  if (state.pending)
    return;
  if (!state.queue.length) {
    setBanner("error", "No queued annotations to send");
    return;
  }
  state.pending = true;
  render();
  try {
    const response = await sendPanelMessage({ type: "send_queued_annotations" });
    if (response?.ok) {
      const sent = response.sent || 0;
      setBanner("success", sent === 1 ? "Sent 1 annotation to OpenCode" : `Sent ${sent} annotations to OpenCode`);
    } else {
      setBanner("error", response?.error || "Failed to send annotations");
    }
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
  state.pending = false;
  render();
}

async function clearQueue() {
  try {
    const response = await sendPanelMessage({ type: "clear_queue" });
    if (!response?.ok)
      setBanner("error", response?.error || "Failed to clear queue");
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
}

async function removeQueued(id) {
  try {
    const response = await sendPanelMessage({ type: "remove_queued_annotation", id });
    if (!response?.ok)
      setBanner("error", response?.error || "Failed to remove annotation");
  } catch (error) {
    setBanner("error", error?.message || String(error));
  }
}

function projectNameFor(directory) {
  const segments = (directory || "").split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1] : directory || "Unknown project";
}

function bannerNode() {
  return h("div", { className: `banner ${state.banner.kind}`, text: state.banner.text });
}

function sessionsNode() {
  const root = h("div", { className: "card" });
  root.appendChild(h("div", { className: "header" }, [
    h("div", { className: "title", text: "Connect this tab to OpenCode" }),
    h("button", {
      className: "icon-btn",
      attrs: { type: "button", "aria-label": "Refresh chat list", title: "Refresh chat list" },
      on: { click: fetchSessions }
    }, [refreshIcon()])
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
  for (const group of visibleGroups) {
    if (!state.activeProject && visibleGroups.length > 1) {
      listContainer.appendChild(h("div", { className: "session-group-header" }, [
        h("span", { className: "group-name", text: projectNameFor(group.directory) }),
        h("span", { className: "group-path", text: group.directory })
      ]));
    }
    for (const item of group.items) {
      const isLinked = Boolean(linkedId) && item.id === linkedId;
      listContainer.appendChild(h("button", {
        className: "session-item",
        attrs: { type: "button" },
        on: {
          click: () => connectSession(item)
        }
      }, [
        h("div", { className: "row" }, [
          h("div", { className: "session-name grow", text: item.title || item.id }),
          isLinked ? h("span", { className: "linked-chip", text: "Linked" }) : null
        ]),
        h("div", { className: "session-meta", text: item.directory || item.id })
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

function selectionNode() {
  const root = h("div", { className: "card" });
  const selection = state.selection;
  if (!selection) {
    root.appendChild(h("button", {
      className: "btn primary full",
      text: "Select element on page",
      attrs: { type: "button" },
      on: { click: startAnnotation }
    }));
    return root;
  }
  if (selection.phase === "hover") {
    root.appendChild(h("div", { className: "row" }, [
      h("div", { className: "hint grow", text: "Click an element on the page…" }),
      h("button", {
        className: "btn small",
        text: "Cancel",
        attrs: { type: "button" },
        on: { click: cancelSelection }
      })
    ]));
    return root;
  }
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
  root.appendChild(h("div", { className: "row" }, [
    h("button", {
      className: "btn small grow",
      text: "Reselect",
      attrs: { type: "button" },
      disabled: state.pending,
      on: { click: reselectElement }
    }),
    h("button", {
      className: "btn small grow",
      text: "Cancel",
      attrs: { type: "button" },
      disabled: state.pending,
      on: { click: cancelSelection }
    })
  ]));
  return root;
}

function queueNode() {
  const root = h("div", { className: "card" });
  root.appendChild(h("div", { className: "title", text: `Queued annotations (${state.queue.length})` }));
  if (!state.queue.length) {
    root.appendChild(h("div", { className: "hint", text: "No queued annotations yet" }));
    return root;
  }
  state.queue.forEach((entry, index) => {
    const rawComment = typeof entry.comment === "string" ? entry.comment : "";
    const excerpt = rawComment.length > 140 ? `${rawComment.slice(0, 140)}...` : rawComment;
    const label = `${entry.tag || ""} ${entry.selector || ""}`.trim() || "element";
    root.appendChild(h("div", { className: "queue-item" }, [
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
  root.appendChild(h("div", { className: "row end" }, [
    h("button", {
      className: "btn small",
      text: "Clear",
      attrs: { type: "button" },
      on: { click: clearQueue }
    }),
    h("button", {
      className: "btn primary small",
      text: "Send all to OpenCode",
      attrs: { type: "button" },
      disabled: state.pending,
      on: { click: sendQueue }
    })
  ]));
  return root;
}

function connectedNode() {
  const root = h("div", { className: "root" });
  const claim = state.claim;
  root.appendChild(h("div", { className: "card" }, [
    h("div", { className: "row between" }, [
      h("div", { className: "grow" }, [
        h("div", { className: "linked-label", text: claim.sessionLabel || claim.sessionId || "Connected" }),
        h("div", { className: "hint", text: "Linked OpenCode chat" })
      ]),
      h("button", {
        className: "btn small",
        text: "Disconnect",
        attrs: { type: "button" },
        on: { click: disconnectTab }
      })
    ])
  ]));
  root.appendChild(selectionNode());
  root.appendChild(queueNode());
  return root;
}

function buildUI() {
  const root = h("div", { className: "root" });
  if (state.loading) {
    root.appendChild(h("div", { className: "hint", text: "Loading…" }));
    return root;
  }
  if (state.banner)
    root.appendChild(bannerNode());
  if (state.claim)
    root.appendChild(connectedNode());
  else
    root.appendChild(sessionsNode());
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
