import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { searchDiscogs } from './lib/discogs.js';
import { searchEbay } from './lib/ebay.js';
import { searchWeb } from './lib/webSearch.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Data directory for persisting results
const DATA_DIR = join(__dirname, 'data');
const LAST_RESULTS_FILE = join(DATA_DIR, 'last-results.json');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

function saveLastResults(results, artists) {
  const data = {
    timestamp: new Date().toISOString(),
    artists,
    results
  };
  writeFileSync(LAST_RESULTS_FILE, JSON.stringify(data, null, 2));
}

function loadLastResults() {
  if (!existsSync(LAST_RESULTS_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(LAST_RESULTS_FILE, 'utf-8'));
  } catch (e) {
    return null;
  }
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

// Parse CSV and extract artist names
function parseArtists(csvContent) {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  // Try to find artist column, or treat each row as a single artist name
  if (records.length === 0) {
    // Maybe it's a simple list without headers
    const lines = csvContent.toString().split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    return lines;
  }

  const firstRecord = records[0];
  const keys = Object.keys(firstRecord);

  // Look for common artist column names
  const artistKey = keys.find(k =>
    /^(artist|artists|name|band)$/i.test(k)
  ) || keys[0];

  return records.map(r => r[artistKey]).filter(Boolean);
}

// Search endpoint
app.post('/api/search', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const newArtists = parseArtists(req.file.buffer.toString());
    const mode = req.body.mode || 'replace';

    if (newArtists.length === 0) {
      return res.status(400).json({ error: 'No artists found in CSV' });
    }

    // Load existing data if appending
    let existingData = null;
    let existingArtists = [];
    let existingResults = [];

    if (mode === 'append') {
      existingData = loadLastResults();
      if (existingData) {
        existingArtists = existingData.artists || [];
        existingResults = existingData.results || [];
      }
    }

    // Filter out artists we already have results for (case-insensitive)
    const existingArtistsLower = existingArtists.map(a => a.toLowerCase());
    const artistsToSearch = mode === 'append'
      ? newArtists.filter(a => !existingArtistsLower.includes(a.toLowerCase()))
      : newArtists;

    console.log(`Mode: ${mode}, Searching for ${artistsToSearch.length} new artists:`, artistsToSearch);

    const newResults = [];

    for (const artist of artistsToSearch) {
      console.log(`Searching for: ${artist}`);

      // Search Discogs first
      const discogsResults = await searchDiscogs(artist);
      newResults.push(...discogsResults);

      // Search eBay
      const ebayResults = await searchEbay(artist);
      newResults.push(...ebayResults);

      // Add web search results
      const webResults = await searchWeb(artist);
      newResults.push(...webResults);

      // Small delay between artists to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Combine results based on mode
    const allArtists = mode === 'append'
      ? [...existingArtists, ...artistsToSearch]
      : newArtists;
    const allResults = mode === 'append'
      ? [...existingResults, ...newResults]
      : newResults;

    // Save results for next time
    saveLastResults(allResults, allArtists);

    res.json({ results: allResults, artists: allArtists });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

// Add multiple artists endpoint
app.post('/api/search/artists', async (req, res) => {
  try {
    const { artists } = req.body;

    if (!artists || !Array.isArray(artists) || artists.length === 0) {
      return res.status(400).json({ error: 'Artists array required' });
    }

    // Load existing data
    const existingData = loadLastResults();
    const existingArtists = existingData?.artists || [];
    const existingResults = existingData?.results || [];
    const existingArtistsLower = existingArtists.map(a => a.toLowerCase());

    // Filter out artists that already exist
    const newArtists = artists
      .map(a => a.trim())
      .filter(a => a.length > 0)
      .filter(a => !existingArtistsLower.includes(a.toLowerCase()));

    if (newArtists.length === 0) {
      return res.status(400).json({ error: 'All artists already in list' });
    }

    console.log(`Adding ${newArtists.length} artists:`, newArtists);

    const newResults = [];

    for (const artistName of newArtists) {
      console.log(`Searching for: ${artistName}`);

      // Search Discogs
      const discogsResults = await searchDiscogs(artistName);
      newResults.push(...discogsResults);

      // Search eBay
      const ebayResults = await searchEbay(artistName);
      newResults.push(...ebayResults);

      // Search web
      const webResults = await searchWeb(artistName);
      newResults.push(...webResults);

      // Small delay between artists
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Combine with existing
    const allArtists = [...existingArtists, ...newArtists];
    const allResults = [...existingResults, ...newResults];

    // Save
    saveLastResults(allResults, allArtists);

    res.json({ results: allResults, artists: allArtists });
  } catch (error) {
    console.error('Artists search error:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

// Get last search results
app.get('/api/results/latest', (req, res) => {
  const data = loadLastResults();
  if (!data) {
    return res.status(404).json({ error: 'No previous results found' });
  }
  res.json(data);
});

// Status endpoint to check configuration
app.get('/api/status', (req, res) => {
  res.json({
    hasDiscogsToken: !!process.env.DISCOGS_TOKEN,
    hasEbayCredentials: !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
    ebayMode: process.env.EBAY_SANDBOX === 'true' ? 'sandbox' : 'production'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vinyl search server running at http://localhost:${PORT}`);
  if (process.env.DISCOGS_TOKEN) {
    console.log('Discogs API token configured');
  } else {
    console.log('No DISCOGS_TOKEN found - using search links only');
  }
  if (process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) {
    const mode = process.env.EBAY_SANDBOX === 'true' ? 'sandbox' : 'production';
    console.log(`eBay API configured (${mode} mode)`);
  } else {
    console.log('No eBay credentials found - using search links only');
  }
});
