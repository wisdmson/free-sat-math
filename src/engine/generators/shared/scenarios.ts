/** Original word-problem settings where two kinds of item are sold at two prices. */
export interface Item {
  one: string;
  many: string;
  /** Whole-dollar price range, inclusive. */
  price: readonly [number, number];
}

export interface TwoItemScenario {
  id: string;
  /** Starts a sentence, e.g. "A community theater". */
  seller: string;
  /** What both items are together, e.g. "tickets". */
  collective: string;
  /** The pricier item. Its price range sits entirely above b's. */
  a: Item;
  b: Item;
  /** Range for each item's count, inclusive. */
  count: readonly [number, number];
}

export const TWO_ITEM_SCENARIOS: readonly TwoItemScenario[] = [
  {
    id: 'theater',
    seller: 'A community theater',
    collective: 'tickets',
    a: { one: 'adult ticket', many: 'adult tickets', price: [9, 16] },
    b: { one: 'student ticket', many: 'student tickets', price: [3, 8] },
    count: [20, 90],
  },
  {
    id: 'plant-sale',
    seller: 'A school garden club',
    collective: 'plants',
    a: { one: 'tomato plant', many: 'tomato plants', price: [5, 9] },
    b: { one: 'herb pot', many: 'herb pots', price: [2, 4] },
    count: [15, 70],
  },
  {
    id: 'bookstore',
    seller: 'A used bookstore',
    collective: 'books',
    a: { one: 'hardcover book', many: 'hardcover books', price: [7, 12] },
    b: { one: 'paperback book', many: 'paperback books', price: [2, 5] },
    count: [20, 80],
  },
  {
    id: 'candles',
    seller: 'A robotics team',
    collective: 'candles',
    a: { one: 'large candle', many: 'large candles', price: [11, 18] },
    b: { one: 'small candle', many: 'small candles', price: [4, 8] },
    count: [10, 60],
  },
  {
    id: 'bakery',
    seller: 'A bakery stand',
    collective: 'items',
    a: { one: 'loaf of bread', many: 'loaves of bread', price: [5, 8] },
    b: { one: 'muffin', many: 'muffins', price: [2, 3] },
    count: [20, 75],
  },
];
