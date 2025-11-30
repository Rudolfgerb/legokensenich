import React, { useMemo } from 'react';
import * as THREE from 'three';
import { BrickTypeDefinition } from '../types';
import { STUD_SIZE, BRICK_HEIGHT } from '../constants';

interface BrickGeometryProps {
  type: BrickTypeDefinition;
  color: string;
  opacity?: number;
  transparent?: boolean;
}

export const BrickGeometry: React.FC<BrickGeometryProps> = ({ type, color, opacity = 1, transparent = false }) => {
  const { width, depth, height, hasStuds, hasHoles } = type;
  
  // Actual dimensions in World Units
  const w = width * STUD_SIZE;
  const d = depth * STUD_SIZE;
  const h = height * BRICK_HEIGHT;

  const geometry = useMemo(() => {
    // Base block
    const baseGeometry = new THREE.BoxGeometry(w - 0.05, h, d - 0.05); // Slight inset for visual separation
    const geometries: THREE.BufferGeometry[] = [baseGeometry];

    // Studs
    if (hasStuds) {
      const studGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
      studGeo.rotateX(0); // Default is upright Y
      
      // Calculate stud positions
      for (let i = 0; i < width; i++) {
        for (let j = 0; j < depth; j++) {
          const stud = studGeo.clone();
          // Center centering
          const x = (i - (width - 1) / 2) * STUD_SIZE;
          const z = (j - (depth - 1) / 2) * STUD_SIZE;
          const y = h / 2 + 0.1;
          
          stud.translate(x, y, z);
          geometries.push(stud);
        }
      }
    }

    // Technic Holes (Visual Representation using dark cylinders)
    // We don't do actual boolean subtraction here for performance, we just add "caps" that look like holes
    // or we rely on the material transparency/texture. For this demo, we add black circles.
    
    // Merge
    // In a real app we would merge geometries for draw call reduction, 
    // but React Three Fiber handles instances well. 
    // For simple composition, we return a Group or merged geometry.
    // Let's use a group for simplicity in this component structure.
    
    return null; // Logic handled in render
  }, [width, depth, height, hasStuds]);

  // Stud generation for rendering
  const studs = useMemo(() => {
    if (!hasStuds) return [];
    const studList = [];
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < depth; j++) {
        studList.push({
          x: (i - (width - 1) / 2) * STUD_SIZE,
          z: (j - (depth - 1) / 2) * STUD_SIZE,
        });
      }
    }
    return studList;
  }, [width, depth, hasStuds]);

  // Technic Holes generation
  const holes = useMemo(() => {
    if (!hasHoles) return [];
    const holeList = [];
    // Holes usually run along the side of the beam (Depth axis if width is 1)
    if (width === 1) {
       for (let j = 0; j < depth; j++) {
         holeList.push({
           x: 0,
           z: (j - (depth - 1) / 2) * STUD_SIZE,
           rot: Math.PI / 2 // Rotate to face side
         });
       }
    }
    return holeList;
  }, [width, depth, hasHoles]);

  return (
    <group>
      {/* Main Body */}
      <mesh position={[0, h/2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.05, h, d - 0.05]} />
        <meshStandardMaterial color={color} opacity={opacity} transparent={transparent} roughness={0.2} metalness={0.1} />
      </mesh>

      {/* Studs */}
      {hasStuds && studs.map((pos, idx) => (
        <mesh key={`stud-${idx}`} position={[pos.x, h + 0.1, pos.z]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.2, 20]} />
          <meshStandardMaterial color={color} opacity={opacity} transparent={transparent} roughness={0.2} metalness={0.1} />
        </mesh>
      ))}

      {/* Technic Holes (Visual) */}
      {hasHoles && holes.map((pos, idx) => (
        <mesh key={`hole-${idx}`} position={[pos.x, h/2, pos.z]} rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.25, 0.25, w + 0.05, 16]} />
          <meshStandardMaterial color="#000000" roughness={1} />
        </mesh>
      ))}
      
      {/* Technic Pins/Connectors Hints (just visuals for style) */}
      {hasHoles && (
         <mesh position={[0, h/2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w - 0.1, h - 0.2, d - 0.1]} />
             <meshStandardMaterial color={color} opacity={opacity} transparent={transparent} roughness={0.2} metalness={0.1} />
         </mesh>
      )}

    </group>
  );
};
