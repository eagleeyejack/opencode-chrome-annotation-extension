// sidepanel-picker.js - chat picker: session list, search, agent filter and
// project chips. Shares state, h() and render() with sidepanel.js (classic
// scripts share one global scope); loaded before it in sidepanel.html.

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
  state.chipFit = null;
  animateListOnce();
}

async function connectSession(session) {
  if (state.connectingId)
    return;
  state.connectingId = session.id;
  render();
  try {
    const response = await sendPanelMessage({ type: "connect_tab_to_session", session });
    if (!response?.ok)
      toast("error", response?.error || "Failed to connect");
  } catch (error) {
    toast("error", error?.message || String(error));
  }
  state.connectingId = null;
  render();
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

// Order of session ids as currently visible in the list (filtered, newest first).
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
  let firstError = "";
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
        firstError = firstError || response?.error || "";
      }
    } catch (error) {
      failed++;
      firstError = firstError || error?.message || "";
    }
  }
  if (closed && !failed)
    toast("success", closed === 1 ? "Closed 1 session" : `Closed ${closed} sessions`, 2500);
  else if (closed && failed)
    toast("error", `Closed ${closed} session${closed === 1 ? "" : "s"}, ${failed} failed`);
  else if (failed)
    toast("error", firstError || (failed === 1 ? "Failed to close 1 session" : `Failed to close ${failed} sessions`));
  fetchSessions();
}

