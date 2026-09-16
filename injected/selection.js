// injected/selection.js - side-panel selection mode
(() => {
  if (globalThis.__opc_selection) {
    try {
      globalThis.__opc_selection.cleanup();
    } catch {}
  }
  const root = document.createElement("div");
  root.id = "__opc_selection_root";
  root.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "pointer-events:none"
  ].join(";");
  const box = document.createElement("div");
  box.style.cssText = [
    "position:fixed",
    "border:2px solid rgba(165,180,252,0.95)",
    "background:rgba(165,180,252,0.18)",
    "box-shadow:0 0 0 1px rgba(0,0,0,0.12)",
    "pointer-events:none",
    "display:none"
  ].join(";");
  root.appendChild(box);
  document.documentElement.appendChild(root);

  const ROLE_BY_TAG = {
    A: "link",
    BUTTON: "button",
    INPUT: "textbox",
    SELECT: "combobox",
    TEXTAREA: "textbox"
  };
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

  let locked = false;
  let done = false;
  function send(payload) {
    try {
      chrome.runtime.sendMessage(payload);
    } catch {}
  }
  function updateHighlight(el) {
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
  function resetHighlightStyle() {
    box.style.borderColor = "rgba(165,180,252,0.95)";
    box.style.background = "rgba(165,180,252,0.18)";
  }
  function onMouseMove(event) {
    if (locked || done)
      return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || root.contains(el))
      return;
    updateHighlight(el);
  }
  function onClick(event) {
    if (locked || done)
      return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || root.contains(el))
      return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    locked = true;
    updateHighlight(el);
    box.style.borderColor = "rgba(74,222,128,0.95)";
    box.style.background = "rgba(74,222,128,0.15)";
    send({
      type: "selection_pick",
      element: describeElement(el),
      viewport: describeViewport()
    });
  }
  function onKeyDown(event) {
    if (event.key !== "Escape" || done)
      return;
    event.preventDefault();
    exit("cancel");
  }
  function onMessage(message, sender, sendResponse) {
    if (!message || typeof message !== "object")
      return;
    if (message.type === "opc_selection_reenter" && !done) {
      locked = false;
      resetHighlightStyle();
      updateHighlight(null);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "opc_selection_exit" && !done) {
      cleanup();
      sendResponse({ ok: true, exited: true });
    }
  }
  function cleanup() {
    if (done)
      return;
    done = true;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {}
    root.remove();
    if (globalThis.__opc_selection === api)
      globalThis.__opc_selection = null;
  }
  function exit(reason) {
    cleanup();
    send({ type: reason === "cancel" ? "selection_cancel" : "selection_exited" });
  }

  chrome.runtime.onMessage.addListener(onMessage);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  const api = { cleanup };
  globalThis.__opc_selection = api;
})();
