// sidepanel-dev.js - chrome-API shim so the side panel UI can be edited on a plain
// localhost server. No-ops when the real extension APIs are present, and stubs a
// fake session + queue so every view renders. Loaded before sidepanel.js in
// sidepanel.html; it is inert in the shipped extension.
(function () {
  if (window.chrome?.runtime?.id)
    return; // running as a real extension - leave the real APIs alone

  const listeners = [];
  let seq = 1;

  const ago = (mins) => Date.now() - mins * 60000;

  const fakeSessions = {
    ok: true,
    context: { host: "127.0.0.1", port: 39240 },
    sessions: [
      // opencode-annotate-extension
      { id: "s1", title: "Fix sticky header on scroll", directory: "/Users/jackevans/Code/tools/opencode-annotate-extension", updatedAt: ago(4) },
      { id: "s2", title: "Refactor session picker into components", directory: "/Users/jackevans/Code/tools/opencode-annotate-extension", updatedAt: ago(38) },
      { id: "s3", title: "Queue send retries + error copy", directory: "/Users/jackevans/Code/tools/opencode-annotate-extension", updatedAt: ago(190) },
      // creator-list
      { id: "s6", title: "Ship 1.5.0: side panel rebuild", directory: "/Users/jackevans/Code/creator-list", updatedAt: ago(12) },
      { id: "s7", title: "Staging migration broke RLS policy", directory: "/Users/jackevans/Code/creator-list", updatedAt: ago(95) },
      { id: "s8", title: "Stripe webhook duplicate events", directory: "/Users/jackevans/Code/creator-list", updatedAt: ago(2600) },
      // jacks-seo
      { id: "s9", title: "Rewrite landing hero copy", directory: "/Users/jackevans/Code/jacks-seo", updatedAt: ago(55) },
      { id: "s10", title: "Keyword research: pSEO cluster", directory: "/Users/jackevans/Code/jacks-seo", updatedAt: ago(4300) },
      // acme-site
      { id: "s12", title: "Client feedback round 2", directory: "/Users/jackevans/Code/clients/acme-site", updatedAt: ago(18) },
      { id: "s13", title: "Hero video autoplay on iOS", directory: "/Users/jackevans/Code/clients/acme-site", updatedAt: ago(700) },
      // northwind-dashboard
      { id: "s14", title: "Chart tooltips cut off on mobile", directory: "/Users/jackevans/Code/clients/northwind-dashboard", updatedAt: ago(27) },
      { id: "s15", title: "CSV export drops timezone", directory: "/Users/jackevans/Code/clients/northwind-dashboard", updatedAt: ago(900) },
      { id: "s16", title: "Migrate charts off the old lib", directory: "/Users/jackevans/Code/clients/northwind-dashboard", updatedAt: ago(5200) },
      // sideproject
      { id: "s17", title: "Weekly digest email layout", directory: "/Users/jackevans/Code/personal/sideproject", updatedAt: ago(150) },
      // infra-terraform
      { id: "s18", title: "Add staging VPC peering", directory: "/Users/jackevans/Code/ops/infra-terraform", updatedAt: ago(320) },
      { id: "s19", title: "Rotate the leaked API token", directory: "/Users/jackevans/Code/ops/infra-terraform", updatedAt: ago(72) },
      // rag-lab
      { id: "s20", title: "Chunking strategy comparison", directory: "/Users/jackevans/Code/experiments/rag-lab", updatedAt: ago(1100) },
      { id: "s21", title: "Eval harness for retrieval", directory: "/Users/jackevans/Code/experiments/rag-lab", updatedAt: ago(8600) },
      // handbook
      { id: "s22", title: "Onboarding checklist rewrite", directory: "/Users/jackevans/Code/docs/handbook", updatedAt: ago(2400) }
    ]
  };

  const fakeState = {
    ok: true,
    tab: { id: 1, url: "https://example.com/pricing", title: "Pricing - Example" },
    claim: null, // null = session picker view; set by connect_tab_to_session
    queue: [],
    history: [],
    selection: null,
    settingsOpen: false
  };

  const responses = {
    panel_get_state: () => fakeState,
    refresh_sessions: () => fakeSessions,
    connect_tab_to_session: (message) => {
      const session = fakeSessions.sessions.find((s) => s.id === message?.session?.id);
      if (session) {
        fakeState.claim = { sessionId: session.id, sessionLabel: session.title, session };
        fakeState.queue = [
          {
            id: "dev-queue-1",
            comment: "The pricing card jumps when the billing toggle switches. Keep the height fixed so the CTA doesn't move.",
            tag: "section",
            selector: "#pricing .pricing-grid"
          },
          {
            id: "dev-queue-2",
            comment: "This CTA reads 'Start free trial' but goes to a signup form asking for a card. Either rename it or link it to the email-only signup.",
            tag: "button",
            selector: "#pricing .cta-primary"
          },
          {
            id: "dev-queue-3",
            comment: "Contrast on the footnote text is too low against the gray background - hard to read on an outdoor screen.",
            tag: "p",
            selector: "#pricing .footnote"
          }
        ];
        fakeState.selection = {
          phase: "locked",
          element: {
            tag: "button",
            selector: "#pricing .cta-primary",
            text: "Start free trial",
            role: "button",
            ariaLabel: "Start free trial",
            bounds: { x: 640, y: 420, width: 180, height: 44 }
          }
        };
      }
      return { ok: Boolean(session) };
    },
    close_session: (message) => {
      fakeSessions.sessions = fakeSessions.sessions.filter((s) => s.id !== message?.sessionId);
      return { ok: true };
    },
    panel_start_annotation: () => ({ ok: true }),
    panel_cancel_selection: () => ({ ok: true, selection: null }),
    panel_reselect_element: () => ({ ok: true }),
    panel_submit_annotation: (message) => {
      if (message?.comment) {
        fakeState.queue.push({
          id: `dev-queue-${seq++}`,
          comment: message.comment,
          tag: fakeState.selection?.element?.tag || "",
          selector: fakeState.selection?.element?.selector || ""
        });
        fakeState.selection = null;
      }
      return { ok: true };
    },
    clear_queue: () => {
      fakeState.queue = [];
      return { ok: true };
    },
    remove_queued_annotation: (message) => {
      fakeState.queue = fakeState.queue.filter((entry) => entry.id !== message?.id);
      return { ok: true };
    },
    send_queued_annotations: () => ({ ok: true, sent: fakeState.queue.length, failed: 0 }),
    disconnect_tab: () => {
      fakeState.claim = null;
      fakeState.queue = [];
      fakeState.selection = null;
      return { ok: true };
    },
    get_queue_for_copy: () => ({ ok: true, text: "" })
  };

  const runtime = {
    id: "dev-preview",
    onMessage: {
      addListener: (fn) => listeners.push(fn)
    },
    sendMessage: async (message) => {
      const handler = responses[message?.type];
      const response = handler ? handler(message) : { ok: true };
      // The real background broadcasts state changes; emulate that so the
      // panel refreshes after connect/disconnect/queue mutations.
      if (["connect_tab_to_session", "disconnect_tab", "panel_submit_annotation", "clear_queue", "remove_queued_annotation", "send_queued_annotations", "close_session", "panel_cancel_selection"].includes(message?.type))
        setTimeout(() => listeners.forEach((fn) => fn({ type: "panel_state_changed" })), 0);
      return response;
    }
  };

  const windows = {
    getCurrent: async () => ({ id: 1 })
  };

  const tabs = {
    query: async () => [fakeState.tab],
    onActivated: { addListener: () => {} }
  };

  const permissions = {
    contains: async () => true,
    request: async () => true
  };

  window.chrome = { runtime, windows, tabs, permissions };
})();
