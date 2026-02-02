// Discogs API client for searching vinyl marketplace listings

const DISCOGS_API_BASE = 'https://api.discogs.com';
const USER_AGENT = 'VinylSearchApp/1.0';

// Rate limiting: track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // Slightly over 1 second between requests

async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();

  const headers = {
    'User-Agent': USER_AGENT,
    ...options.headers
  };

  // Add token if available
  if (process.env.DISCOGS_TOKEN) {
    headers['Authorization'] = `Discogs token=${process.env.DISCOGS_TOKEN}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    if (response.status === 429) {
      // Rate limited - wait and retry
      console.log('Rate limited by Discogs, waiting 60s...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      return rateLimitedFetch(url, options);
    }
    throw new Error(`Discogs API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function searchDiscogs(artist) {
  try {
    // Check if we have a token - Discogs API now requires authentication for search
    if (!process.env.DISCOGS_TOKEN) {
      console.log('No DISCOGS_TOKEN set - returning direct marketplace link');
      return [{
        artist: artist,
        album: 'Browse Vinyl on Discogs',
        price: 'Various',
        link: `https://www.discogs.com/search/?q=${encodeURIComponent(artist)}&type=release&format_exact=Vinyl`,
        source: 'Discogs',
        condition: 'Various',
        country: 'Various',
        year: '',
        isSearch: true
      }];
    }

    // Search for releases by this artist
    const searchUrl = new URL(`${DISCOGS_API_BASE}/database/search`);
    searchUrl.searchParams.set('artist', artist);
    searchUrl.searchParams.set('format', 'Vinyl');
    searchUrl.searchParams.set('type', 'release');
    searchUrl.searchParams.set('per_page', 15);

    console.log(`Searching Discogs for: ${artist}`);
    const searchData = await rateLimitedFetch(searchUrl.toString());

    if (!searchData.results || searchData.results.length === 0) {
      console.log(`No Discogs results for: ${artist}`);
      return [];
    }

    console.log(`Found ${searchData.results.length} releases for ${artist}`);

    const results = [];

    // Process each release to get marketplace listings
    for (const release of searchData.results.slice(0, 8)) {
      try {
        // Parse artist and album from title (format: "Artist - Album")
        let albumArtist = artist;
        let albumTitle = release.title;

        if (release.title.includes(' - ')) {
          const parts = release.title.split(' - ');
          albumArtist = parts[0];
          albumTitle = parts.slice(1).join(' - ');
        }

        // Get the release details to find marketplace listings
        const releaseUrl = `${DISCOGS_API_BASE}/releases/${release.id}`;
        const releaseData = await rateLimitedFetch(releaseUrl);

        // Check if there are items for sale
        const numForSale = releaseData.num_for_sale || 0;
        const lowestPrice = releaseData.lowest_price;

        if (numForSale > 0) {
          // Discogs API doesn't provide a public endpoint to list marketplace items
          // Link directly to the marketplace page for this release
          results.push({
            artist: albumArtist,
            album: albumTitle,
            price: lowestPrice ? `From $${lowestPrice}` : `${numForSale} for sale`,
            shipping: null, // Not available via API
            link: `https://www.discogs.com/sell/release/${release.id}`,
            source: 'Discogs',
            condition: 'Various',
            country: 'Various',
            year: releaseData.year || ''
          });
        } else {
          // No current listings - link to the release page
          results.push({
            artist: albumArtist,
            album: albumTitle,
            price: 'No listings',
            link: `https://www.discogs.com${release.uri || `/release/${release.id}`}`,
            source: 'Discogs',
            condition: 'N/A',
            country: 'N/A',
            year: releaseData.year || ''
          });
        }
      } catch (releaseError) {
        console.error(`Error fetching release ${release.id}:`, releaseError.message);
        // Still add basic info from search result
        let albumArtist = artist;
        let albumTitle = release.title;

        if (release.title.includes(' - ')) {
          const parts = release.title.split(' - ');
          albumArtist = parts[0];
          albumTitle = parts.slice(1).join(' - ');
        }

        results.push({
          artist: albumArtist,
          album: albumTitle,
          price: 'See listings',
          link: `https://www.discogs.com/sell/release/${release.id}`,
          source: 'Discogs',
          condition: 'Various',
          country: 'Various',
          year: release.year || ''
        });
      }
    }

    return results;
  } catch (error) {
    console.error(`Discogs search error for ${artist}:`, error.message);
    return [];
  }
}
