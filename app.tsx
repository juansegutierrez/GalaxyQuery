import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Terminal, Database, Play, AlertCircle, CheckCircle, ChevronRight, RotateCcw, AlertTriangle, Star, Trophy, ArrowRight, MessageSquare, HelpCircle } from 'lucide-react';

// --- UTILITIES ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("3D Context Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// --- MISSION CONFIGURATION ---
const MISSIONS = [
  {
    id: 1,
    title: "The Hangar",
    briefing: "Wakey wakey, Commander. Cryo-sleep looks terrible on you. Systems are offline, and I refuse to fly blind. Initialize the navigation mainframe by retrieving ALL data from the 'planets' registry. I'd do it myself, but I don't have fingers.",
    hint: "Use the wildcard (*) to select everything. Syntax: SELECT * FROM [table_name]",
    additionalHint: "Oh for the love of... just type: SELECT * FROM planets",
    placeholder: "Type SQL command here...",
    successCondition: (result, query) => result.type === 'SELECT' && result.data.length >= 5,
    successMessage: "Finally. Data loaded. Try not to crash us into the hangar doors."
  },
  {
    id: 2,
    title: "Deep Space Thirst",
    briefing: "Critical Alert: The coffee machine is empty. Also, life support water reserves are at 5%. But mainly the coffee. Filter the `planets` table to find a rock with `resource = 'Water'`. I don't care about the other dustballs.",
    hint: "Use a WHERE clause to filter results. Example: WHERE column = 'Value'",
    additionalHint: "The column is 'resource'. The value is 'Water'. Put them together: SELECT * FROM planets WHERE resource = 'Water'",
    placeholder: "SELECT ... WHERE ...",
    successCondition: (result, query) => result.type === 'SELECT' && result.data.some(p => p.resource === 'Water') && result.data.length === 1,
    successMessage: "Hydration secured. Brewing espresso... oh, and repressurizing life support, I guess."
  },
  {
    id: 3,
    title: "Manifest Destiny",
    briefing: "Sensors are picking up a massive object. It's ugly, it's gray, and it's not on the map. Let's call it 'Zentari'. I need you to manually `INSERT` it into the `planets` registry. Parameters: Type is 'Unknown', Gravity is 1.5. Don't mess up the syntax, I hate cleaning up corrupted bits.",
    hint: "Syntax: INSERT INTO table (col1, col2) VALUES (val1, val2)",
    additionalHint: "I'm literally spelling it out: INSERT INTO planets (name, type, gravity) VALUES ('Zentari', 'Unknown', 1.5)",
    placeholder: "INSERT INTO ...",
    successCondition: (result, query) => result.type === 'INSERT',
    successMessage: "Database updated. Look at us, conquering the unknown. I'm practically an explorer bot now."
  },
  {
    id: 4,
    title: "The Audit",
    briefing: "The Admiral is on the comms. He's asking for a 'Tactical Spread Report'. I think he just likes colorful charts. Count the planets by `type` using `GROUP BY`. If you make me look bad in front of fleet command, I will vent the airlock.",
    hint: "Combine COUNT(*) with a GROUP BY clause.",
    additionalHint: "Try: SELECT type, COUNT(*) FROM planets GROUP BY type. Charts love aggregates.",
    placeholder: "SELECT type, ...",
    successCondition: (result, query) => result.type === 'AGGREGATE',
    successMessage: "Report sent. The Admiral seems pleased. He says you're 'adequate'. High praise."
  }
];

// --- INITIAL DATABASE STATE ---
const INITIAL_PLANETS = [
  { id: 1, name: "Xylos", type: "Gas Giant", gravity: 2.4, resource: "Hydrogen" },
  { id: 2, name: "Terra Nova", type: "Terrestrial", gravity: 1.0, resource: "Water" },
  { id: 3, name: "Vulcanis", type: "Magma", gravity: 0.8, resource: "Iron" },
  { id: 4, name: "Aeria", type: "Ice", gravity: 0.6, resource: "Crystals" },
  { id: 5, name: "Oxtrad", type: "Desert", gravity: 1.2, resource: "Silicon" },
];

