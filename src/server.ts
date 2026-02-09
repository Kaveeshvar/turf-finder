/**
 * Express Server for Turf Finder
 * Simple web UI to search for turfs
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { config as dotenvConfig } from 'dotenv';

import {
  SearchOutput,
  TurfResult,
  TurfReview,
  DEFAULT_CONFIG,
  NearbySearchPlace,
  PlaceDetailsResponse,
} from './types';
import {
  setApiKey,
  getApiKey,
  geocodeLocation,
  searchTurfs,
  getPlaceDetailsBatch,
  getPhotoUrls,
  isApiKeyConfigured,
} from './google';
import { haversineDistance, roundDistance } from './distance';

// Load environment variables
dotenvConfig();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize API key
const apiKey = process.env.GOOGLE_MAPS_API_KEY;
if (apiKey) {
  setApiKey(apiKey);
}

// ============================================================================
// API Routes
// ============================================================================

interface SearchRequestBody {
  location?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  keyword?: string;
  maxResults?: number;
  detailsLimit?: number;
}

/**
 * POST /api/search - Search for turfs
 */
app.post('/api/search', async (req: Request<object, object, SearchRequestBody>, res: Response) => {
  try {
    // Check API key
    if (!isApiKeyConfigured()) {
      const envKey = process.env.GOOGLE_MAPS_API_KEY;
      if (envKey) {
        setApiKey(envKey);
      } else {
        res.status(500).json({
          error: 'Server configuration error',
          message: 'Google Maps API key is not configured',
        });
        return;
      }
    }

    const {
      location,
      lat: inputLat,
      lng: inputLng,
      radiusKm = DEFAULT_CONFIG.defaultRadiusKm,
      keyword,
      maxResults = DEFAULT_CONFIG.maxResults,
      detailsLimit = DEFAULT_CONFIG.detailsLimit,
    } = req.body;

    // Validate input
    if (!location && (inputLat === undefined || inputLng === undefined)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Either location OR both lat and lng are required',
      });
      return;
    }

    // Get coordinates
    let lat: number;
    let lng: number;
    let resolvedLocation: string | undefined;

    if (inputLat !== undefined && inputLng !== undefined) {
      lat = inputLat;
      lng = inputLng;
    } else if (location) {
      const geocodeResult = await geocodeLocation(location);
      lat = geocodeResult.lat;
      lng = geocodeResult.lng;
      resolvedLocation = geocodeResult.formattedAddress;
    } else {
      res.status(400).json({
        error: 'Validation error',
        message: 'No location provided',
      });
      return;
    }

    // Search for turfs (works anywhere in India)
    const places = await searchTurfs(lat, lng, radiusKm, keyword, maxResults);

    if (places.length === 0) {
      res.json({
        query: { lat, lng, radiusKm, keyword, location: resolvedLocation || location },
        generatedAt: new Date().toISOString(),
        totalFound: 0,
        detailsFetched: 0,
        results: [],
        message: 'No turfs found in the specified area. Try increasing the radius.',
      });
      return;
    }

    // Calculate distances and sort
    const placesWithDistance = places
      .map((place) => {
        const placeLat = place.location?.latitude;
        const placeLng = place.location?.longitude;
        if (!placeLat || !placeLng) {
          return { place, distanceKm: Infinity };
        }
        const distanceKm = roundDistance(
          haversineDistance({ lat, lng }, { lat: placeLat, lng: placeLng })
        );
        return { place, distanceKm };
      })
      .filter((p) => p.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // Fetch details for top N
    const placesToEnrich = placesWithDistance.slice(0, detailsLimit);
    const placeIds = placesToEnrich.map((p) => p.place.id);
    const detailsMap = await getPlaceDetailsBatch(placeIds, DEFAULT_CONFIG.concurrencyLimit);

    // Build results
    const results: TurfResult[] = placesToEnrich.map(({ place, distanceKm }) => {
      const details = detailsMap.get(place.id) || null;
      return buildTurfResult(place, details, distanceKm);
    });

    const output = {
      query: {
        lat,
        lng,
        radiusKm,
        keyword: keyword || null,
        location: resolvedLocation || location,
      },
      generatedAt: new Date().toISOString(),
      totalFound: placesWithDistance.length,
      detailsFetched: results.length,
      results,
    };

    res.json(output);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/health - Health check
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: isApiKeyConfigured(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/distance - Get travel distance/time using Distance Matrix API
 */
interface DistanceRequestBody {
  originLat: number;
  originLng: number;
  destinations: Array<{ placeId: string; lat: number; lng: number }>;
}

interface DistanceMatrixResponse {
  rows: Array<{
    elements: Array<{
      status: string;
      distance?: { text: string; value: number };
      duration?: { text: string; value: number };
    }>;
  }>;
  status: string;
}

app.post('/api/distance', async (req: Request<object, object, DistanceRequestBody>, res: Response) => {
  try {
    if (!isApiKeyConfigured()) {
      const envKey = process.env.GOOGLE_MAPS_API_KEY;
      if (envKey) {
        setApiKey(envKey);
      } else {
        res.status(500).json({ error: 'API key not configured' });
        return;
      }
    }

    const { originLat, originLng, destinations } = req.body;

    if (!originLat || !originLng || !destinations || destinations.length === 0) {
      res.status(400).json({ error: 'Invalid request parameters' });
      return;
    }

    // Limit to 25 destinations per request (API limit)
    const limitedDestinations = destinations.slice(0, 25);
    const destinationCoords = limitedDestinations
      .map((d) => `${d.lat},${d.lng}`)
      .join('|');

    const results: Record<string, { driving?: { distance: string; duration: string }; bicycling?: { distance: string; duration: string } }> = {};

    // Fetch driving distances
    const drivingUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destinationCoords}&mode=driving&key=${getApiKey()}`;
    
    try {
      const drivingResponse = await fetch(drivingUrl);
      const drivingData = (await drivingResponse.json()) as DistanceMatrixResponse;
      
      if (drivingData.status === 'OK' && drivingData.rows[0]) {
        drivingData.rows[0].elements.forEach((element, index) => {
          const placeId = limitedDestinations[index].placeId;
          if (!results[placeId]) results[placeId] = {};
          
          if (element.status === 'OK' && element.distance && element.duration) {
            results[placeId].driving = {
              distance: element.distance.text,
              duration: element.duration.text,
            };
          }
        });
      }
    } catch (err) {
      console.warn('Driving distance fetch failed:', err);
    }

    // Fetch bicycling distances
    const bicyclingUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destinationCoords}&mode=bicycling&key=${getApiKey()}`;
    
    try {
      const bicyclingResponse = await fetch(bicyclingUrl);
      const bicyclingData = (await bicyclingResponse.json()) as DistanceMatrixResponse;
      
      if (bicyclingData.status === 'OK' && bicyclingData.rows[0]) {
        bicyclingData.rows[0].elements.forEach((element, index) => {
          const placeId = limitedDestinations[index].placeId;
          if (!results[placeId]) results[placeId] = {};
          
          if (element.status === 'OK' && element.distance && element.duration) {
            results[placeId].bicycling = {
              distance: element.distance.text,
              duration: element.duration.text,
            };
          }
        });
      }
    } catch (err) {
      console.warn('Bicycling distance fetch failed:', err);
    }

    res.json({ distances: results });
  } catch (error) {
    console.error('Distance API error:', error);
    res.status(500).json({
      error: 'Failed to fetch distances',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function buildTurfResult(
  place: NearbySearchPlace,
  details: PlaceDetailsResponse | null,
  distanceKm: number
): TurfResult {
  const name = details?.displayName?.text || place.displayName?.text || 'Unknown';
  const address = details?.formattedAddress || place.formattedAddress || 'Address not available';

  // Get coordinates from place or details
  const placeLat = details?.location?.latitude ?? place.location?.latitude ?? null;
  const placeLng = details?.location?.longitude ?? place.location?.longitude ?? null;

  let phone: string | null = null;
  if (details?.internationalPhoneNumber) {
    phone = details.internationalPhoneNumber;
  } else if (details?.nationalPhoneNumber) {
    phone = details.nationalPhoneNumber;
  }

  const mapsUrl =
    details?.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`;
  const openNow =
    details?.regularOpeningHours?.openNow ?? place.regularOpeningHours?.openNow ?? null;
  const rating = details?.rating ?? place.rating ?? null;
  const userRatingsTotal = details?.userRatingCount ?? place.userRatingCount ?? null;
  const photos = getPhotoUrls(details?.photos || place.photos, 3);

  const topReviews: TurfReview[] = (details?.reviews || []).slice(0, 3).map((review) => ({
    author: review.authorAttribution?.displayName || 'Anonymous',
    rating: review.rating ?? null,
    relativeTime: review.relativePublishTimeDescription || '',
    text: truncateText(review.text?.text || review.originalText?.text || '', 240),
  }));

  return {
    placeId: place.id,
    name,
    distanceKm,
    address,
    mapsUrl,
    phone,
    openNow,
    rating,
    userRatingsTotal,
    photos,
    topReviews,
    lat: placeLat,
    lng: placeLng,
  };
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log(`\n🏟️  Turf Finder Server`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   API Key: ${isApiKeyConfigured() ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`\n   Open your browser to start searching!\n`);
});
