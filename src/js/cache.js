

import { db } from './supabase.js';
import { fetchFeatured, searchArtworks, fetchByDepartment } from './api.js';

/**
 * Persists a collection of normalized artworks to the Supabase cache layer
 * Uses upsert with onConflict targeting source_id to prevent duplicate rows
 * @param {Array<Object>} artworks - Unified artwork items from api.js
 * @returns {Promise<Array<Object>>} The records as saved in the database
 */
async function saveToCache(artworks) {
  if (!artworks || artworks.length === 0) return [];

  // Prepare objects for database schema insertion fields
  const rowsToInsert = artworks.map(art => ({
    title: art.title,
    artist: art.artist,
    department: art.department,
    medium: art.medium,
    artwork_date: art.artwork_date,
    image_url: art.image_url,
    source: art.source,
    source_id: art.source_id,
    cached_at: new Date().toISOString()
  }));

  // Perform bulk upsert matching custom schema rules
  const { data, error } = await db
    .from('artworks')
    .upsert(rowsToInsert, { onConflict: 'source_id' })
    .select();

  if (error) {
    console.error('Failed writing artwork batch rows to Supabase cache:', error);
    return artworks; // Fallback smoothly to raw API objects on error
  }

  return data;
}

/**
 * Intercepts Featured artwork requests via local database caching
 * @returns {Promise<Array<Object>>} Artwork collection array
 */
export async function getCachedArtworks() {
  try {
    // Attempt cache retrieval from custom schema table
    const { data: cachedItems, error } = await db
      .from('artworks')
      .select('*')
      .limit(24);

    // On cache hit (if items exist), return them immediately
    if (!error && cachedItems && cachedItems.length > 0) {
      return cachedItems;
    }

    // On cache miss, fetch fresh records from the museum APIs
    const freshArtworks = await fetchFeatured();
    
    // Save fresh records asynchronously to populate the cache
    return await saveToCache(freshArtworks);
  } catch (err) {
    console.error('Error handling getCachedArtworks workflow:', err);
    return [];
  }
}

/**
 * Searches the Supabase cache table before hitting external museum APIs
 * @param {string} query - Plain text user text query
 * @returns {Promise<Array<Object>>} Artworks matching the query text
 */
export async function searchCached(query) {
  if (!query || !query.trim()) return await getCachedArtworks();
  const cleanQuery = query.trim();

  try {
    // Check if matching records already exist in the database cache
    // ILIKE performs a case-insensitive pattern match
    const { data: cachedResults, error } = await db
      .from('artworks')
      .select('*')
      .or(`title.ilike.%${cleanQuery}%,artist.ilike.%${cleanQuery}%,department.ilike.%${cleanQuery}%`)
      .limit(24);

    if (!error && cachedResults && cachedResults.length > 0) {
      return cachedResults;
    }

    // On cache miss, fetch fresh results from the museum APIs
    const freshResults = await searchArtworks(cleanQuery);
    return await saveToCache(freshResults);
  } catch (err) {
    console.error(`Error handling searchCached workflow for "${cleanQuery}":`, err);
    return [];
  }
}

/**
 * Persists the extracted dominant color hex code back to the database row
 * Called exclusively inside modal.js during Color Thief asset evaluations
 * @param {string|number} id - Target database incremental identity primary key
 * @param {string} hex - Color string computed on client opening routines
 * @returns {Promise<boolean>} Success boolean confirmation flag
 */
export async function updateDominantColor(id, hex) {
  if (!id || !hex) return false;

  const { error } = await db
    .from('artworks')
    .update({ dominant_color: hex })
    .eq('id', id);

  if (error) {
    console.error(`Failed writing dominant color update for artwork ID ${id}:`, error);
    return false;
  }

  return true;
}
