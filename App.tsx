import React, { useState, Suspense, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GridHelper, Environment, ContactShadows, useCursor } from '@react-three/drei';
import { Physics, useBox, usePlane } from '@react-three/cannon';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { 
  Undo2, Redo2, Trash2, Move, MousePointer2, PaintBucket, 
  Menu, Loader2, Sparkles, RotateCw, Settings, 
  Save, Upload, Download, Play, Square, Box, Cog
} from 'lucide-react';

import { PlacedBrick, ToolMode, BrickTypeDefinition } from './types';
import { BRICK_CATALOG, COLORS, STUD_SIZE, BRICK_HEIGHT, PLATE_HEIGHT } from './constants';
import { BrickGeometry } from './components/BrickGeometry';
import { generateBuildFromPrompt } from './services/geminiService';

// --- Physics Components ---

const PhysicsFloor = () => {
  const [ref] = usePlane(() => ({ 
    rotation: [-Math.PI / 2, 0, 0], 
    position: [0, -0.01, 0], // Slightly below visual ground
    type: 'Static',
    material: { friction: 0.5, restitution: 0.1 }
  }));
  return (
    <mesh ref={ref as any} visible={false}>
      <planeGeometry args={[100, 100]} />
    </mesh>
  );
};

const PhysicsBrick: React.FC<{ brick: PlacedBrick }> = ({ brick }) => {
  const def = BRICK_CATALOG.find(b => b.id === brick.typeId);
  
  // Calculate dimensions for collider
  const w = def ? def.width * STUD_SIZE : 1;
  const d = def ? def.depth * STUD_SIZE : 1;
  const h = def ? def.height * BRICK_HEIGHT : 1;
  
  // Swap W/D if rotated
  const isRotated = brick.rotation % 2 !== 0;
  const finalW = isRotated ? d : w;
  const finalD = isRotated ? w : d;

  const [ref] = useBox(() => ({
    mass: 1, // Dynamic body
    position: [brick.position[0], brick.position[1] + h/2, brick.position[2]], // Physics body center is usually center of mass
    rotation: [0, brick.rotation * Math.PI / 2, 0],
    args: [finalW - 0.02, h, finalD - 0.02], // Slightly smaller to prevent jitter
    material: { friction: 0.6, restitution: 0.2 }
  }));

  if (!def) return null;

  return (
    <group ref={ref as any}>
        {/* We offset visual geometry because BrickGeometry origin is bottom-center, 
            but Cannon body origin is center-center. 
            So we move visual DOWN by h/2 inside the physics body group */}
        <group position={[0, -h/2, 0]}>
             <BrickGeometry type={def} color={brick.color} />
        </group>
    </group>
  );
};

// --- Visual Components ---

const Lights = () => (
  <>
    <ambientLight intensity={0.7} />
    <directionalLight 
      position={[10, 20, 10]} 
      intensity={1.5} 
      castShadow 
      shadow-mapSize={[2048, 2048]}
    />
    <Environment preset="city" />
  </>
);

const GhostBrick = ({ 
  type, 
  position, 
  rotation, 
  color, 
  visible 
}: { 
  type: BrickTypeDefinition, 
  position: [number, number, number], 
  rotation: number,
  color: string, 
  visible: boolean 
}) => {
  if (!visible) return null;
  return (
    <group position={new THREE.Vector3(...position)} rotation={[0, rotation * Math.PI / 2, 0]}>
      <BrickGeometry type={type} color={color} opacity={0.6} transparent />
    </group>
  );
};

// --- Main Scene ---

