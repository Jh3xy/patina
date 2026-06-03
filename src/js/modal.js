import { searchCached, updateDominantColor } from "./cache.js";

const MODAL_ID = "artModal";
const FALLBACK_COLOR = "#121212";
const COLLECTION_LABELS = {
  met: "Metropolitan Museum of Art",
  aic: "Art Institute of Chicago",
};

let modal = null;
let activeArtwork = null;
let lastFocusedElement = null;
let chatHistory = [];

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeArtwork(artwork = {}) {
  return {
    id: artwork.id || "",
    source: artwork.source || "",
    source_id: artwork.source_id || "",
    title: artwork.title || "Untitled",
    artist: artwork.artist || "Unknown artist",
    department: artwork.department || "",
    medium: artwork.medium || "",
    artwork_date: artwork.artwork_date || "",
    image_url: artwork.image_url || "",
    dominant_color: artwork.dominant_color || "",
  };
}

function getCollectionLabel(source) {
  return COLLECTION_LABELS[source] || "Museum collection";
}

// ---------------------------------------------------------------------------
// DOMINANT COLOR — CSS-only approach, zero CORS issues
//
// Instead of ColourThief's canvas pixel sampling (which breaks on cross-origin
// images even with crossOrigin="anonymous" when the server doesn't echo the
// right headers), we render the artwork image as a blurred, darkened CSS
// background. Same visual effect, no security errors.
// ---------------------------------------------------------------------------

function setModalBackground(imageUrl, storedHex) {
  const targetModal = ensureModal();

  if (storedHex && storedHex !== FALLBACK_COLOR) {
    // We already know the color — use it directly
    targetModal.style.setProperty("--modal-bg-color", storedHex);
    targetModal.style.setProperty("--modal-bg-image", "none");
  } else if (imageUrl) {
    // Use the artwork itself as a blurred backdrop — looks great, no CORS
    targetModal.style.setProperty("--modal-bg-color", FALLBACK_COLOR);
    targetModal.style.setProperty("--modal-bg-image", `url(${imageUrl})`);
  } else {
    targetModal.style.setProperty("--modal-bg-color", FALLBACK_COLOR);
    targetModal.style.setProperty("--modal-bg-image", "none");
  }
}

// ---------------------------------------------------------------------------
// HYDRATION — fills in missing metadata from cache
// ---------------------------------------------------------------------------

async function hydrateArtwork(artwork) {
  const normalizedArtwork = normalizeArtwork(artwork);

  if (
    normalizedArtwork.department &&
    normalizedArtwork.medium &&
    normalizedArtwork.artwork_date
  ) {
    return normalizedArtwork;
  }

  const query = normalizedArtwork.title || normalizedArtwork.artist;

  if (!query) {
    return normalizedArtwork;
  }

  const cachedMatches = await searchCached(query);
  const cachedArtwork = cachedMatches.find((item) => {
    return (
      (normalizedArtwork.source_id &&
        item.source_id === normalizedArtwork.source_id) ||
      (normalizedArtwork.id && String(item.id) === String(normalizedArtwork.id))
    );
  });

  return normalizeArtwork(cachedArtwork || normalizedArtwork);
}

async function getRelatedArtworks(artwork) {
  if (!artwork.artist || artwork.artist === "Unknown artist") {
    return [];
  }

  const related = await searchCached(artwork.artist);

  return related
    .filter((item) => item.image_url)
    .filter((item) => item.source_id !== artwork.source_id)
    .slice(0, 8)
    .map(normalizeArtwork);
}

// ---------------------------------------------------------------------------
// RENDER HELPERS
// ---------------------------------------------------------------------------

