import { DebugPanel } from "../../shared/ui/debug-panel.js";
import { ChatPanel } from "./ui/chat-panel.js";

// Placeholder — replace with real runtime import once `make runtime` has been run:
// import { createRuntime } from "../../shared/viv-runtime.js";

const debug = new DebugPanel();
const chat = new ChatPanel(document.getElementById("chat-messages"));

const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  chat.addMessage("user", text);
  debug.logEvent(`user: ${text}`);
  // TODO: send to viv runtime and receive agent response via event callback.
});
