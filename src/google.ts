/**
 * Google Maps/Places API Client
 * Handles all interactions with Google APIs for turf discovery
 */

import {
  GeocodingResult,
  GoogleApiError,
  GeocodingError,
  NearbySearchPlace,
  PlaceDetailsResponse,
  DEFAULT_CONFIG,
  LatLng,
} from './types';
import { geocodeCache, searchCache, detailsCache, TtlCache } from './cache';

// ============================================================================
// Constants
// ============================================================================

const GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_NEARBY_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const PLACES_PHOTO_URL = 'https://places.googleapis.com/v1';

// Field masks for Places API (New)
const NEARBY_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.photos',
  'places.regularOpeningHours',
  'places.businessStatus',
  'places.types',
].join(',');

const PLACE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'location',
  'rating',
  'userRatingCount',
  'photos',
  'reviews',
  'regularOpeningHours',
  'googleMapsUri',
  'websiteUri',
  'businessStatus',
].join(',');

// Default turf-related keywords - expanded for better coverage
const DEFAULT_TURF_KEYWORDS = [
  'turf',
  'football turf', 
  'box cricket',
  'turf ground',
  'sports turf',
  'cricket ground',
  'football ground',
  'futsal',
  'five a side football',
  'seven a side football',
];

// Keywords to exclude from results (non-turf indoor activities)
const EXCLUDE_KEYWORDS = [
  'bowling',
  'bowl',
  'arcade',
  'gaming zone',
  'game zone',
  'virtual reality',
  'vr arena',
  'laser tag',
  'escape room',
  'trampoline',
  'go kart',
  'karting',
  'billiard',
  'pool table',
  'snooker',
  'paintball',
  'shooting range',
  'ice skating',
  'roller skating',
  'spa',
  'salon',
  'restaurant',
  'cafe',
  'bar',
  'pub',
  'lounge',
];

/**
 * Filter out non-turf results based on name and types
 */
function filterTurfResults(places: NearbySearchPlace[]): NearbySearchPlace[] {
  return places.filter((place) => {
    const name = (place.displayName?.text || '').toLowerCase();
    const types = place.types || [];
    
    // Check if name contains any exclude keywords
    for (const keyword of EXCLUDE_KEYWORDS) {
      if (name.includes(keyword)) {
        console.log(`[Filter] Excluding "${place.displayName?.text}" - matches exclude keyword: ${keyword}`);
        return false;
      }
    }
    
    // Exclude certain Google place types
    const excludeTypes = [
      'bowling_alley',
      'amusement_center',
      'movie_theater',
      'night_club',
      'casino',
      'bar',
      'restaurant',
      'cafe',
    ];
    
    for (const type of excludeTypes) {
      if (types.includes(type)) {
        console.log(`[Filter] Excluding "${place.displayName?.text}" - has type: ${type}`);
        return false;
      }
    }
    
    return true;
  });
}

// ============================================================================
// API Key Management
// ============================================================================

let apiKey: string | null = null;

export function setApiKey(key: string): void {
  apiKey = key;
}

export function getApiKey(): string {
  if (!apiKey) {
    throw new GoogleApiError('Google Maps API key not set. Call setApiKey() or set GOOGLE_MAPS_API_KEY env var.');
  }
  return apiKey;
}

// ============================================================================
// Geocoding API
// ============================================================================

export interface GeocodeOptions {
  /** Bias results towards a specific region (e.g., 'in' for India) */
  region?: string;
  /** Restrict to specific bounds */
  bounds?: {
    northeast: LatLng;
    southwest: LatLng;
  };
}

/**
 * Convert a text address/location to lat/lng coordinates
 */
