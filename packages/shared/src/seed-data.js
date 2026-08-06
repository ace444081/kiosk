/**
 * Seed menu for the Sweet Gonz Bakeshop Cafe pilot.
 *
 * Prices are integer centavos. Product names never change between locales;
 * descriptions are stored bilingually.
 *
 * IMPORTANT (documented in docs/MENU_VALIDATION.md): the add-on compatibility
 * matrix below is PROVISIONAL and requires client confirmation before the
 * pilot menu is finalized.
 */

export const CATEGORIES = [
  { slug: 'pasta', sortOrder: 1, nameEn: 'Pasta', nameFil: 'Pasta' },
  { slug: 'snacks', sortOrder: 2, nameEn: 'Snacks', nameFil: 'Meryenda' },
  { slug: 'bread', sortOrder: 3, nameEn: 'Bread', nameFil: 'Tinapay' },
  { slug: 'drip-coffee', sortOrder: 4, nameEn: 'Drip Coffee', nameFil: 'Drip Coffee' },
  { slug: 'espresso', sortOrder: 5, nameEn: 'Espresso', nameFil: 'Espresso' },
  {
    slug: 'ice-shaken',
    sortOrder: 6,
    nameEn: 'Ice-Shaken Drinks',
    nameFil: 'Mga Ice-Shaken na Inumin',
  },
  {
    slug: 'non-coffee',
    sortOrder: 7,
    nameEn: 'Non-Coffee Drinks',
    nameFil: 'Mga Inuming Walang Kape',
  },
];

export const ADDONS = [
  {
    sku: 'addon-drip-shot',
    nameEn: 'Drip Coffee Shot',
    nameFil: 'Drip Coffee Shot',
    priceCentavos: 1000,
    sortOrder: 1,
  },
  {
    sku: 'addon-espresso-shot',
    nameEn: 'Espresso Shot',
    nameFil: 'Espresso Shot',
    priceCentavos: 3500,
    sortOrder: 2,
  },
  {
    sku: 'addon-syrup-sauce',
    nameEn: 'Syrup/Sauce',
    nameFil: 'Syrup/Sarsa',
    priceCentavos: 1500,
    sortOrder: 3,
  },
  {
    sku: 'addon-fruit-puree',
    nameEn: 'Fruit Purée',
    nameFil: 'Fruit Purée',
    priceCentavos: 1500,
    sortOrder: 4,
  },
];

/**
 * Provisional compatibility matrix. A product may take an add-on when at
 * least one rule matches:
 *  - drip-shot:      category drip-coffee
 *  - espresso-shot:  category espresso OR drip-coffee (coffee-based drinks)
 *  - syrup-sauce:    categories drip-coffee, espresso, non-coffee
 *  - fruit-puree:    category ice-shaken OR fruit-milk skus (strawberry,
 *                    blueberry, mango milk)
 * No add-ons for food (pasta, snacks, bread).
 */
export const ADDON_RULES = {
  'addon-drip-shot': (p) => p.categorySlug === 'drip-coffee',
  'addon-espresso-shot': (p) => p.categorySlug === 'espresso' || p.categorySlug === 'drip-coffee',
  'addon-syrup-sauce': (p) => ['drip-coffee', 'espresso', 'non-coffee'].includes(p.categorySlug),
  'addon-fruit-puree': (p) =>
    p.categorySlug === 'ice-shaken' ||
    ['strawberry-milk', 'blueberry-milk', 'mango-milk'].includes(p.sku),
};

/**
 * Required option group: Crinkled Fries flavor. Exactly one no-cost choice.
 */
export const FRIES_FLAVOR_GROUP = {
  sku: 'fries-flavor',
  nameEn: 'Flavor',
  nameFil: 'Lasap',
  isRequired: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { sku: 'fries-cheese', nameEn: 'Cheese', nameFil: 'Keso', priceCentavos: 0, sortOrder: 1 },
    {
      sku: 'fries-sour-cream',
      nameEn: 'Sour Cream',
      nameFil: 'Sour Cream',
      priceCentavos: 0,
      sortOrder: 2,
    },
  ],
};