// --- SQL ENGINE (Simulation) ---
// Enhanced to support WHERE, INSERT, and mocked AGGREGATES
const parseQuery = (query, currentPlanets, setPlanets) => {
  const cleanQuery = query.trim().replace(/;$/, '').toLowerCase();
  
  if (!cleanQuery) {
     return { success: false, error: "Error: Input empty. I can't read your mind, Commander." };
  }

  // 1. Handle INSERT
  if (cleanQuery.startsWith('insert into')) {
    const insertRegex = /insert\s+into\s+planets\s*\((.+)\)\s*values\s*\((.+)\)/;
    const match = cleanQuery.match(insertRegex);
    if (!match) return { success: false, error: "Syntax Error: INSERT format incorrect. Are you missing parentheses?" };
    
    // Mock insertion for gameplay
    const newPlanet = { 
      id: currentPlanets.length + 1, 
      name: "Zentari", 
      type: "Unknown", 
      gravity: 1.5, 
      resource: "Unknown" 
    };
    
    setPlanets([...currentPlanets, newPlanet]);
    return { success: true, type: 'INSERT', data: [newPlanet], fields: Object.keys(newPlanet) };
  }

  // 2. Handle GROUP BY (Mocked for Level 4)
  if (cleanQuery.includes('group by')) {
    if (cleanQuery.includes('type')) {
      const mockData = [
        { type: "Gas Giant", count: 1 },
        { type: "Terrestrial", count: 1 },
        { type: "Magma", count: 1 },
        { type: "Ice", count: 1 },
        { type: "Desert", count: 1 },
        { type: "Unknown", count: 1 }
      ];
      return { success: true, type: 'AGGREGATE', data: mockData, fields: ['type', 'count'] };
    }
  }

  // 3. Handle SELECT
  const selectRegex = /^select\s+(.+)\s+from\s+(.+?)(\s+where\s+(.+))?$/;
  const match = cleanQuery.match(selectRegex);

  if (!match) {
    return { success: false, error: "Syntax Error: That doesn't look like standard SQL." };
  }

  const [, fields, table, , whereClause] = match;

  if (table.trim() !== 'planets') {
    return { success: false, error: `Error: Table '${table}'? Never heard of it.` };
  }

  let results = [...currentPlanets];

  // Logic: WHERE
  if (whereClause) {
    const whereMatch = whereClause.match(/(\w+)\s*=\s*['"]?(.+?)['"]?$/);
    if (whereMatch) {
      const [, col, val] = whereMatch;
      results = results.filter(p => String(p[col]).toLowerCase() === val.toLowerCase());
    }
  }

  // Logic: Field Selection
  const availableFields = Object.keys(INITIAL_PLANETS[0]);
  let selectedFields = [];
  
  if (fields.trim() === '*') {
    selectedFields = availableFields;
  } else {
    selectedFields = fields.split(',').map(f => f.trim());
    const invalid = selectedFields.find(f => !availableFields.includes(f));
    if (invalid && !fields.includes('count')) return { success: false, error: `Error: Column '${invalid}' does not exist.` };
  }

  return { success: true, type: 'SELECT', data: results, fields: selectedFields };
};

// --- THREE.JS VIEWPORT (NATIVE IMPLEMENTATION) ---
const ThreeViewport = ({ levelState, levelId }) => {
  const mountRef = useRef(null);
  const planetRef = useRef(null);
  const starsRef = useRef(null);
  const frameRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0x00ffff, 1.5);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // Planet
    const geometry = new THREE.SphereGeometry(1.5, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.7,
      metalness: 0.2,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.1,
      wireframe: true
    });
    const planet = new THREE.Mesh(geometry, material);
    planetRef.current = planet;
    scene.add(planet);

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x00ffcc, 0x112233);
    grid.position.y = -2;
    scene.add(grid);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starCount = 400;
    const posArray = new Float32Array(starCount * 3);
    for(let i=0; i < starCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 60; 
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const starMat = new THREE.PointsMaterial({ 
      size: 0.08, 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.6 
    });
    const stars = new THREE.Points(starGeo, starMat);
    starsRef.current = stars;
    scene.add(stars);

    const animate = (time) => {
      frameRef.current = requestAnimationFrame(animate);
      const seconds = time * 0.001;

      if (planet) {
        planet.rotation.y += 0.002;
        planet.position.y = Math.sin(seconds) * 0.1;
      }
      if (stars) {
        stars.rotation.y -= 0.0005;
      }
      renderer.render(scene, camera);
    };
    animate(0);

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      starGeo.dispose();
      starMat.dispose();
    };
  }, []);

  // Update Visuals based on Level
  useEffect(() => {
    if (planetRef.current) {
      const isSuccess = levelState === 'success';
      const mat = planetRef.current.material;
      
      // Level specific colors
      let baseColor = 0x3b82f6; // Default Blue
      if (levelId === 2) baseColor = 0x0ea5e9; // Cyan (Water)
      if (levelId === 3) baseColor = 0xf59e0b; // Orange (New Planet)
      if (levelId === 4) baseColor = 0xa855f7; // Purple (Fleet)

      const targetColor = isSuccess ? 0x4ade80 : baseColor;
      
      mat.color.setHex(targetColor);
      mat.emissive.setHex(targetColor);
      mat.wireframe = !isSuccess;
      mat.needsUpdate = true;
    }
  }, [levelState, levelId]);

  return <div ref={mountRef} className="w-full h-full" />;
};

