// Stylesheets
import "../css/fonts.css";
import "../css/variables.css";
import "../css/utils.css";
import "../css/style.css";

// JS modules
import { supabase, db } from "./supabase.js";
import {
  getCachedArtworks,
  searchCached,
  getByDepartmentCached,
} from "./cache.js";
import { renderGrid, appendToGrid, renderSkeletons } from "./masonry.js";
import "./modal.js";

/* ============================================================
   STATE
   Tracks current filter + page so "Load More" knows
   what to fetch next
   ============================================================ */

const state = {
  currentFilter: "all", // "all" | dept key
  currentQuery: "", // search string
  currentPage: 0,
  hasMore: false,
  isLoading: false,
};

let currentSearchId = 0;

/* ============================================================
   STICKY NAVBAR
   ============================================================ */

const navbar = document.getElementById("navbar");
const hero = document.getElementById("hero");
const heroSearch = document.getElementById("heroSearch");
const navSearch = document.getElementById("navSearch");

const heroObserver = new IntersectionObserver(
  ([entry]) => {
    navbar.classList.toggle("navbar--sticky", !entry.isIntersecting);
  },
  {
    threshold: 0,
    rootMargin: `-${navbar.offsetHeight}px 0px 0px 0px`,
  },
);

heroObserver.observe(hero);

/* ============================================================
   SYNC SEARCH INPUTS
   ============================================================ */

heroSearch.addEventListener("input", (e) => {
  navSearch.value = e.target.value;
});

navSearch.addEventListener("input", (e) => {
  heroSearch.value = e.target.value;
});

/* ============================================================
   LOAD MORE BUTTON
   Injected below the masonry grid, shown/hidden based on state
   ============================================================ */

function getOrCreateLoadMoreBtn() {
  let footer = document.querySelector(".gallery-footer");
  if (!footer) {
    footer = document.createElement("div");
    footer.className = "gallery-footer";
    const gallery = document.getElementById("gallery");
    gallery?.appendChild(footer);
  }

  let btn = footer.querySelector(".load-more-btn");
  if (!btn) {
    btn = document.createElement("button");
    btn.className = "load-more-btn";
    btn.type = "button";
    btn.textContent = "Load more";
    btn.addEventListener("click", loadNextPage);
    footer.appendChild(btn);
  }

  return btn;
}

function updateLoadMoreBtn() {
  const btn = getOrCreateLoadMoreBtn();
  btn.style.display = state.hasMore ? "inline-flex" : "none";
  btn.disabled = state.isLoading;
  btn.textContent = state.isLoading ? "Loading…" : "Load more";
}

/* ============================================================
   FETCH HELPERS
   All reads go through cache — API is only hit on cache miss
   ============================================================ */

async function fetchPage(page) {
  if (state.currentQuery) {
    // Search ignores pagination — returns all matches at once
    const artworks = await searchCached(state.currentQuery);
    return { artworks, hasMore: false };
  }

  if (state.currentFilter === "all") {
    return getCachedArtworks(page);
  }

  return getByDepartmentCached(state.currentFilter, page);
}

/* ============================================================
   INITIAL LOAD & FILTER RESET
   Always resets to page 0 and replaces the grid
   ============================================================ */

async function loadFresh() {
  currentSearchId += 1;
  const thisSearchId = currentSearchId;

  state.isLoading = true;
  state.currentPage = 0;
  updateLoadMoreBtn();
  renderSkeletons();

  try {
    const result = await fetchPage(0);
    if (thisSearchId !== currentSearchId) return;

    state.hasMore = result.hasMore ?? false;
    renderGrid(result.artworks);
  } catch (err) {
    if (thisSearchId === currentSearchId) {
      console.error("Failed to load artworks:", err);
    }
  } finally {
    if (thisSearchId === currentSearchId) {
      state.isLoading = false;
      updateLoadMoreBtn();
    }
  }
}

/* ============================================================
   LOAD NEXT PAGE
   Appends cards to the existing grid
   ============================================================ */

async function loadNextPage() {
  if (state.isLoading || !state.hasMore) return;

  state.isLoading = true;
  state.currentPage += 1;
  updateLoadMoreBtn();

  try {
    const result = await fetchPage(state.currentPage);
    state.hasMore = result.hasMore ?? false;
    appendToGrid(result.artworks);
  } catch (err) {
    console.error("Failed to load next page:", err);
    state.currentPage -= 1; // rollback on failure
  } finally {
    state.isLoading = false;
    updateLoadMoreBtn();
  }
}

/* ============================================================
   FILTER PILLS
   ============================================================ */

const filterPills = document.querySelectorAll(".filter-pill");

