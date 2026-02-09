/**
 * In-memory cache for cities with TTL and stale fallback
 * 
 * Cache lifetime: 10 minutes (myGO data rarely changes, and browser already caches 1 hour)
 * This is a simple in-memory cache that lives for the lifetime of the Cloudflare Worker isolate.
 */

interface CitiesCacheEntry {
  cities: Array<{ id: number; name: string; region: string | null }>;
  fetchedAt: string; // ISO timestamp
  expiresAt: number; // Date.now() + TTL
}

// Cache TTL: 10 minutes (myGO data rarely changes, and browser already caches 1 hour)
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedEntry: CitiesCacheEntry | null = null;

/**
 * Get cached cities if available
 * @returns Cities with freshness indicator, or null if no cache exists
 */
export function getCachedCities(): {
  cities: Array<{ id: number; name: string; region: string | null }>;
  fetchedAt: string;
  stale: boolean;
} | null {
  if (!cachedEntry) {
    return null;
  }

  const now = Date.now();
  const stale = now > cachedEntry.expiresAt;

  return {
    cities: cachedEntry.cities,
    fetchedAt: cachedEntry.fetchedAt,
    stale,
  };
}

/**
 * Store cities in cache with a new TTL
 * @param cities List of cities to cache
 */
export function setCachedCities(
  cities: Array<{ id: number; name: string; region: string | null }>
): void {
  const now = Date.now();
  cachedEntry = {
    cities,
    fetchedAt: new Date().toISOString(),
    expiresAt: now + CACHE_TTL_MS,
  };
}
