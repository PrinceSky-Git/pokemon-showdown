const fs = require('fs');
const fetch = require('node-fetch');

// All official Pokemon TCG rarities from Base Set (1999) to Scarlet & Violet (2025)
const VALID_RARITIES = [
  // Base rarities (1999-present)
  'Common',
  'Uncommon',
  'Rare',
  'Rare Holo',
  
  // EX Era rarities (2003-2007)
  'Rare Holo EX',
  'Rare Holo Star',
  'Rare Holo LV.X',
  
  // Prime/Legend Era rarities (2009-2011)
  'Rare Prime',
  'Rare LEGEND',
  
  // BW/XY Era rarities (2011-2016)
  'Rare ACE',
  'Rare BREAK',
  'Rare Holo GX',
  'Rare Secret',
  'Rare Ultra',
  'Rare Rainbow',
  
  // Sun & Moon additions (2017-2019)
  'Rare Shiny',
  'Rare Shiny GX',
  
  // Sword & Shield Era rarities (2020-2023)
  'Rare Holo V',
  'Rare Holo VMAX',
  'Rare Holo VSTAR',
  'Amazing Rare',
  'Radiant Rare',
  'Trainer Gallery Rare Holo',
  
  // Scarlet & Violet Era rarities (2023-present)
  'Illustration Rare',
  'Special Illustration Rare',
  'Hyper Rare',
  'Ultra Rare',
  'Double Rare',
  
  // Special/Promo rarities
  'Promo',
  'Rare Shining',
  'Classic'
];

// Special subtypes that get bonus points
const SPECIAL_SUBTYPES = [
  'BREAK',          // +2 points
  'EX',             // +3 points
  'GX',             // +3 points
  'V',              // +3 points
  'ex',             // +3 points
  'MEGA',           // +3 points
  'LV.X',           // +3 points
  'Radiant',        // +3 points
  'Amazing',        // +3 points
  'Legend',         // +4 points
  'Prime',          // +4 points
  'Shining',        // +4 points
  '★',              // +4 points
  'VMAX',           // +5 points
  'VSTAR',          // +5 points
  'Tag Team',       // +6 points
  'GMAX'            // +5 points (variant of VMAX)
];

