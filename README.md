# 🏟️ Bangalore Turf Finder

A CLI tool and agent to find nearby turf grounds (football, cricket, etc.) in Bangalore using Google Maps/Places APIs.

## Features

- 🔍 **Smart Search**: Searches for turfs using multiple keywords (turf, football turf, box cricket, turf ground)
- 📍 **Location Support**: Accept text addresses or lat/lng coordinates
- 📏 **Distance Sorting**: Results sorted by distance from your location
- 📞 **Contact Info**: Phone numbers when available (with fallback message)
- 📷 **Photos**: Up to 3 photo URLs per turf
- ⭐ **Ratings & Reviews**: Star rating, review count, and top 3 reviews
- 🕐 **Open Status**: Shows if the turf is currently open
- 🗺️ **Maps Links**: Direct Google Maps links for navigation
- 💾 **JSON Export**: Clean JSON output file for further processing
- ⚡ **Caching**: In-memory cache to reduce API calls (10-minute TTL)

## Prerequisites

1. **Node.js 18+** installed
2. **Google Cloud Platform** account with billing enabled
3. **API Keys** enabled for:
   - Geocoding API
   - Places API (New)

## Setup Instructions

### 1. Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - **Geocoding API**: `APIs & Services > Library > Geocoding API > Enable`
   - **Places API (New)**: `APIs & Services > Library > Places API (New) > Enable`
4. Create an API key:
   - Go to `APIs & Services > Credentials`
   - Click `Create Credentials > API Key`
   - (Recommended) Restrict the key to only the APIs you enabled

### 2. Install Dependencies

```bash
cd "Bangalore Turf Finder"
npm install
```

### 3. Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```
GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

### 4. Build the Project

```bash
npm run build
```

## Usage

### Basic Usage with Location Text

```bash
node dist/index.js --location "HSR Layout, Bengaluru" --radiusKm 5
```

### Using Coordinates

```bash
node dist/index.js --lat 12.9121 --lng 77.6446 --radiusKm 5
```

### With Custom Keyword

```bash
node dist/index.js --location "Koramangala, Bangalore" --radiusKm 3 --keyword "football turf"
```

### All Options

```bash
node dist/index.js --help
```

```
Options:
  -V, --version                 output the version number
  -l, --location <address>      Location as text (e.g., "HSR Layout, Bengaluru")
  --lat <latitude>              Latitude coordinate
  --lng <longitude>             Longitude coordinate
  -r, --radiusKm <km>           Search radius in kilometers (default: 5)
  -k, --keyword <keyword>       Additional keyword (e.g., "football turf", "box cricket")
  -m, --maxResults <count>      Maximum discovery results (default: 30)
  -d, --detailsLimit <count>    Maximum places to fetch details for (default: 20)
  -o, --output <file>           Output JSON file path (default: "results.json")
  --no-output                   Disable JSON file output
  -q, --quiet                   Minimal console output
  -h, --help                    display help for command
```

## Example Output

### Console Output

```
🏟️  Bangalore Turf Finder

==================================================
📍 Search Location: 12.912100, 77.644600
📏 Radius: 5 km
🔍 Keyword: football turf

🔎 Searching for turfs...
[Search] Searching for: "football turf Bangalore"
[Search] Found 15 results for "football turf"
✅ Found 23 turfs within 5 km

📋 Fetching details for top 20 closest turfs...

============================================================
                     TURF RESULTS
============================================================

┌──────────────────────────────────────────────────────────┐
│  1. PlayArena HSR Layout                                 │
├──────────────────────────────────────────────────────────┤
│ 📍 Distance: 1.23 km                                     │
│ 📫 27th Main Rd, HSR Layout, Bengaluru, Karnataka 560102 │
│ 📞 +91 98765 43210                                       │
│ ⭐ ★★★★☆ 4.3 (1250 reviews)                              │
│    🟢 Open now                                           │
│ 🗺️  https://maps.google.com/...                          │
│ 📷 3 photo(s) available                                  │
├──────────────────────────────────────────────────────────┤
│ 💬 Top Reviews:                                          │
│     Rahul K ★★★★★ (2 weeks ago)                          │
│     "Great turf with excellent lighting. Booking was     │
│     easy and staff was helpful..."                       │
└──────────────────────────────────────────────────────────┘

📊 Summary:
   • 20 turfs found
   • 15 with phone numbers
   • Average rating: 4.12
   • Closest: 0.85 km
   • Farthest: 4.92 km

💾 Results saved to: results.json
⏱️  Completed in 3.45s
```

