// eBay API client for searching vinyl listings

const SANDBOX_API_BASE = 'https://api.sandbox.ebay.com';
const PRODUCTION_API_BASE = 'https://api.ebay.com';

// Token cache
let cachedToken = null;
let tokenExpiry = 0;

function getApiBase() {
  return process.env.EBAY_SANDBOX === 'true' ? SANDBOX_API_BASE : PRODUCTION_API_BASE;
}

async function getAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('eBay credentials not configured');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const apiBase = getApiBase();

  const response = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay auth failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  return cachedToken;
}

export async function searchEbay(artist) {
  try {
    const clientId = process.env.EBAY_CLIENT_ID;

    if (!clientId) {
      console.log('No EBAY_CLIENT_ID set - returning direct search link');
      return [{
        artist: artist,
        album: 'Browse Vinyl on eBay',
        price: 'Various',
        link: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(artist + ' vinyl record')}&_sacat=176985`,
        source: 'eBay',
        condition: 'Various',
        country: 'Various',
        year: '',
        isSearch: true
      }];
    }

    const token = await getAccessToken();
    const apiBase = getApiBase();

    // Search for vinyl records by this artist
    const searchQuery = `${artist} vinyl record`;
    const searchUrl = new URL(`${apiBase}/buy/browse/v1/item_summary/search`);
    searchUrl.searchParams.set('q', searchQuery);
    searchUrl.searchParams.set('category_ids', '176985'); // Records category
    searchUrl.searchParams.set('limit', '10');
    // Request extended fields including shipping
    searchUrl.searchParams.set('fieldgroups', 'EXTENDED,MATCHING_ITEMS');

    console.log(`Searching eBay for: ${artist}`);

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`eBay search error: ${response.status} - ${error}`);
      // Fallback to search link
      return [{
        artist: artist,
        album: 'Browse Vinyl on eBay',
        price: 'Various',
        link: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(artist + ' vinyl record')}&_sacat=176985`,
        source: 'eBay',
        condition: 'Various',
        country: 'Various',
        year: '',
        isSearch: true
      }];
    }

    const data = await response.json();

    if (!data.itemSummaries || data.itemSummaries.length === 0) {
      console.log(`No eBay results for: ${artist}`);
      return [];
    }

    console.log(`Found ${data.itemSummaries.length} eBay listings for ${artist}`);

    const results = data.itemSummaries.map(item => {
      // Try to extract album name from title
      let albumTitle = item.title;

      // Clean up common suffixes
      albumTitle = albumTitle
        .replace(/vinyl\s*(record|lp|album)?/gi, '')
        .replace(/\s*(new|sealed|rare|original|pressing)\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Get shipping cost if available
      const shippingCost = item.shippingOptions?.[0]?.shippingCost;
      const shipping = shippingCost ? `${shippingCost.value} ${shippingCost.currency}` : null;

      return {
        artist: artist,
        album: albumTitle,
        price: item.price ? `${item.price.value} ${item.price.currency}` : 'See listing',
        shipping: shipping,
        link: item.itemWebUrl,
        source: 'eBay',
        condition: item.condition || 'See listing',
        country: item.itemLocation?.country || 'Unknown',
        year: ''
      };
    });

    return results;
  } catch (error) {
    console.error(`eBay search error for ${artist}:`, error.message);
    // Return fallback search link on error
    return [{
      artist: artist,
      album: 'Browse Vinyl on eBay',
      price: 'Various',
      link: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(artist + ' vinyl record')}&_sacat=176985`,
      source: 'eBay',
      condition: 'Various',
      country: 'Various',
      year: '',
      isSearch: true
    }];
  }
}
