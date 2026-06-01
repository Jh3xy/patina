

import { getColor } from "colorthief";
import { searchCached, updateDominantColor } from "./cache.js";

const MODAL_ID = "artModal";
const FALLBACK_COLOR = "#121212";

let modal = null;
let activeArtwork = null;
let lastFocusedElement = null;

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

function rgbToHex([r, g, b]) {
  return [r, g, b]
    .map((channel) => {
      return Math.round(channel).toString(16).padStart(2, "0");
    })
    .join("")
    .padStart(6, "0")
    .replace(/^/, "#");
}

function hexToRgb(hex) {
  const cleanHex = hex.replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(cleanHex)) {
    return null;
  }

  return [
    parseInt(cleanHex.slice(0, 2), 16),
    parseInt(cleanHex.slice(2, 4), 16),
    parseInt(cleanHex.slice(4, 6), 16),
  ];
}

function darkenRgb([r, g, b]) {
  return [r, g, b].map((channel) => Math.round(channel * 0.35));
}

function rgbCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

function loadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = imageUrl;
  });
}

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
      (normalizedArtwork.source_id && item.source_id === normalizedArtwork.source_id) ||
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
    <section class="art-modal__related" aria-label="More from this artist">
      <h3>More from this artist</h3>
      <div class="art-modal__related-track">${items}</div>
    </section>
  `;
}

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

function setModalBackground(color) {
  const targetModal = ensureModal();
  const rgb = hexToRgb(color) || hexToRgb(FALLBACK_COLOR);
  const darkened = darkenRgb(rgb);

  targetModal.style.setProperty(
    "--modal-gradient",
    `linear-gradient(to bottom, ${rgbCss(darkened)}, ${FALLBACK_COLOR})`,
  );
}

async function applyDominantColor(artwork) {
  if (artwork.dominant_color) {
    setModalBackground(artwork.dominant_color);
    return;
  }

  try {
    const image = await loadImage(artwork.image_url);
    const color = await getColor(image, { quality: 10 });
    const rgb = color?.array?.();

    if (!rgb) {
      setModalBackground(FALLBACK_COLOR);
      return;
    }

    const hex = rgbToHex(rgb);

    setModalBackground(hex);

    if (artwork.id) {
      await updateDominantColor(artwork.id, hex);
    }
  } catch (error) {
    console.warn("Unable to extract dominant artwork color:", error);
    setModalBackground(FALLBACK_COLOR);
  }
}

function renderModal(artwork, relatedArtworks = []) {
  const targetModal = ensureModal();

  targetModal.innerHTML = `
    <div class="art-modal__backdrop" data-modal-close></div>
    <div class="art-modal__panel" tabindex="-1">
      <button class="art-modal__close" type="button" aria-label="Close artwork details" data-modal-close>
        <i data-lucide="x"></i>
      </button>

      <div class="art-modal__content">
        <figure class="art-modal__image-frame">
          <img src="${escapeHtml(artwork.image_url)}" alt="${escapeHtml(artwork.title)}" class="art-modal__image" />
        </figure>

        <div class="art-modal__details">
          <p class="art-modal__source">${escapeHtml(artwork.source || "collection")}</p>
          <h2>${escapeHtml(artwork.title)}</h2>
          <p class="art-modal__artist">${escapeHtml(artwork.artist)}</p>

          <dl class="art-modal__metadata">
            ${renderMetadataItem("Date", artwork.artwork_date)}
            ${renderMetadataItem("Medium", artwork.medium)}
            ${renderMetadataItem("Department", artwork.department)}
          </dl>
        </div>
      </div>

      ${renderRelatedArtworks(relatedArtworks)}
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
  const artwork = await hydrateArtwork(artworkData);
  const relatedArtworks = await getRelatedArtworks(artwork);

  activeArtwork = artwork;
  lastFocusedElement = document.activeElement;

  renderModal(artwork, relatedArtworks);
  setModalBackground(artwork.dominant_color || FALLBACK_COLOR);

  targetModal.classList.add("art-modal--open");
  targetModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-is-open");
  targetModal.querySelector(".art-modal__panel")?.focus();

  applyDominantColor(artwork);
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
