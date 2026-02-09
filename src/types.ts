/**
 * Type definitions for Bangalore Turf Finder
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface Config {
  /** Default search radius in kilometers */
  defaultRadiusKm: number;
  /** Maximum number of results from discovery search */
  maxResults: number;
  /** Maximum number of places to fetch detailed info for */
  detailsLimit: number;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Concurrency limit for API calls */
  concurrencyLimit: number;
}

export const DEFAULT_CONFIG: Config = {
  defaultRadiusKm: 5,
  maxResults: 30,
  detailsLimit: 20,
  cacheTtlMs: 10 * 60 * 1000, // 10 minutes
  concurrencyLimit: 5,
};

// ============================================================================
// Input Types
// ============================================================================

export interface CliArgs {
  location?: string;
  lat?: number;
  lng?: number;
  radiusKm: number;
  keyword?: string;
  maxResults: number;
  detailsLimit: number;
}

export interface SearchQuery {
  lat: number;
  lng: number;
  radiusKm: number;
  keyword?: string;
  maxResults: number;
  detailsLimit: number;
}

// ============================================================================
// Google API Response Types
// ============================================================================

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodingResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export interface GooglePhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: Array<{
    displayName?: string;
    uri?: string;
    photoUri?: string;
  }>;
}

export interface GoogleReview {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: {
    text?: string;
    languageCode?: string;
  };
  originalText?: {
    text?: string;
    languageCode?: string;
  };
  authorAttribution?: {
    displayName?: string;
    uri?: string;
    photoUri?: string;
  };
  publishTime?: string;
}

export interface RegularOpeningHours {
  openNow?: boolean;
  periods?: Array<{
    open?: { day?: number; hour?: number; minute?: number };
    close?: { day?: number; hour?: number; minute?: number };
  }>;
  weekdayDescriptions?: string[];
}

export interface NearbySearchPlace {
  id: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  photos?: GooglePhoto[];
  regularOpeningHours?: RegularOpeningHours;
  businessStatus?: string;
  types?: string[];
}

export interface PlaceDetailsResponse {
  id: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  photos?: GooglePhoto[];
  reviews?: GoogleReview[];
  regularOpeningHours?: RegularOpeningHours;
  googleMapsUri?: string;
  websiteUri?: string;
  businessStatus?: string;
}

// ============================================================================
// Output Types
// ============================================================================

export interface TurfReview {
  author: string;
  rating: number | null;
  relativeTime: string;
  text: string;
}

export interface TurfResult {
  placeId: string;
  name: string;
  distanceKm: number;
  address: string;
  mapsUrl: string;
  phone: string | null;
  openNow: boolean | null;
  rating: number | null;
  userRatingsTotal: number | null;
  photos: string[];
  topReviews: TurfReview[];
  /** Place latitude for distance calculations */
  lat: number | null;
  /** Place longitude for distance calculations */
  lng: number | null;
}

export interface SearchOutput {
  query: {
    lat: number;
    lng: number;
    radiusKm: number;
    keyword: string | null;
    location?: string;
  };
  generatedAt: string;
  totalFound: number;
  detailsFetched: number;
  results: TurfResult[];
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class TurfFinderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'TurfFinderError';
  }
}

export class GoogleApiError extends TurfFinderError {
  constructor(message: string, details?: unknown) {
    super(message, 'GOOGLE_API_ERROR', details);
    this.name = 'GoogleApiError';
  }
}

export class GeocodingError extends TurfFinderError {
  constructor(message: string, details?: unknown) {
    super(message, 'GEOCODING_ERROR', details);
    this.name = 'GeocodingError';
  }
}

export class ValidationError extends TurfFinderError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
