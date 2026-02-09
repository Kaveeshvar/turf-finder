import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  searchTurfs,
  setApiKey,
  isApiKeyConfigured,
  geocodeLocation,
  getPlaceDetailsBatch,
  getPhotoUrls,
} from "../src/google";
import {
  NearbySearchPlace,
  PlaceDetailsResponse,
  TurfResult,
  TurfReview,
  DEFAULT_CONFIG,
} from "../src/types";
import { haversineDistance, roundDistance } from "../src/distance";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Initialize API key from environment
  if (!isApiKeyConfigured()) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY not configured" });
    }
    setApiKey(apiKey);
  }

  try {
    const { location, radiusKm = 5, keyword, detailsLimit = 20 } = req.body;

    if (!location) {
      return res.status(400).json({ error: "Location is required" });
    }

    // Geocode the location
    const geocodeResult = await geocodeLocation(location);
    const { lat, lng, formattedAddress } = geocodeResult;

    // Search for turfs
    const places = await searchTurfs(lat, lng, radiusKm, keyword);

    if (!places || places.length === 0) {
      return res.json({
        query: { lat, lng, radiusKm, keyword, location: formattedAddress || location },
        generatedAt: new Date().toISOString(),
        totalFound: 0,
        detailsFetched: 0,
        results: [],
        message: "No turfs found in the specified area. Try increasing the radius.",
      });
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

    return res.json({
      query: {
        lat,
        lng,
        radiusKm,
        keyword: keyword || null,
        location: formattedAddress || location,
      },
      generatedAt: new Date().toISOString(),
      totalFound: placesWithDistance.length,
      detailsFetched: results.length,
      results,
    });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({
      error: "Search failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function buildTurfResult(
  place: NearbySearchPlace,
  details: PlaceDetailsResponse | null,
  distanceKm: number
): TurfResult {
  const name = details?.displayName?.text || place.displayName?.text || "Unknown";
  const address = details?.formattedAddress || place.formattedAddress || "Address not available";

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
    author: review.authorAttribution?.displayName || "Anonymous",
    rating: review.rating ?? null,
    relativeTime: review.relativePublishTimeDescription || "",
    text: truncateText(review.text?.text || review.originalText?.text || "", 240),
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
  return text.substring(0, maxLength - 3) + "...";
}