export async function geocodeLocation(
  address: string,
  options: GeocodeOptions = {}
): Promise<GeocodingResult> {
  const cacheKey = TtlCache.generateKey({ address, ...options });
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    console.log(`[Cache] Using cached geocode result for "${address}"`);
    return cached;
  }

  const params = new URLSearchParams({
    address,
    key: getApiKey(),
    region: options.region || 'in', // Default to India
  });

  if (options.bounds) {
    params.set(
      'bounds',
      `${options.bounds.southwest.lat},${options.bounds.southwest.lng}|${options.bounds.northeast.lat},${options.bounds.northeast.lng}`
    );
  }

  const url = `${GEOCODING_API_URL}?${params.toString()}`;

  // Type for Geocoding API response
  interface GeocodingApiResponse {
    status: string;
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
    }>;
    error_message?: string;
  }

  try {
    const response = await fetch(url);
    const data = (await response.json()) as GeocodingApiResponse;

    if (data.status === 'ZERO_RESULTS') {
      throw new GeocodingError(`No results found for location: "${address}"`);
    }

    if (data.status !== 'OK') {
      throw new GeocodingError(`Geocoding failed: ${data.status}`, data);
    }

    const result = data.results[0];
    const geocodeResult: GeocodingResult = {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };

    geocodeCache.set(cacheKey, geocodeResult);
    return geocodeResult;
  } catch (error) {
    if (error instanceof GeocodingError) throw error;
    throw new GeocodingError(`Geocoding request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
  }
}

// ============================================================================
// Places Nearby Search (New)
// ============================================================================

export interface NearbySearchOptions {
  lat: number;
  lng: number;
  radiusMeters: number;
  includedTypes?: string[];
  keyword?: string;
  maxResultCount?: number;
}

/**
 * Search for places near a location using Places API (New)
 */
export async function nearbySearch(options: NearbySearchOptions): Promise<NearbySearchPlace[]> {
  const cacheKey = TtlCache.generateKey({ type: 'nearby', ...options });
  const cached = searchCache.get(cacheKey) as NearbySearchPlace[] | null;
  if (cached) {
    console.log(`[Cache] Using cached nearby search results`);
    return cached;
  }

  const requestBody: Record<string, unknown> = {
    locationRestriction: {
      circle: {
        center: {
          latitude: options.lat,
          longitude: options.lng,
        },
        radius: Math.min(options.radiusMeters, 50000), // Max 50km
      },
    },
    maxResultCount: options.maxResultCount || DEFAULT_CONFIG.maxResults,
  };

  // Add included types for better filtering
  if (options.includedTypes && options.includedTypes.length > 0) {
    requestBody.includedTypes = options.includedTypes;
  }

  try {
    const response = await fetch(PLACES_NEARBY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': NEARBY_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new GoogleApiError(`Nearby search failed: ${response.status} ${response.statusText}`, errorData);
    }

    const data = (await response.json()) as { places?: NearbySearchPlace[] };
    const places = data.places || [];

    searchCache.set(cacheKey, places);
    return places;
  } catch (error) {
    if (error instanceof GoogleApiError) throw error;
    throw new GoogleApiError(`Nearby search request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
  }
}

// ============================================================================
// Places Text Search (New) - Better for keyword searches
// ============================================================================

export interface TextSearchOptions {
  textQuery: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  maxResultCount?: number;
}

/**
 * Search for places using text query (better for turf keyword searches)
 */
