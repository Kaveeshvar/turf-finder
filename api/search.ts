import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchTurfs, setApiKey, isApiKeyConfigured, geocodeLocation } from "../src/google";

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
    const { location, radiusKm = 5, keywords } = req.body;

    if (!location) {
      return res.status(400).json({ error: "Location is required" });
    }

    // First geocode the location to get lat/lng
    const geocodeResult = await geocodeLocation(location);
    const { lat, lng } = geocodeResult;

    // Search for turfs using lat/lng
    const results = await searchTurfs(lat, lng, radiusKm, keywords);
    return res.json(results);
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({
      error: "Search failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
