/** Canonical 14×14 seed. Matches the 5 Nov territory inserts tile for tile. */
export const TERRAINS = ["Plains", "Forest", "Hills", "Desert", "Mountain", "Riverland"] as const;
export const RESOURCE_SETS = [
  ["Food", "Wood"],
  ["Wood", "Ore"],
  ["Ore", "Stone"],
  ["Food"],
  ["Stone", "Ore"],
  ["Food", "Water"],
] as const;

export type Tile = {
  id: string;
  row: number;
  col: number;
  terrain: string;
  resources: string;
  census: number;
  status: "OCEAN" | "AVAILABLE";
};

export function territoryId(row: number, col: number): string {
  return `T-${String(row + 1).padStart(2, "0")}-${String(col + 1).padStart(2, "0")}`;
}

export function canonicalMap(): Tile[] {
  const tiles: Tile[] = [];
  for (let row = 0; row < 14; row += 1) {
    for (let col = 0; col < 14; col += 1) {
      const ring = Math.min(row, col, 13 - row, 13 - col);
      const ocean = ring === 0 || ((row * 7 + col * 11) % 23 === 0 && ring < 3);
      if (ocean) {
        tiles.push({
          id: territoryId(row, col),
          row,
          col,
          terrain: "Ocean",
          resources: "",
          census: 0,
          status: "OCEAN",
        });
      } else {
        tiles.push({
          id: territoryId(row, col),
          row,
          col,
          terrain: TERRAINS[(row * 3 + col * 5) % TERRAINS.length],
          resources: RESOURCE_SETS[(row + col * 2) % RESOURCE_SETS.length].join(","),
          census: 8000 + ((row * 31 + col * 17) % 42000),
          status: "AVAILABLE",
        });
      }
    }
  }
  return tiles;
}

export function adjacent(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

/** First tile plus a connected land chain, used by tests and the founding hint. */
export function sampleLand(count: number): Tile[] {
  const land = canonicalMap().filter((tile) => tile.status === "AVAILABLE");
  const start = land.find((tile) => tile.row === 3 && tile.col === 3) ?? land[0];
  const chosen: Tile[] = [];
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length && chosen.length < count) {
    const tile = queue.shift();
    if (!tile || seen.has(tile.id)) continue;
    seen.add(tile.id);
    chosen.push(tile);
    for (const next of land) {
      if (!seen.has(next.id) && adjacent(tile, next)) queue.push(next);
    }
  }
  return chosen;
}
