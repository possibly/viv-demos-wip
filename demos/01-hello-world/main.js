import { DebugPanel } from "../../shared/ui/debug-panel.js";

// Placeholder — replace with real runtime import once `make runtime` has been run:
// import { createRuntime } from "../../shared/viv-runtime.js";

const output = document.getElementById("output");
const debug = new DebugPanel();

function appendEvent(text) {
  const el = document.createElement("div");
  el.className = "event";
  el.textContent = text;
  output.appendChild(el);
  debug.logEvent(text);
}

// TODO: load bundle.json, create runtime, wire up event callbacks.
// See viv/examples/hello-viv-browser/ for the host app pattern.
appendEvent("(runtime not yet wired up — see main.js)");
