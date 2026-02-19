// AI Chatbot JavaScript
// This file handles the chatbot UI interactions
// API integration with Gemini will be added here

class ChatBot {
  constructor() {
    this.fab = document.getElementById("chatbot-fab");
    this.modal = document.getElementById("chatbot-modal");
    this.closeBtn = document.getElementById("chatbot-close");
    this.messagesContainer = document.getElementById("chatbot-messages");
    this.inputField = document.getElementById("chatbot-input");
    this.sendBtn = document.getElementById("chatbot-send");

    this.initializeEventListeners();
  }

  /**
   * Initialize all event listeners for the chatbot
   */
  initializeEventListeners() {
    // Open/Close modal
    this.fab.addEventListener("click", () => this.toggleModal());
    this.closeBtn.addEventListener("click", () => this.closeModal());

    // Send message on button click
    this.sendBtn.addEventListener("click", () => this.sendMessage());

    // Send message on Enter key
    this.inputField.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Close modal on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.modal.classList.contains("hidden")) {
        this.closeModal();
      }
    });
  }

  /**
   * Toggle the chatbot modal visibility
   */
  toggleModal() {
    if (this.modal.classList.contains("hidden")) {
      this.openModal();
    } else {
      this.closeModal();
    }
  }

  /**
   * Open the chatbot modal
   */
  openModal() {
    this.modal.classList.remove("hidden");
    this.inputField.focus();
  }

  /**
   * Close the chatbot modal
   */
  closeModal() {
    this.modal.classList.add("hidden");
  }

  /**
   * Send a message to the chatbot
   */
  async sendMessage() {
    const message = this.inputField.value.trim();

    if (!message) {
      return;
    }

    // Clear input
    this.inputField.value = "";

    // Add user message to chat
    this.addMessageToChat(message, "user");

    // Show loading indicator
    this.showLoadingIndicator();

    try {
      // TODO: Replace this with actual Gemini API call
      // Example of what the API call might look like:
      // const response = await this.callGeminiAPI(message);
      // const botReply = response.text;

      // For now, we'll simulate a response
      const botReply = await this.getBotResponse(message);

      // Remove loading indicator
      this.removeLoadingIndicator();

      // Add bot response to chat
      this.addMessageToChat(botReply, "bot");
    } catch (error) {
      this.removeLoadingIndicator();
      this.addMessageToChat(
        "Sorry, I encountered an error. Please try again.",
        "bot",
      );
      console.error("Chatbot error:", error);
    }
  }

  async getBotResponse(userMessage) {
    const response = await fetch("http://localhost:3000/api/chat/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userMessage,
      }),
    });

    if (!response.ok) {
      throw new Error("Backend error");
    }

    const data = await response.json();
    return data.reply;
  }

  /**
   * Add a message to the chat display
   */
  addMessageToChat(message, sender) {
    const messageElement = document.createElement("div");
    messageElement.className = `chatbot-message ${sender}-message`;

    const contentElement = document.createElement("div");
    contentElement.className = "message-content";
    contentElement.textContent = message;

    messageElement.appendChild(contentElement);
    this.messagesContainer.appendChild(messageElement);

    // Scroll to bottom
    this.scrollToBottom();
  }

  /**
   * Show loading indicator while waiting for bot response
   */
  showLoadingIndicator() {
    const loadingElement = document.createElement("div");
    loadingElement.className = "chatbot-message bot-message";
    loadingElement.id = "chatbot-loading";

    const contentElement = document.createElement("div");
    contentElement.className = "message-content chatbot-loading";
    contentElement.innerHTML = "<span></span><span></span><span></span>";

    loadingElement.appendChild(contentElement);
    this.messagesContainer.appendChild(loadingElement);

    this.scrollToBottom();
  }

  /**
   * Remove loading indicator
   */
  removeLoadingIndicator() {
    const loadingElement = document.getElementById("chatbot-loading");
    if (loadingElement) {
      loadingElement.remove();
    }
  }

  /**
   * Scroll messages container to bottom
   */
  scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 0);
  }

  /**
   * Clear chat history
   */
  clearChat() {
    const messages =
      this.messagesContainer.querySelectorAll(".chatbot-message");
    messages.forEach((msg) => {
      if (!msg.id || msg.id !== "chatbot-loading") {
        msg.remove();
      }
    });
  }

  /**
   * Add initial greeting message
   */
  addGreetingMessage(
    message = "Hi! I'm your AI Assistant. How can I help you today?",
  ) {
    this.addMessageToChat(message, "bot");
  }
}

// Initialize chatbot when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.chatBot = new ChatBot();
});