function renderMetadataItem(label, value) {
  if (!value) {
    return "";
  }

  return `
    <div class="art-modal__meta-item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderArtworkNote(artwork) {
  const collection = getCollectionLabel(artwork.source);
  const details = [artwork.artwork_date, artwork.medium, artwork.department]
    .filter(Boolean)
    .join(" / ");

  return `
    <section class="art-modal__note">
      <p>
        ${escapeHtml(artwork.title)} is shown from the ${escapeHtml(collection)} record${details ? `, with available details listed as ${escapeHtml(details)}` : ""}.
      </p>
    </section>
  `;
}

function renderCuratorPanel(artwork) {
  const title = artwork.title || "this work";
  const mediumQuestion = artwork.medium
    ? `How does the medium shape ${title}?`
    : `What should I notice first in ${title}?`;
  const departmentQuestion = artwork.department
    ? `What does ${artwork.department} tell us about this work?`
    : `What themes appear in ${title}?`;

  return `
    <section class="art-modal__curator" aria-label="Curator chat">
      <div class="art-modal__curator-header">
        <span><i data-lucide="sparkles"></i> Curator's Bureau (AI)</span>
        <span class="art-modal__status-dot" aria-hidden="true"></span>
      </div>
      <div class="art-modal__curator-body">
        <div class="art-modal__curator-message">
          <p>I can help explore ${escapeHtml(title)} through its beauty, symbolism, technique, and historical context.</p>
        </div>
        <div class="art-modal__chat-log" aria-live="polite"></div>
        <div class="art-modal__inquiries">
          <p>Suggested inquiries</p>
          <button type="button">${escapeHtml(`What is the story behind ${title}?`)}</button>
          <button type="button">${escapeHtml(mediumQuestion)}</button>
          <button type="button">${escapeHtml(departmentQuestion)}</button>
        </div>
        <form class="art-modal__ask" aria-label="Ask the curator">
          <input type="text" placeholder="Ask the Curator about this masterpiece..." />
          <button type="submit" aria-label="Send curator question" disabled>
            <i data-lucide="send"></i>
          </button>
        </form>
      </div>
    </section>
  `;
}

function createChatBubble(text, role) {
  const row = document.createElement("div");
  row.className = `art-modal__chat-row art-modal__chat-row--${role}`;
  row.style.display = "flex";
  row.style.justifyContent = role === "user" ? "flex-end" : "flex-start";
  row.style.marginBottom = "0.75rem";

  const bubble = document.createElement("div");
  bubble.className = `art-modal__chat-bubble art-modal__chat-bubble--${role}`;
  bubble.textContent = text;
  bubble.style.maxWidth = "80%";
  bubble.style.padding = "0.85rem 1rem";
  bubble.style.borderRadius = "1rem";
  bubble.style.background =
    role === "user" ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)";
  bubble.style.color = "#fff";
  bubble.style.whiteSpace = "pre-wrap";
  bubble.style.wordBreak = "break-word";

  row.appendChild(bubble);
  return row;
}

function createTypingIndicator() {
  const row = document.createElement("div");
  row.className = "art-modal__chat-row art-modal__chat-row--typing";
  row.style.display = "flex";
  row.style.justifyContent = "flex-start";
  row.style.marginBottom = "0.75rem";

  const indicator = document.createElement("div");
  indicator.className = "art-modal__chat-typing";
  indicator.textContent = "Curator is typing...";
  indicator.style.padding = "0.75rem 1rem";
  indicator.style.borderRadius = "1rem";
  indicator.style.background = "rgba(255,255,255,0.08)";
  indicator.style.color = "#e8e8e8";
  indicator.style.fontStyle = "italic";

  row.appendChild(indicator);
  return row;
}

function scrollChatToBottom(chatLog) {
  if (!chatLog) {
    return;
  }

  chatLog.scrollTo({
    top: chatLog.scrollHeight,
    behavior: "smooth",
  });
}

function initCuratorChat(artwork) {
  const targetModal = ensureModal();
  const chatLog = targetModal.querySelector(".art-modal__chat-log");
  const form = targetModal.querySelector(".art-modal__ask");
  const input = form?.querySelector("input");
  const button = form?.querySelector("button[type='submit']");

  if (!form || !input || !button || !chatLog) {
    return;
  }

  button.disabled = true;

  input.addEventListener("input", () => {
    button.disabled = !input.value.trim();
  });

  targetModal
    .querySelectorAll(".art-modal__inquiries button")
    .forEach((suggestionButton) => {
      suggestionButton.addEventListener("click", () => {
        const buttonText = suggestionButton.textContent?.trim();

        if (!buttonText) {
          return;
        }

        input.value = buttonText;
        button.disabled = false;
        form.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true }),
        );
      });
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // input.value = '';~

    const messageText = input.value.trim();
    if (!messageText) {
      return;
    }

    const inquiries = targetModal.querySelector(".art-modal__inquiries");
    if (inquiries) {
      inquiries.remove();
    }

    const userRow = createChatBubble(messageText, "user");
    chatLog.appendChild(userRow);
    chatHistory.push({ role: "user", content: messageText });

    const typingIndicator = createTypingIndicator();
    chatLog.appendChild(typingIndicator);
    scrollChatToBottom(chatLog);

    input.disabled = true;
    button.disabled = true;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: messageText,
          history: chatHistory,
          activeArtwork: artwork,
        }),
      });

      const payload = await response.json();
      const aiText =
        typeof payload?.text === "string"
          ? payload.text
          : "I’ didn't get that, please try again.";

      if (typingIndicator.parentNode) {
        typingIndicator.remove();
      }

      const aiRow = createChatBubble(aiText, "assistant");
      chatLog.appendChild(aiRow);
      chatHistory.push({ role: "assistant", content: aiText });
    } catch (error) {
      if (typingIndicator.parentNode) {
        typingIndicator.remove();
      }

      const errorRow = createChatBubble(
        "Something went wrong while I was responding. Pleas try again in a moment.",
        "assistant",
      );
      chatLog.appendChild(errorRow);
    } finally {
      input.value = "";
      input.disabled = false;
      button.disabled = true;
      input.focus();
      scrollChatToBottom(chatLog);
    }
  });
}

function renderRelatedArtworks(artworks) {
  if (!artworks.length) {
    return "";
  }

  const items = artworks
    .map((artwork) => {
      return `
        <button class="art-modal__related-card" type="button" data-source-id="${escapeHtml(artwork.source_id)}">
          <img src="${escapeHtml(artwork.image_url)}" alt="${escapeHtml(artwork.title)}" loading="lazy" />
          <span>${escapeHtml(artwork.title)}</span>
        </button>
      `;
    })
    .join("");

  return `
    <section class="art-modal__related" aria-label="Suggested masterpieces">
      <h3><i data-lucide="compass"></i> Suggested Masterpieces</h3>
      <div class="art-modal__related-track">${items}</div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// MODAL LIFECYCLE
// ---------------------------------------------------------------------------

function ensureModal() {
  if (modal) {
    return modal;
  }

  modal = document.getElementById(MODAL_ID);

  if (!modal) {
    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "art-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
  }

  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest("[data-modal-close]")) {
      closeModal();
      return;
    }

    const relatedCard = event.target.closest(".art-modal__related-card");

    if (relatedCard) {
      const sourceId = relatedCard.getAttribute("data-source-id");
      openRelatedArtwork(sourceId);
    }
  });

  return modal;
}

