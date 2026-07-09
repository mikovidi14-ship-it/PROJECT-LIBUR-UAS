// Maps category/product name keywords to an elegant icon + gradient pair
// used for product visuals when no real photo (image_url) is provided.

const PALETTES = [
  { gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', icon: 'fa-laptop' },
  { gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', icon: 'fa-shirt' },
  { gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', icon: 'fa-mug-hot' },
  { gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', icon: 'fa-gem' },
  { gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', icon: 'fa-mobile-screen' },
  { gradient: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)', icon: 'fa-box-open' },
  { gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', icon: 'fa-gift' },
  { gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', icon: 'fa-star' }
];

const KEYWORD_MAP = [
  { keywords: ['elektronik', 'mouse', 'keyboard', 'laptop', 'komputer', 'gadget'], icon: 'fa-laptop', gradient: PALETTES[0].gradient },
  { keywords: ['fashion', 'kaos', 'baju', 'celana', 'jeans', 'sepatu', 'jaket'], icon: 'fa-shirt', gradient: PALETTES[1].gradient },
  { keywords: ['makanan', 'minuman', 'kopi', 'snack', 'food'], icon: 'fa-mug-hot', gradient: PALETTES[2].gradient },
  { keywords: ['aksesoris', 'perhiasan', 'jam'], icon: 'fa-gem', gradient: PALETTES[3].gradient },
  { keywords: ['hp', 'phone', 'handphone', 'smartphone'], icon: 'fa-mobile-screen', gradient: PALETTES[4].gradient }
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getProductVisual(product, category) {
  if (product && product.image_url) {
    return { type: 'image', src: product.image_url };
  }

  const haystack = `${category ? category.name : ''} ${product ? product.name : ''}`.toLowerCase();

  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some(k => haystack.includes(k))) {
      return { type: 'icon', icon: entry.icon, gradient: entry.gradient };
    }
  }

  // Fallback: deterministic palette based on name hash so it's consistent
  const idx = hashString(haystack || 'default') % PALETTES.length;
  return { type: 'icon', icon: PALETTES[idx].icon, gradient: PALETTES[idx].gradient };
}

module.exports = { getProductVisual };
