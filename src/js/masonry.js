

import Masonry from "masonry-layout";
import { observeCards } from "./script.js";

const grid = document.getElementById("masonryGrid");
const DEFAULT_GAP = 24;

let masonryInstance = null;
let resizeTimer = null;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getArtworkId(artwork) {
  return artwork.id || artwork.source_id || "";
}

function getArtworkDataFromCard(card) {
  return {
    id: card.dataset.id || "",
    source: card.dataset.source || "",
    source_id: card.dataset.sourceId || "",
    title: card.dataset.title || "",
    artist: card.dataset.artist || "",
    department: card.dataset.department || "",
    medium: card.dataset.medium || "",
    artwork_date: card.dataset.artworkDate || "",
    image_url: card.dataset.imageUrl || "",
    dominant_color: card.dataset.dominantColor || "",
  };
}

function createCardMarkup(artwork) {
  const id = escapeHtml(getArtworkId(artwork));
  const source = escapeHtml(artwork.source);
  const sourceName =
    artwork.source === "met"
      ? "Metropolitan Museum of Art"
      : artwork.source === "aic"
        ? "Art Institute of Chicago"
        : "Unknown Source";
  const sourceId = escapeHtml(artwork.source_id);
  const title = escapeHtml(artwork.title || "Untitled");
  const artist = escapeHtml(artwork.artist || "Unknown artist");
  const department = escapeHtml(artwork.department);
  const medium = escapeHtml(artwork.medium);
  const artworkDate = escapeHtml(artwork.artwork_date);
  const imageUrl = escapeHtml(artwork.image_url);
  const dominantColor = escapeHtml(artwork.dominant_color);

  return `
    <div
      class="art-card"
      data-id="${id}"
      data-source="${source}"
      data-source-id="${sourceId}"
      data-title="${title}"
      data-artist="${artist}"
      data-department="${department}"
      data-medium="${medium}"
      data-artwork-date="${artworkDate}"
      data-image-url="${imageUrl}"
      data-dominant-color="${dominantColor}"
    >
      <div class="art-card__img-wrap">
        <img src="${imageUrl}" alt="${title}" class="art-card__img" loading="lazy" />
        <div class="art-card__overlay">
        <button class="department-badge">${department}</button>
          <i data-lucide="expand"></i>
        </div>
      </div>
      <div class="art-card__info">
      <h3 class="art-card__title">${title}</h3>
      <p class="art-card__source"> Source - ${sourceName}</p>
        <p class="art-card__artist">${artist}</p>
      </div>
    </div>
  `;
}

function renderEmptyState() {
  if (!grid) return;
  grid.innerHTML = '<p class="gallery-empty">No artworks found.</p>';
}

function bindImageLayoutUpdates(elements) {
  if (!grid || !masonryInstance) return;

  const images = elements
    ? elements.querySelectorAll(".art-card__img")
    : grid.querySelectorAll(".art-card__img");

  images.forEach((image) => {
    if (image.complete) {
      masonryInstance.layout();
      return;
    }

    image.addEventListener(
      "load",
      () => {
        masonryInstance?.layout();
      },
      { once: true },
    );
  });
}

function bindGridClickHandler() {
  if (!grid || grid.dataset.clickBound === "true") return;

  grid.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const card = event.target.closest(".art-card:not(.art-card--skeleton)");
    if (!card || !grid.contains(card)) return;

    grid.dispatchEvent(
      new CustomEvent("patina:artwork-select", {
        bubbles: true,
        detail: getArtworkDataFromCard(card),
      }),
    );
  });

  grid.dataset.clickBound = "true";
}

function bindResizeHandler() {
  if (!grid || grid.dataset.resizeBound === "true") return;

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      reinitMasonry();
    }, 150);
  });

  grid.dataset.resizeBound = "true";
}

function destroyMasonry() {
  if (!masonryInstance) return;
  masonryInstance.destroy();
  masonryInstance = null;
}

export function reinitMasonry() {
  if (!grid) return null;

  destroyMasonry();

  masonryInstance = new Masonry(grid, {
    itemSelector: ".art-card:not(.art-card--skeleton)",
    columnWidth: ".grid-sizer",
    gutter: ".gutter-sizer",
    percentPosition: true,
    transitionDuration: "0.25s",
  });

  bindImageLayoutUpdates();
  masonryInstance.layout();

  return masonryInstance;
}

/**
 * Full grid replace — clears everything and renders fresh set.
 * Called on filter change, search, or initial load.
 */
export function renderGrid(artworks = []) {
  if (!grid) return;

  destroyMasonry();

  const visibleArtworks = artworks.filter((artwork) => artwork?.image_url);

  if (!visibleArtworks.length) {
    renderEmptyState();
    return;
  }

  const sizerMarkup = `
    <div class="grid-sizer"></div>
    <div class="gutter-sizer"></div>
  `;

  grid.innerHTML = sizerMarkup + visibleArtworks.map(createCardMarkup).join("");

  bindGridClickHandler();
  bindResizeHandler();
  reinitMasonry();
  observeCards();
  window.lucide?.createIcons();
}

/**
 * Append-only — adds new cards to the existing grid.
 * Called by "Load More". Masonry instance is already running;
 * we stamp in new elements and tell Masonry to pick them up.
 */
export function appendToGrid(artworks = []) {
  if (!grid || !masonryInstance) {
    // Masonry not initialized yet — just do a full render
    renderGrid(artworks);
    return;
  }

  const visibleArtworks = artworks.filter((artwork) => artwork?.image_url);
  if (!visibleArtworks.length) return;

  // Create a fragment, stamp markup into it, collect the elements
  const fragment = document.createDocumentFragment();
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = visibleArtworks.map(createCardMarkup).join("");

  const newCards = Array.from(tempDiv.children);
  newCards.forEach((card) => fragment.appendChild(card));
  grid.appendChild(fragment);

  // Tell Masonry about the new items
  masonryInstance.appended(newCards);
  masonryInstance.layout();

  // Watch new card images for load-triggered relayout
  newCards.forEach((card) => {
    const img = card.querySelector(".art-card__img");
    if (!img) return;
    if (img.complete) {
      masonryInstance?.layout();
    } else {
      img.addEventListener("load", () => masonryInstance?.layout(), {
        once: true,
      });
    }
  });

  observeCards();
  window.lucide?.createIcons();
}