function renderModal(artwork, relatedArtworks = []) {
  const targetModal = ensureModal();
  const collection = getCollectionLabel(artwork.source);
  const context = [artwork.department, collection].filter(Boolean).join(" / ");

  targetModal.innerHTML = `
  <div class="art-modal__panel" tabindex="-1">
  <button class="art-modal__close" type="button" aria-label="Close artwork details" data-modal-close>
  <i data-lucide="x"></i>
  </button>
  
  <div class="art-modal__layout">
  <aside class="art-modal__visual">
  <figure class="art-modal__image-frame">
  <img src="${escapeHtml(artwork.image_url)}" alt="${escapeHtml(artwork.title)}" class="art-modal__image" />
  </figure>
  <p class="art-modal__caption">${escapeHtml(artwork.title)} displayed under museum lighting</p>
  <div class="art-modal__backdrop" data-modal-close></div>
        </aside>

        <div class="art-modal__narrative">
          <div class="art-modal__details">
            <p class="art-modal__source">${escapeHtml(context || "collection")}</p>
            <h2>${escapeHtml(artwork.title)}</h2>
            <p class="art-modal__artist">${escapeHtml(artwork.artist)}</p>

            <dl class="art-modal__metadata">
              ${renderMetadataItem("Date Created", artwork.artwork_date)}
              ${renderMetadataItem("Medium", artwork.medium)}
              ${renderMetadataItem("Department", artwork.department)}
              ${renderMetadataItem("Collection", collection)}
            </dl>

            ${renderArtworkNote(artwork)}
            ${renderCuratorPanel(artwork)}
            ${renderRelatedArtworks(relatedArtworks)}
          </div>
        </div>
      </div>
    </div>
  `;

  window.lucide?.createIcons();
}

async function openRelatedArtwork(sourceId) {
  if (!sourceId || !activeArtwork?.artist) {
    return;
  }

  const matches = await searchCached(activeArtwork.artist);
  const relatedArtwork = matches.find((item) => item.source_id === sourceId);

  if (relatedArtwork) {
    openModal(relatedArtwork);
  }
}

export async function openModal(artworkData) {
  const targetModal = ensureModal();
  chatHistory = [];

  const artwork = await hydrateArtwork(artworkData);
  const relatedArtworks = await getRelatedArtworks(artwork);

  activeArtwork = artwork;
  lastFocusedElement = document.activeElement;

  renderModal(artwork, relatedArtworks);
  initCuratorChat(artwork);

  // Apply background — CSS-only, no canvas, no CORS
  setModalBackground(artwork.image_url, artwork.dominant_color);

  targetModal.classList.add("art-modal--open");
  targetModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-is-open");
  targetModal.querySelector(".art-modal__panel")?.focus();
}

export function closeModal() {
  const targetModal = ensureModal();

  targetModal.classList.remove("art-modal--open");
  targetModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-is-open");
  activeArtwork = null;

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

document.addEventListener("patina:artwork-select", (event) => {
  openModal(event.detail);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal?.classList.contains("art-modal--open")) {
    closeModal();
  }
});
