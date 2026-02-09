import type { VercelRequest, VercelResponse } from "@vercel/node";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface DistanceResult {
  destination: string;
  driving: { distance: string; duration: string } | null;
  bicycling: { distance: string; duration: string } | null;
}

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

  try {
    const { origin, destinations }: { origin: string; destinations: string[] } = req.body;

    if (!origin || !destinations || !Array.isArray(destinations)) {
      return res.status(400).json({ error: "Origin and destinations array required" });
    }

    const results: DistanceResult[] = [];

    // Fetch driving and bicycling in parallel
    const [drivingData, bicyclingData] = await Promise.all([
      fetchDistanceMatrix(origin, destinations, "driving"),
      fetchDistanceMatrix(origin, destinations, "bicycling"),
    ]);

    for (let i = 0; i < destinations.length; i++) {
      results.push({
        destination: destinations[i],
        driving: drivingData[i] || null,
        bicycling: bicyclingData[i] || null,
      });
    }

    return res.json({ results });
  } catch (error) {
    console.error("Distance error:", error);
    return res.status(500).json({
      error: "Distance calculation failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function fetchDistanceMatrix(
  origin: string,
  destinations: string[],
  mode: "driving" | "bicycling"
): Promise<Array<{ distance: string; duration: string } | null>> {
  const destinationsParam = destinations.join("|");
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
    origin
  )}&destinations=${encodeURIComponent(destinationsParam)}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK") {
    console.error("Distance Matrix API error:", data.status);
    return destinations.map(() => null);
  }

  const elements = data.rows[0]?.elements || [];
  return elements.map((element: any) => {
    if (element.status === "OK") {
      return {
        distance: element.distance.text,
        duration: element.duration.text,
      };
    }
    return null;
  });
}