// All Pokemon TCG sets with their set codes and names
const SETS = [
  // Original Series (1999-2003)
  { code: 'base1', name: 'Base Set', series: 'Original' },
  { code: 'base2', name: 'Jungle', series: 'Original' },
  { code: 'base3', name: 'Fossil', series: 'Original' },
  { code: 'base4', name: 'Base Set 2', series: 'Original' },
  { code: 'base5', name: 'Team Rocket', series: 'Original' },
  { code: 'gym1', name: 'Gym Heroes', series: 'Gym' },
  { code: 'gym2', name: 'Gym Challenge', series: 'Gym' },
  { code: 'neo1', name: 'Neo Genesis', series: 'Neo' },
  { code: 'neo2', name: 'Neo Discovery', series: 'Neo' },
  { code: 'neo3', name: 'Neo Revelation', series: 'Neo' },
  { code: 'neo4', name: 'Neo Destiny', series: 'Neo' },
  { code: 'base6', name: 'Legendary Collection', series: 'Original' },
  
  // E-Card Series (2002-2003)
  { code: 'ecard1', name: 'Expedition Base Set', series: 'E-Card' },
  { code: 'ecard2', name: 'Aquapolis', series: 'E-Card' },
  { code: 'ecard3', name: 'Skyridge', series: 'E-Card' },
  
  // EX Series (2003-2007)
  { code: 'ex1', name: 'Ruby & Sapphire', series: 'EX' },
  { code: 'ex2', name: 'Sandstorm', series: 'EX' },
  { code: 'ex3', name: 'Dragon', series: 'EX' },
  { code: 'ex4', name: 'Team Magma vs Team Aqua', series: 'EX' },
  { code: 'ex5', name: 'Hidden Legends', series: 'EX' },
  { code: 'ex6', name: 'FireRed & LeafGreen', series: 'EX' },
  { code: 'ex7', name: 'Team Rocket Returns', series: 'EX' },
  { code: 'ex8', name: 'Deoxys', series: 'EX' },
  { code: 'ex9', name: 'Emerald', series: 'EX' },
  { code: 'ex10', name: 'Unseen Forces', series: 'EX' },
  { code: 'ex11', name: 'Delta Species', series: 'EX' },
  { code: 'ex12', name: 'Legend Maker', series: 'EX' },
  { code: 'ex13', name: 'Holon Phantoms', series: 'EX' },
  { code: 'ex14', name: 'Crystal Guardians', series: 'EX' },
  { code: 'ex15', name: 'Dragon Frontiers', series: 'EX' },
  { code: 'ex16', name: 'Power Keepers', series: 'EX' },
  
  // Diamond & Pearl Series (2007-2009)
  { code: 'dp1', name: 'Diamond & Pearl', series: 'Diamond & Pearl' },
  { code: 'dp2', name: 'Mysterious Treasures', series: 'Diamond & Pearl' },
  { code: 'dp3', name: 'Secret Wonders', series: 'Diamond & Pearl' },
  { code: 'dp4', name: 'Great Encounters', series: 'Diamond & Pearl' },
  { code: 'dp5', name: 'Majestic Dawn', series: 'Diamond & Pearl' },
  { code: 'dp6', name: 'Legends Awakened', series: 'Diamond & Pearl' },
  { code: 'dp7', name: 'Stormfront', series: 'Diamond & Pearl' },
  
  // Platinum Series (2009-2010)
  { code: 'pl1', name: 'Platinum', series: 'Platinum' },
  { code: 'pl2', name: 'Rising Rivals', series: 'Platinum' },
  { code: 'pl3', name: 'Supreme Victors', series: 'Platinum' },
  { code: 'pl4', name: 'Arceus', series: 'Platinum' },
  
  // HeartGold & SoulSilver Series (2010-2011)
  { code: 'hgss1', name: 'HeartGold & SoulSilver', series: 'HGSS' },
  { code: 'hgss2', name: 'Unleashed', series: 'HGSS' },
  { code: 'hgss3', name: 'Undaunted', series: 'HGSS' },
  { code: 'hgss4', name: 'Triumphant', series: 'HGSS' },
  { code: 'col1', name: 'Call of Legends', series: 'HGSS' },
  
  // Black & White Series (2011-2013)
  { code: 'bw1', name: 'Black & White', series: 'Black & White' },
  { code: 'bw2', name: 'Emerging Powers', series: 'Black & White' },
  { code: 'bw3', name: 'Noble Victories', series: 'Black & White' },
  { code: 'bw4', name: 'Next Destinies', series: 'Black & White' },
  { code: 'bw5', name: 'Dark Explorers', series: 'Black & White' },
  { code: 'bw6', name: 'Dragons Exalted', series: 'Black & White' },
  { code: 'bw7', name: 'Boundaries Crossed', series: 'Black & White' },
  { code: 'bw8', name: 'Plasma Storm', series: 'Black & White' },
  { code: 'bw9', name: 'Plasma Freeze', series: 'Black & White' },
  { code: 'bw10', name: 'Plasma Blast', series: 'Black & White' },
  { code: 'bw11', name: 'Legendary Treasures', series: 'Black & White' },
  
  // XY Series (2014-2016)
  { code: 'xy0', name: 'Kalos Starter Set', series: 'XY' },
  { code: 'xy1', name: 'XY Base Set', series: 'XY' },
  { code: 'xy2', name: 'Flashfire', series: 'XY' },
  { code: 'xy3', name: 'Furious Fists', series: 'XY' },
  { code: 'xy4', name: 'Phantom Forces', series: 'XY' },
  { code: 'xy5', name: 'Primal Clash', series: 'XY' },
  { code: 'xy6', name: 'Roaring Skies', series: 'XY' },
  { code: 'xy7', name: 'Ancient Origins', series: 'XY' },
  { code: 'xy8', name: 'BREAKthrough', series: 'XY' },
  { code: 'xy9', name: 'BREAKpoint', series: 'XY' },
  { code: 'xy10', name: 'Fates Collide', series: 'XY' },
  { code: 'xy11', name: 'Steam Siege', series: 'XY' },
  { code: 'xy12', name: 'Evolutions', series: 'XY' },
  
  // Sun & Moon Series (2017-2019)
  { code: 'sm1', name: 'Sun & Moon Base Set', series: 'Sun & Moon' },
  { code: 'sm2', name: 'Guardians Rising', series: 'Sun & Moon' },
  { code: 'sm3', name: 'Burning Shadows', series: 'Sun & Moon' },
  { code: 'sm35', name: 'Shining Legends', series: 'Sun & Moon' },
  { code: 'sm4', name: 'Crimson Invasion', series: 'Sun & Moon' },
  { code: 'sm5', name: 'Ultra Prism', series: 'Sun & Moon' },
  { code: 'sm6', name: 'Forbidden Light', series: 'Sun & Moon' },
  { code: 'sm7', name: 'Celestial Storm', series: 'Sun & Moon' },
  { code: 'sm75', name: 'Dragon Majesty', series: 'Sun & Moon' },
  { code: 'sm8', name: 'Lost Thunder', series: 'Sun & Moon' },
  { code: 'sm9', name: 'Team Up', series: 'Sun & Moon' },
  { code: 'sm10', name: 'Unbroken Bonds', series: 'Sun & Moon' },
  { code: 'sm11', name: 'Unified Minds', series: 'Sun & Moon' },
  { code: 'sm115', name: 'Hidden Fates', series: 'Sun & Moon' },
  { code: 'sm12', name: 'Cosmic Eclipse', series: 'Sun & Moon' },
  
  // Sword & Shield Series (2020-2023)
  { code: 'swsh1', name: 'Sword & Shield Base Set', series: 'Sword & Shield' },
  { code: 'swsh2', name: 'Rebel Clash', series: 'Sword & Shield' },
  { code: 'swsh3', name: 'Darkness Ablaze', series: 'Sword & Shield' },
  { code: 'swsh35', name: 'Champion\'s Path', series: 'Sword & Shield' },
  { code: 'swsh4', name: 'Vivid Voltage', series: 'Sword & Shield' },
  { code: 'swsh45', name: 'Shining Fates', series: 'Sword & Shield' },
  { code: 'swsh5', name: 'Battle Styles', series: 'Sword & Shield' },
  { code: 'swsh6', name: 'Chilling Reign', series: 'Sword & Shield' },
  { code: 'swsh7', name: 'Evolving Skies', series: 'Sword & Shield' },
  { code: 'swsh8', name: 'Fusion Strike', series: 'Sword & Shield' },
  { code: 'swsh9', name: 'Brilliant Stars', series: 'Sword & Shield' },
  { code: 'swsh10', name: 'Astral Radiance', series: 'Sword & Shield' },
  { code: 'swsh11', name: 'Lost Origin', series: 'Sword & Shield' },
  { code: 'swsh12', name: 'Silver Tempest', series: 'Sword & Shield' },
  { code: 'swsh12pt5', name: 'Crown Zenith', series: 'Sword & Shield' },
  
  // Scarlet & Violet Series (2023-present)
  { code: 'sv1', name: 'Scarlet & Violet Base Set', series: 'Scarlet & Violet' },
  { code: 'sv2', name: 'Paldea Evolved', series: 'Scarlet & Violet' },
  { code: 'sv3', name: 'Obsidian Flames', series: 'Scarlet & Violet' },
  { code: 'sv3pt5', name: '151', series: 'Scarlet & Violet' },
  { code: 'sv4', name: 'Paradox Rift', series: 'Scarlet & Violet' },
  { code: 'sv4pt5', name: 'Paldean Fates', series: 'Scarlet & Violet' },
  { code: 'sv5', name: 'Temporal Forces', series: 'Scarlet & Violet' },
  { code: 'sv6', name: 'Twilight Masquerade', series: 'Scarlet & Violet' },
  { code: 'sv6pt5', name: 'Shrouded Fable', series: 'Scarlet & Violet' },
  { code: 'sv7', name: 'Stellar Crown', series: 'Scarlet & Violet' },
  { code: 'sv8', name: 'Surging Sparks', series: 'Scarlet & Violet' },
  
  // Promo Sets
  { code: 'pop1', name: 'POP Series 1', series: 'Promo' },
  { code: 'pop2', name: 'POP Series 2', series: 'Promo' },
  { code: 'pop3', name: 'POP Series 3', series: 'Promo' },
  { code: 'pop4', name: 'POP Series 4', series: 'Promo' },
  { code: 'pop5', name: 'POP Series 5', series: 'Promo' },
  { code: 'pop6', name: 'POP Series 6', series: 'Promo' },
  { code: 'pop7', name: 'POP Series 7', series: 'Promo' },
  { code: 'pop8', name: 'POP Series 8', series: 'Promo' },
  { code: 'pop9', name: 'POP Series 9', series: 'Promo' },
];

