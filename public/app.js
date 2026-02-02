// Frontend logic for vinyl record search

const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('csvFile');
const searchBtn = document.getElementById('searchBtn');
const fileWrapper = document.querySelector('.file-input-wrapper');
const fileText = document.querySelector('.file-text');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');
const errorSection = document.getElementById('errorSection');
const resultsBody = document.getElementById('resultsBody');
const resultCount = document.getElementById('resultCount');
const sortBy = document.getElementById('sortBy');
const tokenNotice = document.getElementById('tokenNotice');
const quickAddForm = document.getElementById('quickAddForm');
const artistInputs = document.getElementById('artistInputs');
const addMoreBtn = document.getElementById('addMoreBtn');
const quickAddBtn = document.getElementById('quickAddBtn');

let currentResults = [];
let currentPriceFilter = 'all';
let currentSortColumn = 'artist';
let currentSortDirection = 'asc';
let currentSearchFilter = '';

const searchFilter = document.getElementById('searchFilter');

// Check if Discogs token is configured
async function checkStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    if (!data.hasDiscogsToken) {
      tokenNotice.classList.remove('hidden');
    }
  } catch (e) {
    console.error('Failed to check status:', e);
  }
}

// Load last results on startup
async function loadLastResults() {
  try {
    const response = await fetch('/api/results/latest');
    if (!response.ok) return;

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      currentResults = data.results;
      applyFiltersAndDisplay();
      resultsSection.classList.remove('hidden');

      // Show when the results are from
      const timestamp = new Date(data.timestamp);
      const artistList = data.artists ? data.artists.join(', ') : 'Unknown';
      console.log(`Loaded ${data.results.length} results from ${timestamp.toLocaleString()} for: ${artistList}`);
    }
  } catch (e) {
    // No previous results - that's fine
  }
}

checkStatus();
loadLastResults();

// Add more artist inputs
addMoreBtn.addEventListener('click', () => {
  const row = document.createElement('div');
  row.className = 'artist-input-row';
  row.innerHTML = `
    <input type="text" class="artist-input" placeholder="Artist name..." autocomplete="off">
    <button type="button" class="remove-artist-btn" title="Remove">&times;</button>
  `;
  artistInputs.appendChild(row);
  row.querySelector('.artist-input').focus();
});

// Remove artist input (event delegation)
artistInputs.addEventListener('click', (e) => {
  if (e.target.classList.contains('remove-artist-btn')) {
    const rows = artistInputs.querySelectorAll('.artist-input-row');
    if (rows.length > 1) {
      e.target.closest('.artist-input-row').remove();
    }
  }
});

// Handle quick add form
quickAddForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Get all non-empty artist names
  const inputs = artistInputs.querySelectorAll('.artist-input');
  const artists = Array.from(inputs)
    .map(input => input.value.trim())
    .filter(name => name.length > 0);

  if (artists.length === 0) return;

  // Show loading state
  loadingSection.classList.remove('hidden');
  errorSection.classList.add('hidden');
  quickAddBtn.disabled = true;
  addMoreBtn.disabled = true;

  try {
    const response = await fetch('/api/search/artists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artists })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Search failed');
    }

    currentResults = data.results;
    applyFiltersAndDisplay();

    loadingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    // Clear inputs and reset to single input
    artistInputs.innerHTML = `
      <div class="artist-input-row">
        <input type="text" class="artist-input" placeholder="Artist name..." autocomplete="off">
        <button type="button" class="remove-artist-btn" title="Remove">&times;</button>
      </div>
    `;
  } catch (error) {
    loadingSection.classList.add('hidden');
    errorSection.classList.remove('hidden');
    document.getElementById('errorMessage').textContent = error.message;
  } finally {
    quickAddBtn.disabled = false;
    addMoreBtn.disabled = false;
  }
});

// Handle file selection
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    fileWrapper.classList.add('has-file');
    fileText.textContent = file.name;
    searchBtn.disabled = false;
  } else {
    fileWrapper.classList.remove('has-file');
    fileText.textContent = 'Choose CSV file';
    searchBtn.disabled = true;
  }
});

// Handle form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const file = fileInput.files[0];
  if (!file) return;

  const uploadMode = document.querySelector('input[name="uploadMode"]:checked').value;

  // Show loading state
  loadingSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  searchBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('csv', file);
    formData.append('mode', uploadMode);

    const response = await fetch('/api/search', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Search failed');
    }

    currentResults = data.results;
    applyFiltersAndDisplay();

    loadingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
  } catch (error) {
    loadingSection.classList.add('hidden');
    errorSection.classList.remove('hidden');
    document.getElementById('errorMessage').textContent = error.message;
  } finally {
    searchBtn.disabled = false;
  }
});

// Handle sorting from dropdown
sortBy.addEventListener('change', () => {
  currentSortColumn = sortBy.value;
  currentSortDirection = 'asc';
  updateSortIndicators();
  applyFiltersAndDisplay();
});

