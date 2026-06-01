

// Stylesheets
import "../css/fonts.css";
import "../css/variables.css";
import "../css/utils.css";
import "../css/style.css";

// JS modules
import { supabase, db } from "./supabase.js";

/* ============================================================
   STICKY NAVBAR
   Uses IntersectionObserver to toggle .navbar--sticky
   when hero leaves viewport
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
    // rootMargin only accepts px or % — use navbar's actual pixel height
    rootMargin: `-${navbar.offsetHeight}px 0px 0px 0px`,
  },
);

heroObserver.observe(hero);

/* ============================================================
   SYNC SEARCH INPUTS
   Hero search and sticky nav search stay in sync
   ============================================================ */

heroSearch.addEventListener("input", (e) => {
  navSearch.value = e.target.value;
});

navSearch.addEventListener("input", (e) => {
  heroSearch.value = e.target.value;
});

/* ============================================================
   FILTER PILLS
   Active state toggle — actual filtering wired up in cache.js later
   ============================================================ */

const filterPills = document.querySelectorAll(".filter-pill");

filterPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    filterPills.forEach((p) => p.classList.remove("filter-pill--active"));
    pill.classList.add("filter-pill--active");
  });
});

/* ============================================================
   SCROLL FADE-UP ANIMATION
   Observes .art-card elements and adds .is-visible on entry
   ============================================================ */

const cardObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger delay based on card index in viewport batch
        entry.target.style.transitionDelay = `${i * 0.05}s`;
        entry.target.classList.add("is-visible");
        cardObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.3 },
);

// Observe all current cards — re-run this after JS renders real cards
function observeCards() {
  document
    .querySelectorAll(".art-card:not(.art-card--skeleton)")
    .forEach((card) => {
      cardObserver.observe(card);
    });
}

observeCards();


// Export so other modules can call it after rendering new cards
export { observeCards };