// Utility: format nameId (lowercase, replace non-alphanumeric with nothing)
function formatNameId(setId, name) {
  return setId + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Utility: map API rarity to PSGO rarity
function mapRarity(apiRarity, subtypes) {
  if (!apiRarity) return 'Common';
  
  // Direct mappings
  const rarityMap = {
    'Common': 'Common',
    'Uncommon': 'Uncommon',
    'Rare': 'Rare',
    'Rare Holo': 'Rare Holo',
    'Rare Holo EX': 'Rare Holo EX',
    'Rare Holo GX': 'Rare Holo GX',
    'Rare Holo V': 'Rare Holo V',
    'Rare Holo VMAX': 'Rare Holo VMAX',
    'Rare Holo VSTAR': 'Rare Holo VSTAR',
    'Rare Ultra': 'Rare Ultra',
    'Rare Secret': 'Rare Secret',
    'Rare Rainbow': 'Rare Rainbow',
    'Rare Shiny': 'Rare Shiny',
    'Rare Shiny GX': 'Rare Shiny GX',
    'Rare BREAK': 'Rare BREAK',
    'Rare Prime': 'Rare Prime',
    'Rare LEGEND': 'Rare LEGEND',
    'Rare ACE SPEC': 'Rare ACE',
    'Amazing Rare': 'Amazing Rare',
    'Radiant Rare': 'Radiant Rare',
    'Trainer Gallery Rare Holo': 'Trainer Gallery Rare Holo',
    'Illustration Rare': 'Illustration Rare',
    'Special Illustration Rare': 'Special Illustration Rare',
    'Hyper Rare': 'Hyper Rare',
    'Ultra Rare': 'Ultra Rare',
    'Double Rare': 'Double Rare',
    'Promo': 'Promo',
    'LEGEND': 'Rare LEGEND',
    'Rare Holo Star': 'Rare Holo Star',
    'Rare Holo LV.X': 'Rare Holo LV.X',
    'Rare Shining': 'Rare Shining',
    'Classic': 'Classic'
  };
  
  // Check for exact match first
  if (rarityMap[apiRarity]) {
    return rarityMap[apiRarity];
  }
  
  // Check for subtype-based rarity inference
  if (subtypes && subtypes.length > 0) {
    if (subtypes.includes('VMAX')) return 'Rare Holo VMAX';
    if (subtypes.includes('VSTAR')) return 'Rare Holo VSTAR';
    if (subtypes.includes('V')) return 'Rare Holo V';
    if (subtypes.includes('GX')) return 'Rare Holo GX';
    if (subtypes.includes('EX')) return 'Rare Holo EX';
    if (subtypes.includes('BREAK')) return 'Rare BREAK';
    if (subtypes.includes('Prime')) return 'Rare Prime';
    if (subtypes.includes('LEGEND')) return 'Rare LEGEND';
    if (subtypes.includes('LV.X')) return 'Rare Holo LV.X';
  }
  
  // Fallback based on rarity keywords
  if (apiRarity.includes('Holo')) return 'Rare Holo';
  if (apiRarity.includes('Rare')) return 'Rare';
  
  return 'Common';
}

// Utility: determine types string with dual types and subtype if present
function formatTypes(card) {
  if (card.supertype === 'Trainer') return 'Trainer';
  if (card.supertype === 'Energy') return 'Energy';

  if (card.types && card.types.length > 0) {
    let typesStr = card.types.join('/');
    
    // Find special subtype (check in order of specificity)
    const foundSpecial = card.subtypes?.find((sub) => SPECIAL_SUBTYPES.includes(sub));
    
    if (foundSpecial) {
      typesStr += ' - ' + foundSpecial;
    }
    
    return typesStr;
  }

  return 'Unknown';
}

async function fetchCards(url, setId, setName) {
  try {
    console.log(`  Fetching ${url}...`);
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`Failed to fetch ${setId}: ${res.statusText}`);
      return {};
    }
    const cards = await res.json();

    const converted = {};
    for (const card of cards) {
      const id = card.id;
      const name = card.name;
      const nameId = formatNameId(setId, name);
      const image = card.images?.large || '';
      const rarity = mapRarity(card.rarity, card.subtypes);
      const cardNumber = card.number;

      converted[id] = {
        id,
        name,
        nameId,
        image,
        rarity,
        set: setName,
        setId,
        cardNumber,
        types: formatTypes(card),
      };
    }
    console.log(`  ✓ Processed ${Object.keys(converted).length} cards from ${setName}`);
    return converted;
  } catch (error) {
    console.log(` Error fetching ${setId}: ${error.message}`);
    return {};
  }
}

