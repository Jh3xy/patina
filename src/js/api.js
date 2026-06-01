

const MET_BASE_URL = "https://collectionapi.metmuseum.org/public/collection/v1";
const AIC_BASE_URL = "https://api.artic.edu/api/v1";

const DEFAULT_LIMIT = 24;
const MET_DETAIL_LIMIT = 18;
const AIC_IMAGE_SIZE = "843,";

const AIC_FIELDS = [
  "id",
  "title",
  "artist_display",
  "artist_title",
  "department_title",
  "medium_display",
  "date_display",
  "image_id",
].join(",");

const FEATURED_QUERY = "painting";

const FILTER_QUERIES = {
  all: FEATURED_QUERY,
  paintings: "painting",
  sculptures: "sculpture",
  impressionism: "impressionism",
  renaissance: "renaissance",
  modern: "modern art",
  baroque: "baroque",
  contemporary: "contemporary art",
};

function buildUrl(baseUrl, params = {}) {
  const url = new URL(baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Museum API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchJsonSafely(url) {
  try {
    return await fetchJson(url);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function normalizeMetArtwork(artwork) {
  if (!artwork) {
    return null;
  }

  const fallbackImage = Array.isArray(artwork.additionalImages)
    ? artwork.additionalImages[0]
    : "";
  const imageUrl = cleanText(artwork.primaryImageSmall || artwork.primaryImage || fallbackImage);

  if (!artwork.objectID || !imageUrl) {
    return null;
  }

  return {
    title: cleanText(artwork.title, "Untitled"),
    artist: cleanText(artwork.artistDisplayName, "Unknown artist"),
    department: cleanText(artwork.department),
    medium: cleanText(artwork.medium || artwork.classification),
    artwork_date: cleanText(artwork.objectDate),
    image_url: imageUrl,
    source: "met",
    source_id: `met-${artwork.objectID}`,
  };
}

function getAicImageUrl(artwork, iiifUrl) {
  if (!artwork.image_id || !iiifUrl) {
    return "";
  }

  return `${iiifUrl}/${artwork.image_id}/full/${AIC_IMAGE_SIZE}/0/default.jpg`;
}

function normalizeAicArtwork(artwork, iiifUrl) {
  if (!artwork) {
    return null;
  }

  const imageUrl = getAicImageUrl(artwork, iiifUrl);

  if (!artwork.id || !imageUrl) {
    return null;
  }

  return {
    title: cleanText(artwork.title, "Untitled"),
    artist: cleanText(artwork.artist_title || artwork.artist_display, "Unknown artist"),
    department: cleanText(artwork.department_title),
    medium: cleanText(artwork.medium_display),
    artwork_date: cleanText(artwork.date_display),
    image_url: imageUrl,
    source: "aic",
    source_id: `aic-${artwork.id}`,
  };
}

function compactArtworks(artworks) {
  const seen = new Set();

  return artworks.filter((artwork) => {
    if (!artwork || seen.has(artwork.source_id)) {
      return false;
    }

    seen.add(artwork.source_id);
    return true;
  });
}

async function fetchMetArtworks(query, limit = DEFAULT_LIMIT) {
  const searchUrl = buildUrl(`${MET_BASE_URL}/search`, {
    hasImages: "true",
    q: query,
  });

  const searchData = await fetchJsonSafely(searchUrl);
  const objectIds = searchData?.objectIDs?.slice(0, MET_DETAIL_LIMIT) || [];

  if (!objectIds.length) {
    return [];
  }

  const detailRequests = objectIds.map((objectId) => {
    return fetchJsonSafely(`${MET_BASE_URL}/objects/${objectId}`);
  });

  const details = await Promise.all(detailRequests);

  return details
    .map(normalizeMetArtwork)
    .filter(Boolean)
    .slice(0, limit);
}

async function fetchAicArtworks(query, limit = DEFAULT_LIMIT) {
  const searchUrl = buildUrl(`${AIC_BASE_URL}/artworks/search`, {
    q: query,
    fields: AIC_FIELDS,
    limit,
    "query[term][is_public_domain]": "true",
  });

  const searchData = await fetchJsonSafely(searchUrl);
  const iiifUrl = searchData?.config?.iiif_url;

  return (searchData?.data || [])
    .map((artwork) => normalizeAicArtwork(artwork, iiifUrl))
    .filter(Boolean)
    .slice(0, limit);
}

async function fetchCombinedArtworks(query, limit = DEFAULT_LIMIT) {
  const [metArtworks, aicArtworks] = await Promise.all([
    fetchMetArtworks(query, limit),
    fetchAicArtworks(query, limit),
  ]);

  return compactArtworks([...metArtworks, ...aicArtworks]).slice(0, limit);
}

export function fetchFeatured() {
  return fetchCombinedArtworks(FEATURED_QUERY);
}

export function searchArtworks(query) {
  const normalizedQuery = cleanText(query);

  if (!normalizedQuery) {
    return fetchFeatured();
  }

  return fetchCombinedArtworks(normalizedQuery);
}

export function fetchByDepartment(dept) {
  const normalizedDept = cleanText(dept).toLowerCase();
  const query = FILTER_QUERIES[normalizedDept] || normalizedDept;

  if (!query) {
    return fetchFeatured();
  }

  return fetchCombinedArtworks(query);
}