export async function textSearch(options: TextSearchOptions): Promise<NearbySearchPlace[]> {
  const cacheKey = TtlCache.generateKey({ type: 'text', ...options });
  const cached = searchCache.get(cacheKey) as NearbySearchPlace[] | null;
  if (cached) {
    console.log(`[Cache] Using cached text search results`);
    return cached;
  }

  const requestBody: Record<string, unknown> = {
    textQuery: options.textQuery,
    // Use locationRestriction to strictly limit results to the search area
    locationRestriction: {
      circle: {
        center: {
          latitude: options.lat,
          longitude: options.lng,
        },
        radius: Math.min(options.radiusMeters, 50000),
      },
    },
    maxResultCount: options.maxResultCount || DEFAULT_CONFIG.maxResults,
  };

  try {
    const response = await fetch(PLACES_TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': NEARBY_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new GoogleApiError(`Text search failed: ${response.status} ${response.statusText}`, errorData);
    }

    const data = (await response.json()) as { places?: NearbySearchPlace[] };
    const places = data.places || [];

    searchCache.set(cacheKey, places);
    return places;
  } catch (error) {
    if (error instanceof GoogleApiError) throw error;
    throw new GoogleApiError(`Text search request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
  }
}

// ============================================================================
// Combined Turf Search
// ============================================================================

/**
 * Search for turfs using multiple keyword searches and combine results
 */
export async function searchTurfs(
  lat: number,
  lng: number,
  radiusKm: number,
  customKeyword?: string,
  maxResults: number = DEFAULT_CONFIG.maxResults
): Promise<NearbySearchPlace[]> {
  const radiusMeters = radiusKm * 1000;
  const seenPlaceIds = new Set<string>();
  const allPlaces: NearbySearchPlace[] = [];

  // Build search queries - prioritize custom keyword if provided
  const keywords = customKeyword
    ? [customKeyword, ...DEFAULT_TURF_KEYWORDS.filter((k) => k !== customKeyword)]
    : DEFAULT_TURF_KEYWORDS;

  // First, try Nearby Search with sports-related place types
  try {
    console.log(`[Search] Running Nearby Search for sports facilities...`);
    const nearbyPlaces = await nearbySearch({
      lat,
      lng,
      radiusMeters,
      includedTypes: ['sports_club', 'sports_complex', 'stadium', 'gym'],
      maxResultCount: Math.min(20, maxResults),
    });
    
    for (const place of nearbyPlaces) {
      if (!seenPlaceIds.has(place.id)) {
        seenPlaceIds.add(place.id);
        allPlaces.push(place);
      }
    }
    console.log(`[Search] Nearby Search found ${nearbyPlaces.length} sports facilities`);
  } catch (error) {
    console.warn(`[Search] Nearby Search failed:`, error instanceof Error ? error.message : error);
  }

  // Then perform text searches with different keywords
  for (const keyword of keywords) {
    try {
      // Search with just the keyword - locationRestriction will handle the area
      const query = `${keyword}`;
      console.log(`[Search] Searching for: "${query}"`);

      const places = await textSearch({
        textQuery: query,
        lat,
        lng,
        radiusMeters,
        maxResultCount: Math.min(20, maxResults), // Google limits to 20 per request
      });

      // Add unique places
      for (const place of places) {
        if (!seenPlaceIds.has(place.id)) {
          seenPlaceIds.add(place.id);
          allPlaces.push(place);
        }
      }

      console.log(`[Search] Found ${places.length} results for "${keyword}"`);

      // Stop if we have enough results
      if (allPlaces.length >= maxResults) {
        break;
      }
    } catch (error) {
      console.warn(`[Search] Warning: Search for "${keyword}" failed:`, error instanceof Error ? error.message : error);
      // Continue with other keywords
    }
  }

  console.log(`[Search] Total unique places found: ${allPlaces.length}`);
  
  // Filter out non-turf results
  const filteredPlaces = filterTurfResults(allPlaces);
  console.log(`[Search] After filtering: ${filteredPlaces.length} turf results`);
  
  return filteredPlaces.slice(0, maxResults);
}

// ============================================================================
// Place Details (New)
// ============================================================================

/**
 * Fetch detailed information for a specific place
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetailsResponse | null> {
  const cacheKey = TtlCache.generateKey({ type: 'details', placeId });
  const cached = detailsCache.get(cacheKey) as PlaceDetailsResponse | null;
  if (cached) {
    return cached;
  }

  const url = `${PLACES_DETAILS_URL}/${placeId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn(`[Details] Failed to fetch details for ${placeId}: ${response.status}`, errorData);
      return null;
    }

    const data = (await response.json()) as PlaceDetailsResponse;
    detailsCache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.warn(`[Details] Error fetching details for ${placeId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch details for multiple places with concurrency limit
 */
export async function getPlaceDetailsBatch(
  placeIds: string[],
  concurrencyLimit: number = DEFAULT_CONFIG.concurrencyLimit
): Promise<Map<string, PlaceDetailsResponse | null>> {
  const results = new Map<string, PlaceDetailsResponse | null>();

  // Dynamic import for p-limit (ESM module)
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(concurrencyLimit);

  const tasks = placeIds.map((placeId) =>
    limit(async () => {
      const details = await getPlaceDetails(placeId);
      results.set(placeId, details);
    })
  );

  await Promise.all(tasks);
  return results;
}

// ============================================================================
// Place Photos (New)
// ============================================================================

/**
 * Get a photo URL for a place photo resource
 * @param photoName - The photo resource name (e.g., "places/xxx/photos/yyy")
 * @param maxWidthPx - Maximum width in pixels
 * @param maxHeightPx - Maximum height in pixels
 * @returns Photo URL or null
 */
export function getPhotoUrl(
  photoName: string,
  maxWidthPx: number = 400,
  maxHeightPx: number = 400
): string {
  // For Places API (New), we need to construct the media URL
  const url = `${PLACES_PHOTO_URL}/${photoName}/media?maxWidthPx=${maxWidthPx}&maxHeightPx=${maxHeightPx}&key=${getApiKey()}`;
  return url;
}

/**
 * Get multiple photo URLs for a place
 * @param photos - Array of photo objects from Places API
 * @param maxPhotos - Maximum number of photos to return
 * @returns Array of photo URLs
 */
export function getPhotoUrls(
  photos: Array<{ name: string }> | undefined,
  maxPhotos: number = 3
): string[] {
  if (!photos || photos.length === 0) {
    return [];
  }

  return photos.slice(0, maxPhotos).map((photo) => getPhotoUrl(photo.name));
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if the API key is configured
 */
export function isApiKeyConfigured(): boolean {
  return !!apiKey;
}

/**
 * Clear all caches
 */
export function clearCaches(): void {
  geocodeCache.clear();
  searchCache.clear();
  detailsCache.clear();
}
