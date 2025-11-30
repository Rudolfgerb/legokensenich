export type BrickCategory = 'basic' | 'plate' | 'technic' | 'slope';

export interface BrickTypeDefinition {
  id: string;
  name: string;
  category: BrickCategory;
  width: number; // in studs
  depth: number; // in studs
  height: number; // relative to standard brick (1 = standard, 0.33 = plate)
  hasStuds: boolean;
  hasHoles?: boolean; // Technic style holes
}

export interface PlacedBrick {
  id: string;
  typeId: string;
  position: [number, number, number]; // x, y, z in grid units
  rotation: number; // 0, 1, 2, 3 (multipliers of 90 deg around Y axis)
  color: string;
}

export interface BrickColor {
  id: string;
  name: string;
  hex: string;
}

export type ToolMode = 'view' | 'place' | 'delete' | 'paint' | 'rotate';