const SceneContent = ({
  bricks,
  tool,
  selectedTypeId,
  selectedColorId,
  hoverPos,
  setHoverPos,
  rotation,
  onPlaceBrick,
  onBrickClick,
  isSimulating
}: any) => {
  const { camera, raycaster, mouse, scene } = useThree();
  const [hovered, setHover] = useState(false);
  useCursor(hovered && tool === 'view' ? false : hovered); 

  // --- Physics Mode ---
  if (isSimulating) {
    return (
      <Physics gravity={[0, -9.81, 0]} iterations={20} tolerance={0.001}>
        <PhysicsFloor />
        {bricks.map((brick: PlacedBrick) => (
          <PhysicsBrick key={`sim-${brick.id}`} brick={brick} />
        ))}
        {/* Helper to show where floor is */}
        <gridHelper args={[50, 50, 0x444444, 0x111111]} position={[0, 0, 0]} />
      </Physics>
    );
  }

  // --- Edit Mode ---

  const handlePointerMove = (e: any) => {
    e.stopPropagation();
    if (isSimulating) return;

    // Determine if we are interacting with a brick
    // We traverse up the tree to find the Group that holds the brick data
    let object = e.object;
    let isBrick = false;
    let brickId = null;

    while (object) {
      if (object.userData && object.userData.isBrick) {
        isBrick = true;
        brickId = object.userData.brickId;
        break;
      }
      object = object.parent;
    }

    const point = e.point;
    const normal = e.face.normal;

    // Use a small offset along the normal to ensure we pick the grid cell 
    // adjacent to the face we hit (e.g. on top, or to the side).
    const epsilon = 0.01; 
    const targetPos = point.clone().add(normal.clone().multiplyScalar(epsilon));

    // Snap to grid
    // X and Z are standard 1-stud units
    const x = Math.round(targetPos.x);
    const z = Math.round(targetPos.z);
    
    // Y is height. Snap to PLATE_HEIGHT (0.4) to allow fine stacking
    let y = Math.round(targetPos.y / PLATE_HEIGHT) * PLATE_HEIGHT;
    
    // Ensure we don't go below ground
    if (y < 0) y = 0;
    
    // Cleanup floating point artifacts
    y = parseFloat(y.toFixed(2));

    // Handle Brick Centering
    // Bricks with even width/depth need to be offset by 0.5 to align with grid lines
    // Bricks with odd width/depth align with grid centers (integers)
    const currentBrick = BRICK_CATALOG.find(b => b.id === selectedTypeId)!;
    const isRotated = rotation % 2 !== 0;
    const effectiveWidth = isRotated ? currentBrick.depth : currentBrick.width;
    const effectiveDepth = isRotated ? currentBrick.width : currentBrick.depth;
    
    let finalX = x;
    let finalZ = z;

    if (effectiveWidth % 2 === 0) finalX += 0.5;
    if (effectiveDepth % 2 === 0) finalZ += 0.5;

    setHoverPos([finalX, y, finalZ]);
    setHover(true);
  };

  const handlePointerOut = () => {
    setHover(false);
  };

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (isSimulating) return;

    if (tool === 'place' && hovered) {
      onPlaceBrick();
    } else {
       // Check for click on existing brick for other tools
       let object = e.object;
       let brickId = null;
       while (object) {
         if (object.userData && object.userData.isBrick) {
           brickId = object.userData.brickId;
           break;
         }
         object = object.parent;
       }

       if (brickId && (tool === 'delete' || tool === 'paint')) {
          onBrickClick(brickId);
       }
    }
  };

  const selectedBrickDef = BRICK_CATALOG.find(b => b.id === selectedTypeId);
  const colorHex = COLORS.find(c => c.id === selectedColorId)?.hex || '#ffffff';

  return (
    <>
      <gridHelper args={[50, 50, 0x666666, 0x222222]} position={[0, 0, 0]} />
      
      {/* Interaction Plane (Floor) */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.01, 0]} 
        visible={false}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial />
      </mesh>

      {/* Static Bricks (Edit Mode) */}
      {bricks.map((brick: PlacedBrick) => {
        const def = BRICK_CATALOG.find(b => b.id === brick.typeId);
        if (!def) return null;
        return (
          <group 
            key={brick.id} 
            position={new THREE.Vector3(...brick.position)} 
            rotation={[0, brick.rotation * Math.PI / 2, 0]}
            onClick={handleClick}
            onPointerMove={handlePointerMove} 
            userData={{ isBrick: true, brickId: brick.id }} // Mark this group as a brick
          >
             {/* Wrap geometry to ensure events bubble to this group */}
             <group>
                <BrickGeometry type={def} color={brick.color} />
             </group>
          </group>
        );
      })}

      {/* Ghost */}
      {tool === 'place' && selectedBrickDef && (
        <GhostBrick 
          type={selectedBrickDef} 
          position={hoverPos} 
          rotation={rotation}
          color={colorHex}
          visible={hovered}
        />
      )}
    </>
  );
};

// --- App ---

