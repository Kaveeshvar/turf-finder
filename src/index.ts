#!/usr/bin/env node
/**
 * Bangalore Turf Finder CLI
 * 
 * Find nearby turfs in Bangalore using Google Maps/Places APIs
 * 
 * Usage:
 *   node dist/index.js --location "HSR Layout, Bengaluru" --radiusKm 5
 *   node dist/index.js --lat 12.9121 --lng 77.6446 --radiusKm 5 --keyword "football turf"
 */

import { config as dotenvConfig } from 'dotenv';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

import {
  CliArgs,
  SearchQuery,
  SearchOutput,
  TurfResult,
  TurfReview,
  DEFAULT_CONFIG,
  TurfFinderError,
  ValidationError,
  NearbySearchPlace,
  PlaceDetailsResponse,
} from './types';
import {
  setApiKey,
  geocodeLocation,
  searchTurfs,
  getPlaceDetailsBatch,
  getPhotoUrls,
} from './google';
import { haversineDistance, roundDistance, isApproximatelyBangalore, formatDistance } from './distance';

// Load environment variables
dotenvConfig();

// ============================================================================
// CLI Setup
// ============================================================================

const program = new Command();

program
  .name('bangalore-turf-finder')
  .description('Find nearby turfs in Bangalore using Google Maps/Places APIs')
  .version('1.0.0')
  .option('-l, --location <address>', 'Location as text (e.g., "HSR Layout, Bengaluru")')
  .option('--lat <latitude>', 'Latitude coordinate', parseFloat)
  .option('--lng <longitude>', 'Longitude coordinate', parseFloat)
  .option('-r, --radiusKm <km>', 'Search radius in kilometers', parseFloat, DEFAULT_CONFIG.defaultRadiusKm)
  .option('-k, --keyword <keyword>', 'Additional keyword (e.g., "football turf", "box cricket")')
  .option('-m, --maxResults <count>', 'Maximum discovery results', parseInt, DEFAULT_CONFIG.maxResults)
  .option('-d, --detailsLimit <count>', 'Maximum places to fetch details for', parseInt, DEFAULT_CONFIG.detailsLimit)
  .option('-o, --output <file>', 'Output JSON file path', 'results.json')
  .option('--no-output', 'Disable JSON file output')
  .option('-q, --quiet', 'Minimal console output')
  .action(main);

// ============================================================================
// Main Logic
// ============================================================================