### JSON Output Schema

```json
{
  "query": {
    "lat": 12.9121,
    "lng": 77.6446,
    "radiusKm": 5,
    "keyword": "football turf",
    "location": "HSR Layout, Bengaluru"
  },
  "generatedAt": "2026-02-08T10:30:00.000Z",
  "totalFound": 23,
  "detailsFetched": 20,
  "results": [
    {
      "placeId": "ChIJ...",
      "name": "PlayArena HSR Layout",
      "distanceKm": 1.23,
      "address": "27th Main Rd, HSR Layout, Bengaluru, Karnataka 560102",
      "mapsUrl": "https://maps.google.com/?cid=...",
      "phone": "+91 98765 43210",
      "openNow": true,
      "rating": 4.3,
      "userRatingsTotal": 1250,
      "photos": [
        "https://places.googleapis.com/v1/places/.../photos/.../media?...",
        "https://places.googleapis.com/v1/places/.../photos/.../media?..."
      ],
      "topReviews": [
        {
          "author": "Rahul K",
          "rating": 5,
          "relativeTime": "2 weeks ago",
          "text": "Great turf with excellent lighting. Booking was easy and staff was helpful..."
        }
      ]
    }
  ]
}
```

## API Usage & Billing Notes

### API Calls Made

For a typical search with 20 detailed results:

1. **Geocoding API**: 1 call (if using text location)
2. **Places Text Search**: 2-5 calls (for different keywords)
3. **Place Details**: Up to 20 calls (for top results)
4. **Place Photos**: Photo URLs are constructed, actual image fetch is on-demand

### Cost Estimation (as of 2024)

| API                 | Price per 1000 calls | Typical Usage |
| ------------------- | -------------------- | ------------- |
| Geocoding           | $5.00                | 1 call        |
| Text Search (New)   | $32.00               | ~3 calls      |
| Place Details (New) | $17.00               | ~20 calls     |

**Estimated cost per search**: ~$0.05 - $0.15

### Tips to Reduce Costs

1. Use `--detailsLimit` to reduce Place Details calls
2. Use `--quiet` mode for automated scripts
3. Caching is enabled by default (10-minute TTL)
4. Set up billing alerts in Google Cloud Console

## Development

### Project Structure

```
Bangalore Turf Finder/
├── src/
│   ├── index.ts      # CLI entry point
│   ├── google.ts     # Google API clients
│   ├── distance.ts   # Haversine distance calculation
│   ├── types.ts      # TypeScript interfaces
│   └── cache.ts      # In-memory TTL cache
├── dist/             # Compiled JavaScript
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run directly with ts-node (development)
npm run dev -- --location "Indiranagar, Bangalore" --radiusKm 3

# Clean build directory
npm run clean
```

### Environment Variables

| Variable              | Required | Description                                     |
| --------------------- | -------- | ----------------------------------------------- |
| `GOOGLE_MAPS_API_KEY` | Yes      | Your Google Maps Platform API key               |
| `DEBUG`               | No       | Set to any value for verbose error stack traces |

## Troubleshooting

### "API key not valid" Error

- Ensure the API key is correctly set in `.env`
- Check that the key has no leading/trailing whitespace
- Verify the key is enabled for Geocoding and Places APIs

### "Request denied" Error

- Make sure Places API (New) is enabled, not just the legacy Places API
- Check your Google Cloud Console for quota limits
- Verify billing is enabled on your project

### No Results Found

- Try increasing the radius (`--radiusKm 10`)
- Try a different keyword (`--keyword "turf ground"`)
- Verify the location is valid and in Bangalore

### Phone Numbers Not Showing

Many turfs don't have phone numbers listed on Google Maps. The tool will show "Phone not listed on Google" for these places. You can still use the Maps URL to find alternative contact methods.

## License

MIT

## Contributing

Pull requests welcome! Please ensure:

- TypeScript compiles without errors
- No new linting warnings
- Update README for new features
