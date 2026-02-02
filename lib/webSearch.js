// Web search integration for finding vinyl records on various marketplaces
// Note: Without APIs, we can only provide search links to other marketplaces

export async function searchWeb(artist) {
  // Since eBay, Amazon, etc. don't have public APIs for marketplace listings,
  // we return curated search links that users can click to search those platforms
  // These are clearly marked as "Search" results, not individual listings

  const encodedArtist = encodeURIComponent(artist);
  const encodedQuery = encodeURIComponent(`${artist} vinyl record`);

  return [
    {
      artist: artist,
      album: '[Search eBay]',
      price: 'Various',
      link: `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sacat=176985&LH_ItemCondition=4`,
      source: 'eBay',
      condition: 'Various',
      country: 'Various',
      isSearch: true
    },
    {
      artist: artist,
      album: '[Search Amazon]',
      price: 'Various',
      link: `https://www.amazon.com/s?k=${encodedQuery}&i=popular`,
      source: 'Amazon',
      condition: 'Various',
      country: 'Various',
      isSearch: true
    }
  ];
}
