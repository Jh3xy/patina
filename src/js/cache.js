

import { db } from "./supabase.js";
import { fetchFeatured, searchArtworks, fetchByDepartment } from "./api.js";

const PAGE_SIZE = 24; // how many items to show per page/load

/**
 * Persists a collection of normalized artworks to the Supabase cache layer.
 * Uses upsert with onConflict targeting source_id to prevent duplicate rows.
 */
async function saveToCache(artworks) {
  if (!artworks || artworks.length === 0) return [];

  const rowsToInsert = artworks.map((art) => ({
    title: art.title,
    artist: art.artist,
    department: art.department,
    medium: art.medium,
    artwork_date: art.artwork_date,
    image_url: art.image_url,
    source: art.source,
    source_id: art.source_id,
    cached_at: new Date().toISOString(),
  }));

  const { data, error } = await db
    .from("artworks")
    .upsert(rowsToInsert, { onConflict: "source_id" })
    .select();

  if (error) {
    console.error(
      "Failed writing artwork batch rows to Supabase cache:",
      error,
    );
    return artworks; // fallback to raw API objects on error
  }

  return data;
}

/**
 * Fetches a page of artworks from the cache.
 * @param {number} page - 0-indexed page number
 * @returns {Promise<{ artworks: Array, hasMore: boolean }>}
 */
export async function getCachedArtworks(page = 0) {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  try {
    const {
      data: cachedItems,
      error,
      count,
    } = await db
      .from("artworks")
      .select("*", { count: "exact" })
      .order("id", { ascending: true })
      .range(from, to);

    if (!error && cachedItems && cachedItems.length > 0) {
      const totalCount = count ?? cachedItems.length;
      return {
        artworks: cachedItems,
        hasMore: from + cachedItems.length < totalCount,
        total: totalCount,
      };
    }

    // Cache miss on first page — fetch fresh and populate
    if (page === 0) {
      const freshArtworks = await fetchFeatured();
      const saved = await saveToCache(freshArtworks);
      return {
        artworks: saved.slice(0, PAGE_SIZE),
        hasMore: saved.length > PAGE_SIZE,
        total: saved.length,
      };
    }

    return { artworks: [], hasMore: false, total: 0 };
  } catch (err) {
    console.error("Error in getCachedArtworks:", err);
    return { artworks: [], hasMore: false, total: 0 };
  }
}

/**
 * Searches the cache, falls back to API on miss.
 * Always returns all matches up to 60 for search results
 * (search is intentional — user wants to see everything relevant).
 * @param {string} query
 * @param {number} limit
 */
export async function searchCached(query, limit = 60) {
  if (!query || !query.trim()) {
    const result = await getCachedArtworks(0);
    return result.artworks;
  }

  const cleanQuery = query.trim();

  try {
    const { data: cachedResults, error } = await db
      .from("artworks")
      .select("*")
      .or(
        `title.ilike.%${cleanQuery}%,artist.ilike.%${cleanQuery}%,department.ilike.%${cleanQuery}%`,
      )
      .limit(limit);

    if (!error && cachedResults && cachedResults.length > 0) {
      return cachedResults;
    }

    const freshResults = await searchArtworks(cleanQuery);
    return await saveToCache(freshResults);
  } catch (err) {
    console.error(`Error in searchCached for "${cleanQuery}":`, err);
    return [];
  }
}

/**
 * Fetches artworks by department/filter, with pagination.
 * Tries cache first, falls back to API.
 * @param {string} dept - filter key e.g. "paintings", "impressionism"
 * @param {number} page - 0-indexed page
 */
export async function getByDepartmentCached(dept, page = 0) {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  try {
    const {
      data: cachedItems,
      error,
      count,
    } = await db
      .from("artworks")
      .select("*", { count: "exact" })
      .ilike("department", `%${dept}%`)
      .order("id", { ascending: true })
      .range(from, to);

    if (!error && cachedItems && cachedItems.length > 0) {
      const totalCount = count ?? cachedItems.length;
      return {
        artworks: cachedItems,
        hasMore: from + cachedItems.length < totalCount,
        total: totalCount,
      };
    }

    // Cache miss — fetch from API and save
    const freshResults = await fetchByDepartment(dept);
    const saved = await saveToCache(freshResults);
    const slice = saved.slice(from, to + 1);

    return {
      artworks: slice,
      hasMore: from + slice.length < saved.length,
      total: saved.length,
    };
  } catch (err) {
    console.error(`Error in getByDepartmentCached for "${dept}":`, err);
    return { artworks: [], hasMore: false, total: 0 };
  }
}

/**
 * Persists the extracted dominant color hex code back to the database row.
 * Still exported but no longer called from modal.js — kept for future use
 * if you ever add server-side color extraction.
 */
export async function updateDominantColor(id, hex) {
  if (!id || !hex) return false;

  const { error } = await db
    .from("artworks")
    .update({ dominant_color: hex })
    .eq("id", id);

  if (error) {
    console.error(`Failed writing dominant color for artwork ID ${id}:`, error);
    return false;
  }

  return true;
}