async function main() {
  try {
    const baseUrl = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/refs/heads/master/cards/en/';
    const allCards = {};
    
    console.log(`Starting to fetch ${SETS.length} sets...\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const set of SETS) {
      const url = `${baseUrl}${set.code}.json`;
      const cards = await fetchCards(url, set.code, set.name);
      
      if (Object.keys(cards).length > 0) {
        Object.assign(allCards, cards);
        successCount++;
      } else {
        failCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const fileName = 'cardDefinitions-complete.json';
    fs.writeFileSync(fileName, JSON.stringify(allCards, null, 2));

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✓ Done! Processed ${successCount} sets successfully`);
    console.log(`✗ Failed to fetch ${failCount} sets`);
    console.log(`Total cards saved: ${Object.keys(allCards).length}`);
    console.log(`Output file: ${fileName}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Output rarity distribution
    const rarityCounts = {};
    for (const cardId in allCards) {
      const rarity = allCards[cardId].rarity;
      rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;
    }
    
    console.log('Rarity distribution:');
    const sortedRarities = Object.entries(rarityCounts).sort((a, b) => b[1] - a[1]);
    for (const [rarity, count] of sortedRarities) {
      console.log(`  ${rarity.padEnd(30)} ${count.toString().padStart(6)}`);
    }
    
    // Output series distribution
    console.log('\nSeries distribution:');
    const seriesCounts = {};
    for (const cardId in allCards) {
      const card = allCards[cardId];
      // Get series from SETS array
      const setInfo = SETS.find(s => s.code === card.setId);
      const series = setInfo ? setInfo.series : 'Unknown';
      seriesCounts[series] = (seriesCounts[series] || 0) + 1;
    }
    const sortedSeries = Object.entries(seriesCounts).sort((a, b) => b[1] - a[1]);
    for (const [series, count] of sortedSeries) {
      console.log(`  ${series.padEnd(30)} ${count.toString().padStart(6)}`);
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

main();
    