filterPills.forEach((pill) => {
  pill.addEventListener("click", async () => {
    filterPills.forEach((p) => p.classList.remove("filter-pill--active"));
    pill.classList.add("filter-pill--active");

    state.currentFilter = pill.getAttribute("data-filter") || "all";
    state.currentQuery = ""; // clear any active search
    heroSearch.value = "";
    navSearch.value = "";

    await loadFresh();
  });
});

/* ============================================================
   SEARCH WIRING — debounced
   ============================================================ */

let searchTimeout;

function handleSearchInput(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    state.currentQuery = query;
    state.currentFilter = "all";
    // Reset active pill to All
    filterPills.forEach((p) => p.classList.remove("filter-pill--active"));
    document
      .querySelector('[data-filter="all"]')
      ?.classList.add("filter-pill--active");

    await loadFresh();
  }, 250);
}

heroSearch.addEventListener("input", (e) => {
  navSearch.value = e.target.value;
  handleSearchInput(e.target.value.trim());
});

navSearch.addEventListener("input", (e) => {
  heroSearch.value = e.target.value;
  handleSearchInput(e.target.value.trim());
});

/* ============================================================
   SCROLL FADE-UP ANIMATION
   ============================================================ */

const cardObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        entry.target.style.transitionDelay = `${i * 0.05}s`;
        entry.target.classList.add("is-visible");
        cardObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }, // lowered slightly — cards trigger sooner on scroll
);

export function observeCards() {
  document
    .querySelectorAll(".art-card:not(.art-card--skeleton)")
    .forEach((card) => {
      if (!card.classList.contains("is-visible")) {
        cardObserver.observe(card);
      }
    });
}

/* ============================================================
   SCROLL-TO-TOP BUTTON
   ============================================================ */

function createScrollTopButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "scroll-top";
  btn.setAttribute("aria-label", "Scroll to top");
  btn.innerHTML = '<i data-lucide="arrow-up"></i>';

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.body.appendChild(btn);
  window.lucide?.createIcons();

  const threshold = () => (hero ? hero.offsetHeight : window.innerHeight / 2);

  function updateVisibility() {
    const btnEl = document.querySelector(".scroll-top");
    if (!btnEl) return;
    btnEl.classList.toggle("is-visible", window.scrollY > threshold());
  }

  window.addEventListener("scroll", updateVisibility, { passive: true });
  window.addEventListener("resize", updateVisibility);
  updateVisibility();
}

createScrollTopButton();

/* ============================================================
   INITIAL DATA LOAD
   ============================================================ */

(async () => {
  try {
    const result = await getCachedArtworks(0);
    state.hasMore = result.hasMore ?? false;
    renderGrid(result.artworks);
    updateLoadMoreBtn();
  } catch (err) {
    console.error("Failed to load featured artworks:", err);
  }
})();

let toggleBtn;

function initThemeToggle() {
  // Query the toggle button after DOM is ready
  toggleBtn = document.getElementById("themeToggle");

  // Set initial theme state
  const savedTheme = localStorage.getItem("patina-theme");
  const systemPrefersLight = window.matchMedia(
    "(prefers-color-scheme: light)",
  ).matches;

  // Set isLight to true if light is saved to storage or if system default theme is light
  const isLight = savedTheme === "light" || (!savedTheme && systemPrefersLight);

  // Apply theme state cleanly to the DOM root immediately and keep an explicit
  // `dark` class so the body always reflects the active theme in devtools.
  if (isLight) {
    document.body.classList.add("light");
    document.body.classList.remove("dark");
    updateToggleIcon("light");
  } else {
    document.body.classList.add("dark");
    document.body.classList.remove("light");
    updateToggleIcon("dark");
  }

  // Attach click handler to the button now that it exists. Guard to avoid duplicate listeners.
  if (toggleBtn && !toggleBtn.dataset.themeListenerAdded) {
    toggleBtn.addEventListener("click", () => {
      // Toggle light; ensure we always set an explicit class for the opposite theme
      const nowLight = document.body.classList.toggle("light");

      if (nowLight) {
        document.body.classList.remove("dark");
        localStorage.setItem("patina-theme", "light");
        updateToggleIcon("light");
      } else {
        document.body.classList.add("dark");
        document.body.classList.remove("light");
        localStorage.setItem("patina-theme", "dark");
        updateToggleIcon("dark");
      }
    });
    toggleBtn.dataset.themeListenerAdded = "1";
  }
}

//Dynamic Icon Assembly & Asset Refresh Lifecycle
function updateToggleIcon(theme) {
  // show 'moon' if theme is light
  if (theme === "light") {
    toggleBtn.innerHTML = '<i data-lucide="moon"></i>';
  } else {
    toggleBtn.innerHTML = '<i data-lucide="sun"></i>';
  }

  // refresh lucide icons to apply the new icon
  window.lucide?.createIcons();
}

// Invoke during runtime setup execution sequence
document.addEventListener("DOMContentLoaded", initThemeToggle);