// --- FALLBACK 2D VISUALS ---
const FallbackViewport = ({ levelState }) => (
  <div className="w-full h-full flex flex-col items-center justify-center bg-black relative overflow-hidden">
    <div className="absolute inset-0 opacity-20" style={{ 
      backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', 
      backgroundSize: '30px 30px' 
    }}></div>
    
    <div className={`relative w-48 h-48 rounded-full border-4 flex items-center justify-center transition-all duration-1000 ${levelState === 'success' ? 'border-green-500 shadow-[0_0_50px_rgba(74,222,128,0.5)]' : 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.3)]'}`}>
      <div className={`w-40 h-40 rounded-full border border-dashed animate-[spin_10s_linear_infinite] ${levelState === 'success' ? 'border-green-400' : 'border-cyan-400'}`}></div>
      <div className="absolute text-center">
        {levelState === 'success' ? (
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        ) : (
          <div className="text-cyan-500 font-mono text-xs animate-pulse">Scanning...</div>
        )}
      </div>
    </div>
  </div>
);

// --- REACT UI COMPONENTS ---

const MissionBriefing = ({ mission, currentLevel }) => (
  <div className="bg-slate-900/80 border-l-4 border-cyan-500 p-4 mb-4 backdrop-blur-sm shadow-lg shadow-cyan-500/10 relative overflow-hidden">
    <div className="flex items-start gap-3 relative z-10">
       <div className="bg-cyan-900/50 p-2 rounded-full border border-cyan-500/50">
          <MessageSquare size={20} className="text-cyan-400" />
       </div>
       <div>
          <h3 className="text-cyan-400 font-bold uppercase tracking-widest text-xs mb-1">
             INCOMING TRANSMISSION // IRIS
          </h3>
          <p className="text-slate-300 font-mono text-sm leading-relaxed">
            "{mission.briefing}"
          </p>
       </div>
    </div>
  </div>
);

