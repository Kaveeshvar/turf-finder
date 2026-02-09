/**
 * Distance calculation utilities using Haversine formula
 */

import { LatLng } from './types';

/** Earth's radius in kilometers */
const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the Haversine distance between two coordinates
 * @param point1 - First coordinate (lat/lng)
 * @param point2 - Second coordinate (lat/lng)
 * @returns Distance in kilometers
 */
export function haversineDistance(point1: LatLng, point2: LatLng): number {
  const lat1Rad = toRadians(point1.lat);
  const lat2Rad = toRadians(point2.lat);
  const deltaLat = toRadians(point2.lat - point1.lat);
  const deltaLng = toRadians(point2.lng - point1.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Round distance to 2 decimal places
 */
export function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 100) / 100;
}

/**
 * Sort items by distance from a reference point
 * @param items - Array of items with location
 * @param referencePoint - The reference point to calculate distance from
 * @param getLocation - Function to extract lat/lng from each item
 * @returns Sorted array with calculated distances
 */
export function sortByDistance<T>(
  items: T[],
  referencePoint: LatLng,
  getLocation: (item: T) => LatLng | null
): Array<T & { distanceKm: number }> {
  return items
    .map((item) => {
      const location = getLocation(item);
      if (!location) {
        return { ...item, distanceKm: Infinity };
      }
      const distanceKm = roundDistance(haversineDistance(referencePoint, location));
      return { ...item, distanceKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Filter items within a certain radius
 */
export function filterWithinRadius<T extends { distanceKm: number }>(
  items: T[],
  radiusKm: number
): T[] {
  return items.filter((item) => item.distanceKm <= radiusKm);
}

/**
 * Check if coordinates are approximately in Bangalore area
 * Bangalore bounding box (approximate):
 * - North: 13.2
 * - South: 12.7
 * - East: 77.9
 * - West: 77.3
 */
export function isApproximatelyBangalore(lat: number, lng: number): boolean {
  const BANGALORE_BOUNDS = {
    north: 13.2,
    south: 12.7,
    east: 77.9,
    west: 77.3,
  };

  return (
    lat >= BANGALORE_BOUNDS.south &&
    lat <= BANGALORE_BOUNDS.north &&
    lng >= BANGALORE_BOUNDS.west &&
    lng <= BANGALORE_BOUNDS.east
  );
}

/**
 * Format distance for display
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${roundDistance(distanceKm)} km`;
}