export default function App() {
  const [bricks, setBricks] = useState<PlacedBrick[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(BRICK_CATALOG[0].id);
  const [selectedColorId, setSelectedColorId] = useState<string>('red');
  const [tool, setTool] = useState<ToolMode>('place');
  const [rotation, setRotation] = useState(0);
  const [hoverPos, setHoverPos] = useState<[number, number, number]>([0,0,0]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'basic' | 'technic'>('all');
  
  // AI
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);

  // Undo/Redo
  const [history, setHistory] = useState<PlacedBrick[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // File Input
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addToHistory = (newBricks: PlacedBrick[]) => {
     const newHistory = history.slice(0, historyIndex + 1);
     newHistory.push(newBricks);
     setHistory(newHistory);
     setHistoryIndex(newHistory.length - 1);
     setBricks(newBricks);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setBricks(history[historyIndex - 1]);
    } else if (historyIndex === 0) {
       setHistoryIndex(-1);
       setBricks([]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setBricks(history[historyIndex + 1]);
    }
  };

  const handlePlaceBrick = () => {
    const colorHex = COLORS.find(c => c.id === selectedColorId)?.hex || '#fff';
    const newBrick: PlacedBrick = {
      id: uuidv4(),
      typeId: selectedTypeId,
      position: hoverPos,
      rotation: rotation,
      color: colorHex
    };
    addToHistory([...bricks, newBrick]);
  };

  const handleBrickClick = (brickId: string) => {
    if (tool === 'delete') {
      const newBricks = bricks.filter(b => b.id !== brickId);
      addToHistory(newBricks);
    } else if (tool === 'paint') {
      const colorHex = COLORS.find(c => c.id === selectedColorId)?.hex || '#fff';
      const newBricks = bricks.map(b => b.id === brickId ? { ...b, color: colorHex } : b);
      addToHistory(newBricks);
    }
  };

  const handleAiBuild = async () => {
    if (!aiPrompt) return;
    setIsAiLoading(true);
    const generatedBricks = await generateBuildFromPrompt(aiPrompt);
    setIsAiLoading(false);
    setShowAiModal(false);
    
    if (generatedBricks) {
      addToHistory([...bricks, ...generatedBricks]);
    } else {
      alert("AI could not generate a build. Please try again or check API Key.");
    }
  };

  const rotateBrick = () => {
    setRotation((prev) => (prev + 1) % 4);
  };

  const clearScene = () => {
      if(confirm("Clear all bricks?")) {
          addToHistory([]);
      }
  };

  // --- Save / Load / Export ---

  const saveToLocalStorage = () => {
    localStorage.setItem('kensenichLegoSave', JSON.stringify(bricks));
    alert('Build saved to local storage!');
  };

  const loadFromLocalStorage = () => {
    const saved = localStorage.getItem('kensenichLegoSave');
    if (saved) {
      try {
        const loadedBricks = JSON.parse(saved);
        addToHistory(loadedBricks);
      } catch (e) {
        console.error("Failed to load", e);
      }
    }
  };

  const exportToFile = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bricks));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "kensenich_lego_build.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const loadedBricks = JSON.parse(evt.target?.result as string);
        addToHistory(loadedBricks);
      } catch (err) {
        alert("Invalid file format");
      }
    };
    reader.readAsText(file);
    // Reset value to allow re-uploading same file
    e.target.value = '';
  };

  // --- Filtered Catalog ---
  const filteredCatalog = useMemo(() => {
    if (filterCategory === 'all') return BRICK_CATALOG;
    if (filterCategory === 'basic') return BRICK_CATALOG.filter(b => b.category === 'basic' || b.category === 'plate' || b.category === 'slope');
    if (filterCategory === 'technic') return BRICK_CATALOG.filter(b => b.category === 'technic');
    return BRICK_CATALOG;
  }, [filterCategory]);

  return (
    <div className="w-full h-full relative flex flex-col bg-gray-900 text-white font-sans">
      
      {/* 3D Canvas */}
      <div className="flex-1 relative">
        <Canvas shadows camera={{ position: [10, 10, 10], fov: 45 }}>
          <Lights />
          <SceneContent 
            bricks={bricks}
            tool={tool}
            selectedTypeId={selectedTypeId}
            selectedColorId={selectedColorId}
            hoverPos={hoverPos}
            setHoverPos={setHoverPos}
            rotation={rotation}
            onPlaceBrick={handlePlaceBrick}
            onBrickClick={handleBrickClick}
            isSimulating={isSimulating}
          />
          <OrbitControls makeDefault enabled={!isSimulating} />
          {!isSimulating && (
            <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={50} blur={2} far={4} color="#000000" />
          )}
        </Canvas>

        {/* Branding & Top Right Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none">
           {/* Logo / Title */}
           <div className="pointer-events-auto bg-gray-800/80 backdrop-blur p-3 rounded-lg border border-gray-700 shadow-xl">
              <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 tracking-tight">
                KensenichLego
              </h1>
              <p className="text-xs text-gray-400">Digital Construction System</p>
           </div>

           {/* Top Right: Filter Toggles */}
           <div className="pointer-events-auto flex flex-col gap-2 items-end">
             {/* Mode Selection (Block vs Gear) */}
             <div className="flex bg-gray-800/90 rounded-lg p-1 border border-gray-700 shadow-xl">
                <button 
                  onClick={() => setFilterCategory('basic')}
                  className={`p-2 rounded transition-colors ${filterCategory === 'basic' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Basic Bricks"
                >
                  <Box size={24} strokeWidth={2.5} />
                </button>
                <button 
                  onClick={() => setFilterCategory('technic')}
                  className={`p-2 rounded transition-colors ${filterCategory === 'technic' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Technic Parts"
                >
                  <Cog size={24} strokeWidth={2.5} />
                </button>
                <button 
                  onClick={() => setFilterCategory('all')}
                  className={`p-2 rounded transition-colors ${filterCategory === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="All Parts"
                >
                  <span className="text-xs font-bold">ALL</span>
                </button>
             </div>

             {/* Simulation Toggle */}
             <button 
               onClick={() => setIsSimulating(!isSimulating)}
               className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold shadow-xl transition-all ${isSimulating ? 'bg-red-600 animate-pulse' : 'bg-green-600 hover:bg-green-500'}`}
             >
               {isSimulating ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
               {isSimulating ? 'STOP PHYSICS' : 'SIMULATE'}
             </button>
           </div>
        </div>

        {/* Top Center: Tools (Undo/Redo/Files) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none">
           <div className="pointer-events-auto bg-gray-800/80 backdrop-blur p-2 rounded-lg flex gap-2 border border-gray-700 shadow-lg">
             <button onClick={undo} disabled={historyIndex < 0} className="p-2 hover:bg-gray-700 rounded disabled:opacity-50" title="Undo"><Undo2 size={20} /></button>
             <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-gray-700 rounded disabled:opacity-50" title="Redo"><Redo2 size={20} /></button>
             <div className="w-px bg-gray-600 mx-1"></div>
             <button onClick={saveToLocalStorage} className="p-2 hover:bg-gray-700 rounded text-blue-400" title="Quick Save"><Save size={20} /></button>
             <button onClick={exportToFile} className="p-2 hover:bg-gray-700 rounded text-green-400" title="Export File"><Download size={20} /></button>
             <label className="p-2 hover:bg-gray-700 rounded text-yellow-400 cursor-pointer" title="Import File">
               <Upload size={20} />
               <input type="file" ref={fileInputRef} onChange={importFromFile} className="hidden" accept=".json" />
             </label>
             <div className="w-px bg-gray-600 mx-1"></div>
             <button onClick={clearScene} className="p-2 hover:bg-red-900/50 text-red-400 rounded" title="Clear All"><Trash2 size={20} /></button>
           </div>
        </div>

        {/* Toolbar (Bottom Center) */}
        {!isSimulating && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-800/90 backdrop-blur px-4 py-2 rounded-full border border-gray-700 shadow-2xl flex items-center gap-4 transition-all">
            <ToolBtn active={tool === 'view'} onClick={() => setTool('view')} icon={<Move size={20} />} tooltip="View (Cam)" />
            <ToolBtn active={tool === 'place'} onClick={() => setTool('place')} icon={<MousePointer2 size={20} />} tooltip="Place" />
            <ToolBtn active={tool === 'paint'} onClick={() => setTool('paint')} icon={<PaintBucket size={20} />} tooltip="Paint" />
            <ToolBtn active={tool === 'delete'} onClick={() => setTool('delete')} icon={<Trash2 size={20} />} tooltip="Delete" />
            <div className="w-px bg-gray-600 h-6"></div>
            <button onClick={rotateBrick} className="p-2 hover:bg-gray-700 rounded-full text-blue-400 hover:text-blue-300 transition-colors" title="Rotate (R)">
              <RotateCw size={24} />
            </button>
            <div className="w-px bg-gray-600 h-6"></div>
            <button 
              onClick={() => setShowAiModal(true)}
              className="p-2 hover:bg-purple-900/50 text-purple-400 rounded-full transition-colors"
              title="AI Builder"
            >
              <Sparkles size={24} />
            </button>
          </div>
        )}
      </div>

      {/* Sidebar (Right) - Catalog */}
      <div className={`w-80 bg-gray-900 border-l border-gray-800 flex flex-col h-full absolute right-0 top-0 bottom-0 shadow-2xl transition-transform z-10 ${isSimulating ? 'translate-x-full' : 'translate-x-0'}`}>
         <div className="p-4 border-b border-gray-800 pt-20"> {/* Padding top to clear the top-right buttons */}
           <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="w-5 h-5" /> Parts Catalog</h2>
           <p className="text-xs text-gray-500 mt-1">
             {filterCategory === 'all' && 'Showing All Parts'}
             {filterCategory === 'basic' && 'Showing Basic Blocks'}
             {filterCategory === 'technic' && 'Showing Technic Parts'}
           </p>
         </div>
         
         {/* Colors */}
         <div className="p-4 border-b border-gray-800">
           <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Color</h3>
           <div className="flex flex-wrap gap-2">
             {COLORS.map(c => (
               <button 
                 key={c.id}
                 onClick={() => setSelectedColorId(c.id)}
                 className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${selectedColorId === c.id ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                 style={{ backgroundColor: c.hex }}
                 title={c.name}
               />
             ))}
           </div>
         </div>

         {/* Parts List */}
         <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-2 gap-3">
              {filteredCatalog.map(brick => (
                <button
                  key={brick.id}
                  onClick={() => {
                     setSelectedTypeId(brick.id);
                     setTool('place');
                  }}
                  className={`flex flex-col items-center p-3 rounded-lg border transition-all ${selectedTypeId === brick.id ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
                >
                  <div className="w-full h-12 bg-gray-700/50 rounded mb-2 flex items-center justify-center text-xs text-gray-500 font-mono relative overflow-hidden">
                     {/* Quick visual hint */}
                     <div className={`absolute inset-2 border-2 border-gray-600 opacity-30 ${brick.category === 'technic' ? 'rounded-full' : 'rounded-sm'}`}></div>
                     <span className="z-10">{brick.width}x{brick.depth}</span>
                  </div>
                  <span className="text-xs font-medium text-center">{brick.name}</span>
                </button>
              ))}
            </div>
         </div>
      </div>

      {/* AI Modal */}
      {showAiModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
           <div className="bg-gray-800 rounded-xl shadow-2xl max-w-md w-full border border-gray-700 overflow-hidden">
              <div className="p-6">
                 <h2 className="text-2xl font-bold mb-2 flex items-center gap-2"><Sparkles className="text-purple-400" /> AI Architect</h2>
                 <p className="text-gray-400 text-sm mb-4">Describe what you want to build. The AI will generate a structure for you.</p>
                 
                 <textarea 
                   className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none h-32"
                   placeholder="e.g. A small red castle, a yellow racing car, a tall tower..."
                   value={aiPrompt}
                   onChange={(e) => setAiPrompt(e.target.value)}
                 />
                 
                 <div className="mt-4 flex gap-3 justify-end">
                    <button onClick={() => setShowAiModal(false)} className="px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-300 transition-colors">Cancel</button>
                    <button 
                      onClick={handleAiBuild} 
                      disabled={isAiLoading || !aiPrompt.trim()}
                      className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all"
                    >
                      {isAiLoading ? <Loader2 className="animate-spin" /> : 'Generate Build'}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function ToolBtn({ active, onClick, icon, tooltip }: { active: boolean, onClick: () => void, icon: React.ReactNode, tooltip: string }) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-xl transition-all ${active ? 'bg-blue-600 text-white shadow-lg scale-110' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
      title={tooltip}
    >
      {icon}
    </button>
  );
}