const ResultTable = ({ data, fields }) => {
  if (!data || data.length === 0) return null;
  return (
    <div className="overflow-x-auto mt-4 border border-slate-700 rounded-md bg-black/50">
      <table className="w-full text-left text-xs font-mono">
        <thead className="bg-slate-800 text-cyan-400">
          <tr>
            {fields.map(field => (
              <th key={field} className="p-2 border-b border-slate-700 uppercase">{field}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-300">
          {data.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
              {fields.map(field => (
                <td key={`${idx}-${field}`} className="p-2">{row[field]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// --- MAIN APPLICATION COMPONENT ---

export default function GalaxyQuery() {
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  const [dbPlanets, setDbPlanets] = useState(INITIAL_PLANETS);
  const [query, setQuery] = useState("");
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const [levelState, setLevelState] = useState('idle'); // idle, success, error
  const [history, setHistory] = useState([]);
  const [showExtraHint, setShowExtraHint] = useState(false);

  const currentMission = MISSIONS[currentLevelIdx];

  // Update query when level changes
  useEffect(() => {
    setQuery("");
    setOutput(null);
    setError(null);
    setLevelState('idle');
    setShowExtraHint(false);
  }, [currentLevelIdx]);

  // Iris Narrative Logic
  const executeCommand = (e) => {
    e.preventDefault();
    setLevelState('idle');
    setError(null);
    
    // Simulate Processing Delay
    setTimeout(() => {
      const result = parseQuery(query, dbPlanets, setDbPlanets);
      
      if (result.success) {
        setOutput(result);
        setHistory(prev => [`> ${query}`, "Query Successful.", ...prev]);
        
        // CHECK VICTORY CONDITION
        if (currentMission.successCondition(result, query)) {
          setLevelState('success');
        } else {
           // Valid SQL, but wrong answer for mission
           setError("That query ran fine, but it didn't solve the problem. Try actually reading the briefing.");
        }

      } else {
        setError(result.error);
        setHistory(prev => [`> ${query}`, `ERROR: ${result.error}`, ...prev]);
        setLevelState('error');
      }
    }, 400);
  };

  const nextLevel = () => {
    if (currentLevelIdx < MISSIONS.length - 1) {
      setCurrentLevelIdx(prev => prev + 1);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      
      {/* HEADER */}
      <header className="h-14 border-b border-slate-800 bg-slate-900 flex items-center px-6 justify-between z-10">
        <div className="flex items-center gap-2">
          <Database className="text-cyan-500" size={20} />
          <h1 className="font-bold tracking-wider text-lg">GALAXY<span className="text-cyan-500">QUERY</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
          <span className="flex items-center gap-1">
             AI: <span className="text-green-500 animate-pulse">IRIS</span>
          </span>
          <span className="bg-slate-800 px-2 py-1 rounded">LVL {currentLevelIdx + 1}/{MISSIONS.length}</span>
        </div>
      </header>

      {/* MAIN CONTENT SPLIT */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* VIEWPORT (VISUAL CONTEXT) */}
        <div className="md:w-1/2 h-1/2 md:h-full relative border-r border-slate-800 bg-black">
          <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <h2 className="text-xs font-mono text-cyan-500/80 border border-cyan-500/30 px-2 py-1 rounded bg-black/50">
              LIVE FEED: {currentMission.title.toUpperCase()}
            </h2>
          </div>
          
          <ErrorBoundary fallback={<FallbackViewport levelState={levelState} />}>
            <ThreeViewport levelState={levelState} levelId={currentMission.id} />
          </ErrorBoundary>

          {/* Overlay Status Message in View */}
          {levelState === 'success' && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-900/40 backdrop-blur-sm z-20">
              <div className="bg-slate-900 border-2 border-green-500 p-8 rounded-lg text-center shadow-[0_0_50px_rgba(74,222,128,0.3)] max-w-sm">
                <Trophy className="mx-auto text-green-400 mb-4 animate-bounce" size={48} />
                <h3 className="text-2xl font-bold text-white mb-2">MISSION ACCOMPLISHED</h3>
                <p className="text-green-300 font-mono text-sm mb-6">{currentMission.successMessage}</p>
                
                {currentLevelIdx < MISSIONS.length - 1 ? (
                  <button 
                    onClick={nextLevel}
                    className="w-full bg-green-600 hover:bg-green-500 text-white py-3 px-4 rounded font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-105"
                  >
                    Next Mission <ArrowRight size={18} />
                  </button>
                ) : (
                   <div className="text-yellow-400 font-bold border border-yellow-500/30 p-2 rounded bg-yellow-500/10">
                     CAMPAIGN COMPLETE
                   </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* HUD / TERMINAL (INTERACTION) */}
        <div className="md:w-1/2 h-1/2 md:h-full flex flex-col bg-slate-900/50 backdrop-blur-md">
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col">
            <MissionBriefing 
              mission={currentMission}
              currentLevel={currentLevelIdx}
            />

            {/* Hint System */}
            <div className="text-xs text-slate-500 font-mono mb-4 border-l-2 border-slate-700 pl-3">
              <span className="text-cyan-500 font-bold">IRIS_HINT (Mission {currentLevelIdx + 1}):</span> 
              <br/>
              <span className="text-slate-400">{currentMission.hint}</span>
            </div>

            {/* Extra Hint Button / Display */}
            <div className="mb-4">
              {!showExtraHint ? (
                <button 
                  onClick={() => setShowExtraHint(true)}
                  className="text-xs flex items-center gap-1 text-slate-500 hover:text-cyan-400 transition-colors font-mono"
                >
                  <HelpCircle size={12} /> I'm stuck. Ask Iris for help.
                </button>
              ) : (
                <div className="text-xs text-slate-500 font-mono border-l-2 border-yellow-700 pl-3 animate-in fade-in slide-in-from-left-2">
                  <span className="text-yellow-500 font-bold">IRIS_SASS:</span> 
                  <br/>
                  <span className="text-slate-300 italic">"{currentMission.additionalHint}"</span>
                </div>
              )}
            </div>

            {/* Results Area */}
            {output && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-mono text-green-400">QUERY_RESULT: {output.data.length} records</span>
                 </div>
                 <ResultTable data={output.data} fields={output.fields} />
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-800 text-red-200 text-sm font-mono flex items-start gap-2 rounded animate-shake">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Credits Footer */}
            <div className="mt-auto pt-6 text-center">
              <p className="text-[10px] text-slate-700 font-mono uppercase tracking-widest">
                A game by Juan S. Gutierrez
              </p>
            </div>
          </div>

          {/* Fixed Terminal Input */}
          <div className="p-4 bg-slate-950 border-t border-slate-800">
             <div className="flex justify-between text-xs font-mono text-slate-500 mb-2">
               <span>COMMAND_LINE</span>
               <button 
                onClick={() => { setQuery(""); setOutput(null); setError(null); }}
                className="flex items-center gap-1 hover:text-cyan-400 transition-colors"
               >
                 <RotateCcw size={12} /> RESET
               </button>
             </div>
             
             <form onSubmit={executeCommand} className="relative">
               <div className="absolute left-3 top-3 text-cyan-500">
                 <ChevronRight size={18} />
               </div>
               <input 
                 type="text" 
                 value={query}
                 onChange={(e) => setQuery(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-700 rounded-md py-3 pl-10 pr-12 text-slate-100 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all shadow-inner"
                 placeholder={currentMission.placeholder}
                 autoFocus
                 spellCheck={false}
               />
               <button 
                type="submit"
                className="absolute right-2 top-2 bottom-2 bg-cyan-600 hover:bg-cyan-500 text-white px-3 rounded text-xs font-bold uppercase tracking-wider transition-colors flex items-center"
               >
                 Run
               </button>
             </form>
          </div>

        </div>
      </div>
    </div>
  );
}