export const PRODUCTS = [
  // --- Pasta ---------------------------------------------------------------
  {
    sku: 'baked-macaroni',
    categorySlug: 'pasta',
    name: 'Baked Macaroni',
    priceCentavos: 10500,
    sortOrder: 1,
    descriptionEn: 'Creamy baked macaroni topped with melted cheese.',
    descriptionFil: 'Creamy na baked macaroni na nilagyan ng tinunaw na keso.',
  },
  {
    sku: 'bacon-alfredo',
    categorySlug: 'pasta',
    name: 'Bacon Alfredo',
    priceCentavos: 9500,
    sortOrder: 2,
    descriptionEn: 'Rich alfredo sauce with crispy bacon bits.',
    descriptionFil: 'Mayaman na alfredo sauce na may malutong na bacon.',
  },
  {
    sku: 'creamy-tuna-pesto',
    categorySlug: 'pasta',
    name: 'Creamy Tuna Pesto',
    priceCentavos: 9500,
    sortOrder: 3,
    descriptionEn: 'Creamy pesto pasta with flaked tuna.',
    descriptionFil: 'Creamy na pesto pasta na may tuna.',
  },
  // --- Snacks --------------------------------------------------------------
  {
    sku: 'hashbrown-2pc',
    imageSlug: 'hashbrown-2pc',
    categorySlug: 'snacks',
    name: '2pc. Hashbrown',
    priceCentavos: 6500,
    sortOrder: 1,
    descriptionEn: 'Golden crispy hashbrown patties, two pieces.',
    descriptionFil: 'Dalawang pirasong ginintuan at malutong na hashbrown.',
  },
  {
    sku: 'chicken-nuggets-6pc',
    imageSlug: 'chicken-nuggets-6pc',
    categorySlug: 'snacks',
    name: '6pc. Chicken Nuggets',
    priceCentavos: 6500,
    sortOrder: 2,
    descriptionEn: 'Six crunchy chicken nuggets with dipping sauce.',
    descriptionFil: 'Anim na malutong na chicken nuggets na may sawsawan.',
  },
  {
    sku: 'crinkled-fries',
    categorySlug: 'snacks',
    name: 'Crinkled Fries',
    priceCentavos: 6500,
    sortOrder: 3,
    descriptionEn: 'Seasoned crinkled fries with your choice of flavor.',
    descriptionFil: 'Seasoned na crinkled fries na may mapipiling lasap.',
    optionGroups: [FRIES_FLAVOR_GROUP],
  },
  {
    sku: 'cheesy-beef-nachos',
    categorySlug: 'snacks',
    name: 'Cheesy Beef Nachos',
    priceCentavos: 6900,
    sortOrder: 4,
    descriptionEn: 'Tortilla chips loaded with beef and cheese.',
    descriptionFil: 'Tortilla chips na puno ng beef at keso.',
  },
  // --- Bread ---------------------------------------------------------------
  {
    sku: 'creamcheese-garlic-bun',
    categorySlug: 'bread',
    name: 'Creamcheese Garlic Bun',
    priceCentavos: 6500,
    sortOrder: 1,
    descriptionEn: 'Soft garlic bun filled with creamy cheese.',
    descriptionFil: 'Malambot na garlic bun na may creamy cheese.',
  },
  // --- Drip Coffee ---------------------------------------------------------
  {
    sku: 'americano',
    categorySlug: 'drip-coffee',
    name: 'Americano',
    priceCentavos: 4500,
    sortOrder: 1,
    descriptionEn: 'Bold espresso pulled long with hot water.',
    descriptionFil: 'Espresso na hinaluan ng mainit na tubig.',
  },
  {
    sku: 'cafe-latte',
    categorySlug: 'drip-coffee',
    name: 'Cafe Latte',
    priceCentavos: 5500,
    sortOrder: 2,
    descriptionEn: 'Smooth espresso with steamed milk.',
    descriptionFil: 'Makinis na espresso na may steamed milk.',
  },
  {
    sku: 'vanilla-latte',
    categorySlug: 'drip-coffee',
    name: 'Vanilla Latte',
    priceCentavos: 5900,
    sortOrder: 3,
    descriptionEn: 'Cafe latte sweetened with vanilla syrup.',
    descriptionFil: 'Cafe latte na may vanilla syrup.',
  },
  {
    sku: 'hazelnut-latte',
    categorySlug: 'drip-coffee',
    name: 'Hazelnut Latte',
    priceCentavos: 5900,
    sortOrder: 4,
    descriptionEn: 'Cafe latte with toasted hazelnut flavor.',
    descriptionFil: 'Cafe latte na may hazelnut flavor.',
  },
  {
    sku: 'spanish-latte',
    categorySlug: 'drip-coffee',
    name: 'Spanish Latte',
    priceCentavos: 5900,
    sortOrder: 5,
    descriptionEn: 'Sweet latte with condensed milk.',
    descriptionFil: 'Matamis na latte na may kondensada.',
  },
  {
    sku: 'caramel-macchiato',
    categorySlug: 'drip-coffee',
    name: 'Caramel Macchiato',
    priceCentavos: 5900,
    sortOrder: 6,
    descriptionEn: 'Espresso marked with caramel and milk.',
    descriptionFil: 'Espresso na may caramel at gatas.',
  },
  {
    sku: 'salted-caramel',
    categorySlug: 'drip-coffee',
    name: 'Salted Caramel',
    priceCentavos: 5900,
    sortOrder: 7,
    descriptionEn: 'Caramel latte with a hint of sea salt.',
    descriptionFil: 'Caramel latte na may konting asin.',
  },
  {
    sku: 'white-mocha',
    categorySlug: 'drip-coffee',
    name: 'White Mocha',
    priceCentavos: 5900,
    sortOrder: 8,
    descriptionEn: 'Espresso with white chocolate and milk.',
    descriptionFil: 'Espresso na may white chocolate at gatas.',
  },
  {
    sku: 'cafe-mocha',
    categorySlug: 'drip-coffee',
    name: 'Cafe Mocha',
    priceCentavos: 5900,
    sortOrder: 9,
    descriptionEn: 'Espresso with chocolate and steamed milk.',
    descriptionFil: 'Espresso na may tsokolate at steamed milk.',
  },
  {
    sku: 'coffee-matcha',
    categorySlug: 'drip-coffee',
    name: 'Coffee Matcha',
    priceCentavos: 5900,
    sortOrder: 10,
    descriptionEn: 'Coffee and matcha blended with milk.',
    descriptionFil: 'Pinaghalong kape at matcha na may gatas.',
  },
  {
    sku: 'hazelnut-mocha',
    categorySlug: 'drip-coffee',
    name: 'Hazelnut Mocha',
    priceCentavos: 5900,
    sortOrder: 11,
    descriptionEn: 'Mocha with a toasted hazelnut twist.',
    descriptionFil: 'Mocha na may hazelnut flavor.',
  },
  // --- Espresso ------------------------------------------------------------
  {
    sku: 'espresso-americano',
    categorySlug: 'espresso',
    name: 'Americano',
    priceCentavos: 8500,
    sortOrder: 1,
    descriptionEn: 'Double-shot espresso pulled long with hot water.',
    descriptionFil: 'Dobleng espresso na hinaluan ng mainit na tubig.',
  },
  {
    sku: 'espresso-cafe-latte',
    categorySlug: 'espresso',
    name: 'Cafe Latte',
    priceCentavos: 10500,
    sortOrder: 2,
    descriptionEn: 'Double-shot espresso with steamed milk.',
    descriptionFil: 'Dobleng espresso na may steamed milk.',
  },
  {
    sku: 'espresso-vanilla-latte',
    categorySlug: 'espresso',
    name: 'Vanilla Latte',
    priceCentavos: 11000,
    sortOrder: 3,
    descriptionEn: 'Double-shot latte sweetened with vanilla syrup.',
    descriptionFil: 'Dobleng latte na may vanilla syrup.',
  },
  {
    sku: 'espresso-hazelnut-latte',
    categorySlug: 'espresso',
    name: 'Hazelnut Latte',
    priceCentavos: 11000,
    sortOrder: 4,
    descriptionEn: 'Double-shot latte with toasted hazelnut flavor.',
    descriptionFil: 'Dobleng latte na may hazelnut flavor.',
  },
  {
    sku: 'espresso-spanish-latte',
    categorySlug: 'espresso',
    name: 'Spanish Latte',
    priceCentavos: 11000,
    sortOrder: 5,
    descriptionEn: 'Double-shot latte sweetened with condensed milk.',
    descriptionFil: 'Dobleng latte na may kondensada.',
  },
  {
    sku: 'espresso-salted-caramel-latte',
    imageSlug: 'espresso-salted-caramel-latte',
    categorySlug: 'espresso',
    name: 'Salted Caramel Latte',
    priceCentavos: 11500,
    sortOrder: 6,
    descriptionEn: 'Double-shot caramel latte with a hint of sea salt.',
    descriptionFil: 'Dobleng caramel latte na may konting asin.',
  },
  {
    sku: 'espresso-caramel-macchiato',
    categorySlug: 'espresso',
    name: 'Caramel Macchiato',
    priceCentavos: 11500,
    sortOrder: 7,
    descriptionEn: 'Double-shot espresso marked with caramel and milk.',
    descriptionFil: 'Dobleng espresso na may caramel at gatas.',
  },
  {
    sku: 'espresso-cafe-mocha',
    categorySlug: 'espresso',
    name: 'Cafe Mocha',
    priceCentavos: 11500,
    sortOrder: 8,
    descriptionEn: 'Double-shot espresso with chocolate and steamed milk.',
    descriptionFil: 'Dobleng espresso na may tsokolate at steamed milk.',
  },
  {
    sku: 'espresso-white-mocha',
    categorySlug: 'espresso',
    name: 'White Mocha',
    priceCentavos: 11500,
    sortOrder: 9,
    descriptionEn: 'Double-shot espresso with white chocolate and milk.',
    descriptionFil: 'Dobleng espresso na may white chocolate at gatas.',
  },
  {
    sku: 'espresso-hazelnut-mocha',
    categorySlug: 'espresso',
    name: 'Hazelnut Mocha',
    priceCentavos: 12000,
    sortOrder: 10,
    descriptionEn: 'Double-shot mocha with a toasted hazelnut twist.',
    descriptionFil: 'Dobleng mocha na may hazelnut flavor.',
  },
  {
    sku: 'espresso-coffee-matcha',
    categorySlug: 'espresso',
    name: 'Coffee Matcha',
    priceCentavos: 12000,
    sortOrder: 11,
    descriptionEn: 'Double-shot coffee and matcha blended with milk.',
    descriptionFil: 'Dobleng kape at matcha na may gatas.',
  },
  // --- Ice-Shaken Drinks ---------------------------------------------------
  {
    sku: 'berry-lemonade',
    categorySlug: 'ice-shaken',
    name: 'Berry Lemonade',
    priceCentavos: 5500,
    sortOrder: 1,
    descriptionEn: 'Tangy berries with fresh lemonade, shaken over ice.',
    descriptionFil: 'Maasim na berries na may fresh lemonade, inilog sa yelo.',
  },
  {
    sku: 'honey-calamansi',
    categorySlug: 'ice-shaken',
    name: 'Honey Calamansi',
    priceCentavos: 5500,
    sortOrder: 2,
    descriptionEn: 'Calamansi juice sweetened with honey.',
    descriptionFil: 'Katas ng calamansi na pinatamis ng pulot.',
  },
  {
    sku: 'mango-hibiscus',
    categorySlug: 'ice-shaken',
    name: 'Mango Hibiscus',
    priceCentavos: 5500,
    sortOrder: 3,
    descriptionEn: 'Mango and hibiscus shaken over ice.',
    descriptionFil: 'Mangga at hibiscus na inilog sa yelo.',
  },
  {
    sku: 'strawberry-hibiscus',
    categorySlug: 'ice-shaken',
    name: 'Strawberry Hibiscus',
    priceCentavos: 5500,
    sortOrder: 4,
    descriptionEn: 'Strawberry and hibiscus shaken over ice.',
    descriptionFil: 'Strawberry at hibiscus na inilog sa yelo.',
  },
  // --- Non-Coffee Drinks ---------------------------------------------------
  {
    sku: 'ube-latte',
    categorySlug: 'non-coffee',
    name: 'Ube Latte',
    priceCentavos: 5900,
    sortOrder: 1,
    descriptionEn: 'Creamy ube drink with no coffee.',
    descriptionFil: 'Creamy na ube na inumin, walang kape.',
  },
  {
    sku: 'matcha-latte',
    categorySlug: 'non-coffee',
    name: 'Matcha Latte',
    priceCentavos: 5900,
    sortOrder: 2,
    descriptionEn: 'Smooth matcha blended with milk.',
    descriptionFil: 'Makinis na matcha na hinaluan ng gatas.',
  },
  {
    sku: 'dark-choco',
    categorySlug: 'non-coffee',
    name: 'Dark Choco',
    priceCentavos: 5900,
    sortOrder: 3,
    descriptionEn: 'Rich dark chocolate milk drink.',
    descriptionFil: 'Malamlam na dark chocolate na inuming may gatas.',
  },
  {
    sku: 'oreo-milk',
    categorySlug: 'non-coffee',
    name: 'Oreo Milk',
    priceCentavos: 5900,
    sortOrder: 4,
    descriptionEn: 'Chocolate cookies blended with fresh milk.',
    descriptionFil: 'Chocolate cookies na hinaluan ng sariwang gatas.',
  },
  {
    sku: 'strawberry-milk',
    categorySlug: 'non-coffee',
    name: 'Strawberry Milk',
    priceCentavos: 5900,
    sortOrder: 5,
    descriptionEn: 'Sweet strawberry milk drink.',
    descriptionFil: 'Matamis na strawberry milk na inumin.',
  },
  {
    sku: 'blueberry-milk',
    categorySlug: 'non-coffee',
    name: 'Blueberry Milk',
    priceCentavos: 5900,
    sortOrder: 6,
    descriptionEn: 'Sweet blueberry milk drink.',
    descriptionFil: 'Matamis na blueberry milk na inumin.',
  },
  {
    sku: 'mango-milk',
    categorySlug: 'non-coffee',
    name: 'Mango Milk',
    priceCentavos: 5900,
    sortOrder: 7,
    descriptionEn: 'Sweet mango milk drink.',
    descriptionFil: 'Matamis na mango milk na inumin.',
  },
];

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function productImageSlug(product) {
  return product.imageSlug || slugify(product.name);
}

export function buildSeedMenu() {
  const categories = CATEGORIES.map((c) => ({ ...c }));
  const products = PRODUCTS.map((p) => ({
    ...p,
    imagePath: `/placeholders/products/${productImageSlug(p)}.svg`,
    optionGroups: p.optionGroups
      ? p.optionGroups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o })) }))
      : [],
  }));
  return { categories, products, addons: ADDONS.map((a) => ({ ...a })) };
}
