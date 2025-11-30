import { BrickTypeDefinition, BrickColor } from './types';

// Dimensions
export const STUD_SIZE = 1; // Base unit
export const BRICK_HEIGHT = 1.2;
export const PLATE_HEIGHT = 0.4;

export const COLORS: BrickColor[] = [
  { id: 'red', name: 'Bright Red', hex: '#ef4444' },
  { id: 'blue', name: 'Bright Blue', hex: '#3b82f6' },
  { id: 'yellow', name: 'Bright Yellow', hex: '#eab308' },
  { id: 'green', name: 'Dark Green', hex: '#15803d' },
  { id: 'black', name: 'Black', hex: '#171717' },
  { id: 'white', name: 'White', hex: '#f3f4f6' },
  { id: 'grey', name: 'Medium Stone Grey', hex: '#9ca3af' },
  { id: 'orange', name: 'Bright Orange', hex: '#f97316' },
  { id: 'purple', name: 'Medium Lilac', hex: '#a855f7' },
  { id: 'lime', name: 'Lime', hex: '#84cc16' },
];

export const BRICK_CATALOG: BrickTypeDefinition[] = [
  // Basic Bricks
  { id: 'brick_1x1', name: 'Brick 1x1', category: 'basic', width: 1, depth: 1, height: 1, hasStuds: true },
  { id: 'brick_1x2', name: 'Brick 1x2', category: 'basic', width: 1, depth: 2, height: 1, hasStuds: true },
  { id: 'brick_1x4', name: 'Brick 1x4', category: 'basic', width: 1, depth: 4, height: 1, hasStuds: true },
  { id: 'brick_2x2', name: 'Brick 2x2', category: 'basic', width: 2, depth: 2, height: 1, hasStuds: true },
  { id: 'brick_2x4', name: 'Brick 2x4', category: 'basic', width: 2, depth: 4, height: 1, hasStuds: true },
  
  // Plates
  { id: 'plate_1x1', name: 'Plate 1x1', category: 'plate', width: 1, depth: 1, height: 0.33, hasStuds: true },
  { id: 'plate_1x2', name: 'Plate 1x2', category: 'plate', width: 1, depth: 2, height: 0.33, hasStuds: true },
  { id: 'plate_2x2', name: 'Plate 2x2', category: 'plate', width: 2, depth: 2, height: 0.33, hasStuds: true },
  { id: 'plate_2x4', name: 'Plate 2x4', category: 'plate', width: 2, depth: 4, height: 0.33, hasStuds: true },
  { id: 'plate_4x4', name: 'Plate 4x4', category: 'plate', width: 4, depth: 4, height: 0.33, hasStuds: true },

  // Technic (Simplified representation)
  { id: 'technic_1x2', name: 'Technic Beam 2', category: 'technic', width: 1, depth: 2, height: 1, hasStuds: false, hasHoles: true },
  { id: 'technic_1x4', name: 'Technic Beam 4', category: 'technic', width: 1, depth: 4, height: 1, hasStuds: false, hasHoles: true },
  { id: 'technic_1x8', name: 'Technic Beam 8', category: 'technic', width: 1, depth: 8, height: 1, hasStuds: false, hasHoles: true },
];