async function main(options: Record<string, unknown>): Promise<void> {
  const startTime = Date.now();

  try {
    // Validate and set API key
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new ValidationError(
        'GOOGLE_MAPS_API_KEY environment variable is required.\n' +
        'Set it in .env file or export it in your shell.'
      );
    }
    setApiKey(apiKey);

    // Parse CLI arguments
    const args = parseCliArgs(options);
    const quiet = !!options.quiet;

    if (!quiet) {
      console.log('\n🏟️  Bangalore Turf Finder\n');
      console.log('=' .repeat(50));
    }

    // Get coordinates
    const query = await resolveSearchQuery(args, quiet);

    // Check if location is in Bangalore
    if (!isApproximatelyBangalore(query.lat, query.lng)) {
      console.warn('\n⚠️  Note: The specified location appears to be outside Bangalore.');
      console.warn('   Results will still be returned but may not be relevant.\n');
    }

    if (!quiet) {
      console.log(`\n📍 Search Location: ${query.lat.toFixed(6)}, ${query.lng.toFixed(6)}`);
      console.log(`📏 Radius: ${query.radiusKm} km`);
      if (query.keyword) {
        console.log(`🔍 Keyword: ${query.keyword}`);
      }
      console.log('');
    }

    // Search for turfs
    if (!quiet) console.log('🔎 Searching for turfs...\n');
    const places = await searchTurfs(
      query.lat,
      query.lng,
      query.radiusKm,
      query.keyword,
      query.maxResults
    );

    if (places.length === 0) {
      console.log('❌ No turfs found in the specified area.');
      console.log('   Try increasing the radius or changing the keyword.\n');
      process.exit(0);
    }

    // Calculate distances and sort
    const placesWithDistance = places
      .map((place) => {
        const placeLat = place.location?.latitude;
        const placeLng = place.location?.longitude;
        if (!placeLat || !placeLng) {
          return { place, distanceKm: Infinity };
        }
        const distanceKm = roundDistance(haversineDistance(
          { lat: query.lat, lng: query.lng },
          { lat: placeLat, lng: placeLng }
        ));
        return { place, distanceKm };
      })
      .filter((p) => p.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    if (!quiet) {
      console.log(`✅ Found ${placesWithDistance.length} turfs within ${query.radiusKm} km\n`);
    }

    // Filter down to detailsLimit for detailed fetching
    const placesToEnrich = placesWithDistance.slice(0, query.detailsLimit);
    const placeIds = placesToEnrich.map((p) => p.place.id);

    // Fetch detailed information
    if (!quiet) console.log(`📋 Fetching details for top ${placesToEnrich.length} closest turfs...\n`);
    const detailsMap = await getPlaceDetailsBatch(placeIds, DEFAULT_CONFIG.concurrencyLimit);

    // Build results
    const results: TurfResult[] = placesToEnrich.map(({ place, distanceKm }) => {
      const details = detailsMap.get(place.id) || null;
      return buildTurfResult(place, details, distanceKm);
    });

    // Build output
    const output: SearchOutput = {
      query: {
        lat: query.lat,
        lng: query.lng,
        radiusKm: query.radiusKm,
        keyword: query.keyword || null,
        location: args.location,
      },
      generatedAt: new Date().toISOString(),
      totalFound: placesWithDistance.length,
      detailsFetched: results.length,
      results,
    };

    // Print results to console
    printResults(results, quiet);

    // Save to JSON file
    if (options.output !== false && options.output) {
      const outputPath = path.resolve(options.output as string);
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
      if (!quiet) {
        console.log(`\n💾 Results saved to: ${outputPath}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    if (!quiet) {
      console.log(`\n⏱️  Completed in ${elapsed}s\n`);
    }

  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseCliArgs(options: Record<string, unknown>): CliArgs {
  const location = options.location as string | undefined;
  const lat = options.lat as number | undefined;
  const lng = options.lng as number | undefined;
  const radiusKm = options.radiusKm as number;
  const keyword = options.keyword as string | undefined;
  const maxResults = options.maxResults as number;
  const detailsLimit = options.detailsLimit as number;

  // Validate input
  if (!location && (lat === undefined || lng === undefined)) {
    throw new ValidationError(
      'Either --location OR both --lat and --lng are required.\n\n' +
      'Examples:\n' +
      '  --location "HSR Layout, Bengaluru"\n' +
      '  --lat 12.9121 --lng 77.6446'
    );
  }

  if (lat !== undefined && lng === undefined) {
    throw new ValidationError('--lng is required when --lat is specified');
  }

  if (lng !== undefined && lat === undefined) {
    throw new ValidationError('--lat is required when --lng is specified');
  }

  if (radiusKm <= 0 || radiusKm > 50) {
    throw new ValidationError('Radius must be between 0 and 50 km');
  }

  return {
    location,
    lat,
    lng,
    radiusKm,
    keyword,
    maxResults,
    detailsLimit,
  };
}

async function resolveSearchQuery(args: CliArgs, quiet: boolean): Promise<SearchQuery> {
  let lat: number;
  let lng: number;

  if (args.lat !== undefined && args.lng !== undefined) {
    lat = args.lat;
    lng = args.lng;
    if (!quiet) {
      console.log(`📍 Using provided coordinates: ${lat}, ${lng}`);
    }
  } else if (args.location) {
    if (!quiet) {
      console.log(`🔍 Geocoding location: "${args.location}"`);
    }
    const geocodeResult = await geocodeLocation(args.location);
    lat = geocodeResult.lat;
    lng = geocodeResult.lng;
    if (!quiet) {
      console.log(`   ➜ ${geocodeResult.formattedAddress}`);
    }
  } else {
    throw new ValidationError('No location provided');
  }

  return {
    lat,
    lng,
    radiusKm: args.radiusKm,
    keyword: args.keyword,
    maxResults: args.maxResults,
    detailsLimit: args.detailsLimit,
  };
}

function buildTurfResult(
  place: NearbySearchPlace,
  details: PlaceDetailsResponse | null,
  distanceKm: number
): TurfResult {
  const name = details?.displayName?.text || place.displayName?.text || 'Unknown';
  const address = details?.formattedAddress || place.formattedAddress || 'Address not available';
  
  // Phone number - try international first, then national
  let phone: string | null = null;
  if (details?.internationalPhoneNumber) {
    phone = details.internationalPhoneNumber;
  } else if (details?.nationalPhoneNumber) {
    phone = details.nationalPhoneNumber;
  }

  // Google Maps URL
  const mapsUrl = details?.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`;

  // Open now status
  const openNow = details?.regularOpeningHours?.openNow ?? place.regularOpeningHours?.openNow ?? null;

  // Rating and reviews count
  const rating = details?.rating ?? place.rating ?? null;
  const userRatingsTotal = details?.userRatingCount ?? place.userRatingCount ?? null;

  // Photos
  const photos = getPhotoUrls(details?.photos || place.photos, 3);

  // Coordinates
  const placeLat = details?.location?.latitude ?? place.location?.latitude ?? null;
  const placeLng = details?.location?.longitude ?? place.location?.longitude ?? null;

  // Reviews
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

function printResults(results: TurfResult[], quiet: boolean): void {
  if (quiet) {
    // Minimal output for quiet mode
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name} (${r.distanceKm} km) - ${r.phone || 'No phone'}`);
    });
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('                     TURF RESULTS');
  console.log('='.repeat(60) + '\n');

  results.forEach((result, index) => {
    console.log(`┌${'─'.repeat(58)}┐`);
    console.log(`│ ${(index + 1).toString().padStart(2)}. ${result.name.substring(0, 50).padEnd(50)} │`);
    console.log(`├${'─'.repeat(58)}┤`);
    
    console.log(`│ 📍 Distance: ${formatDistance(result.distanceKm).padEnd(43)} │`);
    console.log(`│ 📫 ${result.address.substring(0, 54).padEnd(54)} │`);
    
    // Phone
    if (result.phone) {
      console.log(`│ 📞 ${result.phone.padEnd(54)} │`);
    } else {
      console.log(`│ 📞 Phone not listed on Google${' '.repeat(26)} │`);
    }

    // Rating
    if (result.rating !== null) {
      const stars = '★'.repeat(Math.round(result.rating)) + '☆'.repeat(5 - Math.round(result.rating));
      const ratingStr = `${stars} ${result.rating.toFixed(1)} (${result.userRatingsTotal || 0} reviews)`;
      console.log(`│ ⭐ ${ratingStr.padEnd(54)} │`);
    }

    // Open status
    if (result.openNow !== null) {
      const status = result.openNow ? '🟢 Open now' : '🔴 Closed';
      console.log(`│    ${status.padEnd(54)} │`);
    }

    // Maps link
    console.log(`│ 🗺️  ${result.mapsUrl.substring(0, 53).padEnd(53)} │`);

    // Photos
    if (result.photos.length > 0) {
      console.log(`│ 📷 ${result.photos.length} photo(s) available${' '.repeat(36)} │`);
    }

    // Reviews
    if (result.topReviews.length > 0) {
      console.log(`├${'─'.repeat(58)}┤`);
      console.log(`│ 💬 Top Reviews:${' '.repeat(42)} │`);
      result.topReviews.forEach((review) => {
        const reviewStars = review.rating ? '★'.repeat(review.rating) : '';
        const authorLine = `    ${review.author} ${reviewStars} (${review.relativeTime})`;
        console.log(`│ ${authorLine.substring(0, 56).padEnd(56)} │`);
        
        // Print review text (wrap at ~54 chars)
        const words = review.text.split(' ');
        let line = '    "';
        for (const word of words) {
          if ((line + word).length > 54) {
            console.log(`│ ${line.padEnd(56)} │`);
            line = '     ' + word + ' ';
          } else {
            line += word + ' ';
          }
        }
        if (line.trim().length > 4) {
          line = line.trimEnd() + '"';
          console.log(`│ ${line.padEnd(56)} │`);
        }
      });
    }

    console.log(`└${'─'.repeat(58)}┘\n`);
  });

  // Summary
  const withPhone = results.filter((r) => r.phone).length;
  const withRating = results.filter((r) => r.rating !== null).length;
  const avgRating = results.filter((r) => r.rating !== null).length > 0
    ? (results.filter((r) => r.rating !== null).reduce((sum, r) => sum + (r.rating || 0), 0) / withRating).toFixed(2)
    : 'N/A';

  console.log('📊 Summary:');
  console.log(`   • ${results.length} turfs found`);
  console.log(`   • ${withPhone} with phone numbers`);
  console.log(`   • Average rating: ${avgRating}`);
  console.log(`   • Closest: ${results[0]?.distanceKm || 0} km`);
  console.log(`   • Farthest: ${results[results.length - 1]?.distanceKm || 0} km`);
}

function handleError(error: unknown): never {
  console.error('\n❌ Error:');

  if (error instanceof TurfFinderError) {
    console.error(`   ${error.message}`);
    if (error.details) {
      console.error('\n   Details:', JSON.stringify(error.details, null, 2));
    }
  } else if (error instanceof Error) {
    console.error(`   ${error.message}`);
    if (process.env.DEBUG) {
      console.error('\n   Stack:', error.stack);
    }
  } else {
    console.error('   An unexpected error occurred');
  }

  console.error('\n💡 Tips:');
  console.error('   • Make sure GOOGLE_MAPS_API_KEY is set correctly');
  console.error('   • Ensure the required APIs are enabled in Google Cloud Console:');
  console.error('     - Geocoding API');
  console.error('     - Places API (New)');
  console.error('   • Check your API quota and billing status');
  console.error('');

  process.exit(1);
}

// Run the CLI
program.parse();
