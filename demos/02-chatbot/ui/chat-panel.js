export class ChatPanel {
  #container;

  constructor(container) {
    this.#container = container;
  }

  addMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${role}`;
    bubble.textContent = text;
    this.#container.appendChild(bubble);
    this.#container.scrollTop = this.#container.scrollHeight;
  }
}