// Handle sorting from column headers
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const column = th.dataset.sort;
    if (currentSortColumn === column) {
      currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortColumn = column;
      currentSortDirection = 'asc';
    }
    // Sync dropdown if column matches
    if (sortBy.querySelector(`option[value="${column}"]`)) {
      sortBy.value = column;
    }
    updateSortIndicators();
    applyFiltersAndDisplay();
  });
});

function updateSortIndicators() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === currentSortColumn) {
      th.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// Handle price filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPriceFilter = btn.dataset.filter;
    applyFiltersAndDisplay();
  });
});

// Handle search filter
searchFilter.addEventListener('input', () => {
  currentSearchFilter = searchFilter.value.toLowerCase();
  applyFiltersAndDisplay();
});

function parsePrice(priceStr) {
  if (!priceStr || typeof priceStr !== 'string') return null;
  // Extract numeric value from price string (e.g., "12.99 USD" -> 12.99)
  const match = priceStr.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

function filterByPrice(results, maxPrice) {
  if (maxPrice === 'all') return results;
  const max = parseFloat(maxPrice);
  return results.filter(r => {
    const total = calculateTotal(r);
    return total !== null && total < max;
  });
}

function applyFiltersAndDisplay() {
  let filtered = filterByPrice(currentResults, currentPriceFilter);
  filtered = filterBySearch(filtered, currentSearchFilter);
  const sorted = sortResults(filtered, currentSortColumn, currentSortDirection);
  displayResults(sorted);
}

function filterBySearch(results, searchText) {
  if (!searchText) return results;
  return results.filter(r => {
    const artist = (r.artist || '').toLowerCase();
    const album = (r.album || '').toLowerCase();
    return artist.includes(searchText) || album.includes(searchText);
  });
}

function sortResults(results, key, direction) {
  const numericColumns = ['price', 'shipping', 'total', 'year'];
  const isNumeric = numericColumns.includes(key);

  return [...results].sort((a, b) => {
    let aVal, bVal;

    if (key === 'total') {
      aVal = calculateTotal(a);
      bVal = calculateTotal(b);
    } else if (key === 'price' || key === 'shipping') {
      aVal = parsePrice(a[key]);
      bVal = parsePrice(b[key]);
    } else if (key === 'year') {
      aVal = parseInt(a[key]) || 0;
      bVal = parseInt(b[key]) || 0;
    } else {
      aVal = (a[key] || '').toString().toLowerCase();
      bVal = (b[key] || '').toString().toLowerCase();
    }

    // Handle nulls
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    let result;
    if (isNumeric) {
      result = aVal - bVal;
    } else {
      result = aVal.localeCompare(bVal);
    }

    return direction === 'desc' ? -result : result;
  });
}

function calculateTotal(result) {
  const price = parsePrice(result.price);
  const shipping = parsePrice(result.shipping);
  if (price === null) return null;
  return price + (shipping || 0);
}

function formatTotal(result) {
  const total = calculateTotal(result);
  if (total === null) return '-';
  return `$${total.toFixed(2)}`;
}

function formatPrice(priceStr) {
  if (!priceStr || typeof priceStr !== 'string') return '-';
  // Check if it's USD
  if (priceStr.includes('USD') || priceStr.match(/^\$?\d/)) {
    const match = priceStr.match(/[\d.]+/);
    if (match) {
      const num = parseFloat(match[0]);
      return `$${num.toFixed(2)}`;
    }
  }
  // Return non-USD prices as-is
  return priceStr;
}

function displayResults(results) {
  // Count actual listings vs search links
  const actualListings = results.filter(r => !r.isSearch).length;
  const searchLinks = results.filter(r => r.isSearch).length;

  let countText = `(${actualListings} listings`;
  if (searchLinks > 0) {
    countText += `, ${searchLinks} search links`;
  }
  countText += ')';
  resultCount.textContent = countText;

  resultsBody.innerHTML = results.map(result => {
    const rowClass = result.isSearch ? 'search-row' : '';
    const linkText = result.isSearch ? 'Search' : 'View Listing';

    return `
    <tr class="${rowClass}">
      <td>${escapeHtml(result.artist)}</td>
      <td>${escapeHtml(result.album)}</td>
      <td>${escapeHtml(result.year || '-')}</td>
      <td>${escapeHtml(formatPrice(result.price))}</td>
      <td>${escapeHtml(formatPrice(result.shipping))}</td>
      <td>${escapeHtml(formatTotal(result))}</td>
      <td>${escapeHtml(result.condition || 'N/A')}</td>
      <td><span class="source-badge source-${result.source.toLowerCase().replace(/\s+/g, '')}">${escapeHtml(result.source)}</span></td>
      <td><a href="${escapeHtml(result.link)}" target="_blank" rel="noopener">${linkText}</a></td>
    </tr>
  `}).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