function sortedSessionGroups(sessionList) {
  const groups = [];
  const byDirectory = new Map();
  const sorted = [...(sessionList || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const item of sorted) {
    const dir = item.directory || "";
    let group = byDirectory.get(dir);
    if (!group) {
      group = { directory: dir, items: [] };
      byDirectory.set(dir, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  groups.sort((a, b) => (b.items[0]?.updatedAt || 0) - (a.items[0]?.updatedAt || 0));
  return groups;
}

// Rows get a staggered entrance animation only when this is armed (initial
// load, project-chip toggles) - the whole UI re-renders on every keystroke, so
// a permanent animation would flicker while typing.
function animateListOnce() {
  state.animateList = true;
  render();
  if (state.animateListTimer)
    clearTimeout(state.animateListTimer);
  state.animateListTimer = setTimeout(() => {
    state.animateList = false;
  }, 400);
}

// Claude Code chats can't be closed from here (the bridge refuses), so they
// get spacers instead of controls that would always fail.
function sessionSelectNode(item, isSelected) {
  if (!agentOf(item.agent).closable)
    return h("span", { className: "session-select-spacer" });
  return h("input", {
    className: "session-select",
    checked: isSelected,
    attrs: { type: "checkbox", "aria-label": `Select session ${item.title || item.id}` },
    on: {
      click: (event) => toggleSessionSelected(item, event)
    }
  });
}

function sessionCloseNode(item, isConfirming) {
  if (!agentOf(item.agent).closable)
    return h("span", { className: "session-close-spacer" });
  const name = item.title || item.id;
  return h("button", {
    className: `session-close${isConfirming ? " confirm" : ""}`,
    text: isConfirming ? "Close?" : "×",
    attrs: {
      type: "button",
      "aria-label": isConfirming ? `Confirm closing session ${name}` : `Close session ${name}`,
      title: isConfirming ? "Click again to close" : "Close session"
    },
    on: {
      click: () => {
        if (isConfirming) {
          closeSession(item);
          return;
        }
        armConfirmClose(item.id);
      }
    }
  });
}

function sessionRowNode(item, index, linkedId) {
  const isLinked = Boolean(linkedId) && item.id === linkedId;
  const isConfirming = state.confirmCloseId === item.id;
  const isSelected = state.selectedSessionIds.has(item.id);
  return h("div", {
    className: `session-row${isSelected ? " selected" : ""}${isConfirming ? " confirming" : ""}${state.animateList ? " anim" : ""}`,
    // Cap the stagger so long lists don't trickle in for seconds.
    attrs: { style: `--i:${Math.min(index, 12)}` }
  }, [
    sessionSelectNode(item, isSelected),
    h("button", {
      className: "session-item",
      attrs: { type: "button", title: "Connect this tab to this chat" },
      disabled: Boolean(state.connectingId),
      on: {
        click: () => connectSession(item)
      }
    }, [
      h("div", { className: "row" }, [
        h("div", { className: "session-name grow", text: item.title || item.id }),
        isLinked ? h("span", { className: "linked-chip", text: "Linked" }) : null,
        state.connectingId === item.id ? h("span", { className: "session-date", text: "Connecting…" }) : null,
        h("span", { className: "session-date", text: formatRelative(item.updatedAt) })
      ]),
      h("div", { className: "session-meta" }, [
        agentGlyph(item.agent),
        h("span", {
          className: "project-dot",
          attrs: { style: `--dot:${projectHue(item.directory)}`, "aria-hidden": "true" }
        }),
        h("span", {
          className: "project-name",
          text: projectNameFor(item.directory) || item.id,
          attrs: { title: item.directory || item.id }
        })
      ])
    ]),
    sessionCloseNode(item, isConfirming)
  ]);
}

function sessionsNode() {
  const root = h("div", { className: "section" });
  root.appendChild(h("div", { className: "header" }, [
    h("div", { className: "row" }, [
      h("img", { attrs: { src: "icons/icon48.png", alt: "", class: "logo" } }),
      h("div", { className: "title", text: "Connect this tab to a chat" })
    ]),
    h("button", {
      className: "icon-btn",
      attrs: { type: "button", "aria-label": "Refresh chat list", title: "Refresh chat list" },
      on: { click: fetchSessions }
    }, [icon("refresh")])
  ]));
  if (!state.fetchingSessionsStarted || state.fetchingSessions) {
    root.appendChild(h("div", { className: "hint", text: "Looking for chats…", attrs: { role: "status" } }));
    return root;
  }
  if (!Array.isArray(state.sessions) || !state.sessions.length) {
    root.appendChild(emptyStateNode());
    return root;
  }
  const rawSessions = state.sessions || [];
  const sessions = state.agentFilter
    ? rawSessions.filter((item) => (item.agent || "opencode") === state.agentFilter)
    : rawSessions;
  const groups = sortedSessionGroups(sessions);
  const query = state.searchQuery.trim().toLowerCase();
  const searching = query.length > 0;
  const matches = (item) => !query
    || `${item.title || ""} ${item.directory || ""}`.toLowerCase().includes(query);
  const rows = sessions
    .filter((item) => !state.activeProject || (item.directory || "") === state.activeProject)
    .filter(matches)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const searchRow = h("div", { className: "row" }, [
    (() => {
      const searchInput = h("input", {
        className: "search grow",
        attrs: { type: "text", placeholder: "Search chats…", "aria-label": "Search chats", spellcheck: "false", autocomplete: "off" }
      });
      searchInput.value = state.searchQuery;
      searchInput.addEventListener("input", () => {
        state.searchQuery = searchInput.value;
        render();
      });
      return searchInput;
    })(),
    h("div", {
      className: "agent-tabs",
      attrs: { role: "group", "aria-label": "Filter chats by agent" }
    }, [
      { value: "", label: "All chats" },
      { value: "claude-code", label: "Claude Code chats" },
      { value: "opencode", label: "OpenCode chats" }
    ].map((tab) => h("button", {
      className: `agent-tab${state.agentFilter === tab.value ? " active" : ""}`,
      attrs: { type: "button", "aria-pressed": String(state.agentFilter === tab.value), "aria-label": tab.label, title: tab.label },
      on: {
        click: () => {
          state.agentFilter = tab.value;
          state.chipFit = null;
          animateListOnce();
        }
      }
    }, [agentTabContent(tab.value)])))
  ]);
  root.appendChild(searchRow);
  if (state.agentFilter && !sessions.length) {
    root.appendChild(h("div", {
      className: "hint",
      attrs: { role: "status" },
      text: `No ${agentLabel(state.agentFilter)} chats are running right now.`
    }));
    return root;
  }
  if (groups.length > 1) {
    // Collapsed: All + the latest projects on one auto-fitted line, with a
    // "+N projects" toggle pinned right. Expanded: the line keeps the latest
    // projects and the remaining ones flow beneath it.
    const showAllChips = state.showAllProjects || searching;
    const chipDefs = [{ label: `All (${sessions.length})`, value: "" }].concat(groups.map((group) => ({
      label: `${projectNameFor(group.directory)} (${group.items.length})`,
      value: group.directory
    })));
    const maxProjects = state.chipFit == null ? 3 : state.chipFit;
    let headDefs = chipDefs.slice(0, 1 + Math.min(3, groups.length));
    if (!showAllChips && groups.length > maxProjects)
      headDefs = chipDefs.slice(0, 1 + maxProjects);
    if (state.activeProject && !headDefs.some((def) => def.value === state.activeProject)) {
      const activeDef = chipDefs.find((def) => def.value === state.activeProject);
      if (activeDef)
        headDefs.push(activeDef);
    }
    const tailDefs = chipDefs.filter((def) => def.value && !headDefs.includes(def));
    const chipFor = (def) => h("button", {
      className: `chip${state.activeProject === def.value ? " active" : ""}`,
      attrs: { type: "button", "aria-pressed": state.activeProject === def.value },
      on: {
        click: () => {
          state.activeProject = def.value;
          state.chipFit = null;
          render();
        }
      }
    }, [
      def.value
        ? h("span", { className: "project-dot", attrs: { style: `--dot:${projectHue(def.value)}`, "aria-hidden": "true" } })
        : null,
      h("span", { text: def.label })
    ]);
    const chipsWrap = h("div", { className: "chips-wrap" });
    let chipsClass = "chips";
    if (showAllChips)
      chipsClass += " expanded";
    else if (maxProjects === 1)
      chipsClass += " single";
    const chipsRow = h("div", { className: chipsClass });
    for (const def of headDefs)
      chipsRow.appendChild(chipFor(def));
    chipsWrap.appendChild(chipsRow);
    if (tailDefs.length || showAllChips) {
      chipsWrap.appendChild(h("button", {
        className: "chip toggle",
        text: showAllChips ? "Fewer" : `+${tailDefs.length} project${tailDefs.length === 1 ? "" : "s"}`,
        attrs: { type: "button", "aria-expanded": String(showAllChips), "aria-label": showAllChips ? "Show recent projects only" : "Show all projects" },
        on: {
          click: () => {
            state.showAllProjects = !state.showAllProjects;
            state.chipFit = null;
            animateChipsOnce();
          }
        }
      }));
    }
    root.appendChild(chipsWrap);
    if (showAllChips && tailDefs.length) {
      const moreRow = h("div", { className: `chips-more${state.animateChips ? " anim" : ""}` });
      for (const def of tailDefs)
        moreRow.appendChild(chipFor(def));
      root.appendChild(moreRow);
    }
  }
  const linkedId = state.claim?.sessionId || null;
  lastVisibleSessionIds = rows.filter((item) => agentOf(item.agent).closable).map((item) => item.id);
  if (state.selectedSessionIds.size) {
    const count = state.selectedSessionIds.size;
    const isBulkConfirming = state.confirmBulkClose;
    root.appendChild(h("div", { className: "bulk-bar" }, [
      h("span", { className: "bulk-count", text: `${count} selected` }),
      h("button", {
        className: `btn small${isBulkConfirming ? " confirm" : ""}`,
        text: isBulkConfirming ? "Confirm?" : `Close ${count} session${count === 1 ? "" : "s"}`,
        attrs: { type: "button", "aria-label": `Close ${count} selected session${count === 1 ? "" : "s"}`, title: isBulkConfirming ? "Click again to close" : "Close selected sessions" },
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
  const listContainer = h("div", { className: `list${state.selectedSessionIds.size ? " selecting" : ""}` });
  if (searching) {
    root.appendChild(h("div", { className: "results-row" }, [
      h("span", { className: "results-label", text: "Results" }),
      h("span", { className: "results-count" }, [
        h("span", { text: rows.length ? `${rows.length} of ${sessions.length}` : "No matches" }),
        h("button", {
          className: "icon-btn search-clear",
          text: "×",
          attrs: { type: "button", "aria-label": "Clear search" },
          on: {
            click: () => {
              state.searchQuery = "";
              render();
              document.querySelector(".search")?.focus();
            }
          }
        })
      ])
    ]));
  }
  rows.forEach((item, index) => listContainer.appendChild(sessionRowNode(item, index, linkedId)));
  root.appendChild(listContainer);
  return root;
}

function agentTabContent(value) {
  if (!value)
    return h("span", { text: "All" });
  return brandIcon(agentOf(value).icon, 14);
}

function emptyStateNode() {
  const reason = state.sessionsContext?.reason;
  const content = reason === "no-sessions"
    ? {
      title: "No open chats",
      text: "An annotation server is running, but it has no open chat to connect to.",
      steps: [
        "Open OpenCode or Claude Code in the project you want to edit",
        "For OpenCode, check the annotation plugin is enabled in that config",
        "Come back here and press Try again"
      ]
    }
    : {
      title: "No annotation server found",
      text: "Nothing is answering on ports 39240–39260. OpenCode starts a server through the opencode-annotate plugin; Claude Code through the Claude Code bridge.",
      steps: [
        "OpenCode: add \"opencode-annotate\" to \"plugins\" in your config, then restart it",
        "Claude Code: run node claude-bridge.mjs --install from the opencode-annotate repo",
        "Come back here and press Try again"
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

function animateChipsOnce() {
  state.animateChips = true;
  render();
  if (state.animateChipsTimer)
    clearTimeout(state.animateChipsTimer);
  state.animateChipsTimer = setTimeout(() => {
    state.animateChips = false;
  }, 400);
}

// Collapsed chips: show as many of the latest projects (up to 3) as fit on one
// line beside the toggle. Measures the rendered chips once and re-renders at
// most once; chipFit is reset to null by anything that changes the chips.
function fitProjectChips() {
  if (state.chipFit != null)
    return;
  const row = document.querySelector(".chips:not(.expanded)");
  if (!row)
    return;
  state.chipFit = 3;
  if (row.scrollWidth <= row.clientWidth + 1)
    return;
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const [allChip, ...projectChips] = row.children;
  let used = allChip.offsetWidth;
  let fit = 0;
  for (const chip of projectChips) {
    used += gap + chip.offsetWidth;
    if (used > row.clientWidth)
      break;
    fit++;
  }
  state.chipFit = Math.max(1, fit);
  render();
}
