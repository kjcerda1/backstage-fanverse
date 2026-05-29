import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// ─── GeoJSON seed data ────────────────────────────────────────────────────────
// Plug Supabase Realtime into the `densityData` prop to go live.
// Shape must stay FeatureCollection<Point> with these properties so all
// Mapbox layer expressions continue to work unchanged.
export const CITY_DENSITY_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type:"Feature", geometry:{ type:"Point", coordinates:[-118.2437, 34.0522] },
      properties:{ city:"Los Angeles", fans:3800, intensity:0.32, level:"Spiking",         event:"aespa Drama Tour",     trending:true,  color:"#ffc8ec" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-96.7970,  32.7767] },
      properties:{ city:"Dallas",      fans:1200, intensity:0.10, level:"Very Active",     event:"BTS · Apr 30",          trending:false, color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-87.6298,  41.8781] },
      properties:{ city:"Chicago",     fans:950,  intensity:0.08, level:"Rising",          event:"Stray Kids · May 14",   trending:true,  color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-74.0059,  40.7128] },
      properties:{ city:"New York",    fans:4200, intensity:0.35, level:"Very Active",     event:"NewJeans · MSG Jun 18", trending:true,  color:"#a5d8ff" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[ -0.1278,  51.5074] },
      properties:{ city:"London",      fans:3100, intensity:0.26, level:"Active",          event:"Stray Kids EU leg",     trending:false, color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[  2.3522,  48.8566] },
      properties:{ city:"Paris",       fans:2000, intensity:0.17, level:"Active",          event:"General activity",      trending:false, color:"#80ffdf" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[ 13.4050,  52.5200] },
      properties:{ city:"Berlin",      fans:1400, intensity:0.12, level:"Active",          event:"General activity",      trending:false, color:"#b8b8d8" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[126.9780,  37.5665] },
      properties:{ city:"Seoul",       fans:12000,intensity:1.00, level:"Extremely Active",event:"BTS comeback wave",     trending:true,  color:"#ffe0f5" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[139.6917,  35.6895] },
      properties:{ city:"Tokyo",       fans:8500, intensity:0.71, level:"Very Active",     event:"aespa Drama Tour",      trending:true,  color:"#ffd4ee" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[121.4737,  31.2304] },
      properties:{ city:"Shanghai",    fans:2900, intensity:0.24, level:"Active",          event:"General activity",      trending:false, color:"#f0a8cc" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[120.9842,  14.5995] },
      properties:{ city:"Manila",      fans:2200, intensity:0.18, level:"Active",          event:"General activity",      trending:false, color:"#80ffdf" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[100.5018,  13.7563] },
      properties:{ city:"Bangkok",     fans:1800, intensity:0.15, level:"Active",          event:"General activity",      trending:false, color:"#ff9fa8" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[ 36.8219,  -1.2921] },
      properties:{ city:"Nairobi",     fans:800,  intensity:0.07, level:"Growing",         event:"General activity",      trending:false, color:"#f8d080" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-46.6333, -23.5505] },
      properties:{ city:"São Paulo",   fans:1100, intensity:0.09, level:"Active",          event:"General activity",      trending:false, color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[151.2093, -33.8688] },
      properties:{ city:"Sydney",      fans:900,  intensity:0.08, level:"Steady",          event:"General activity",      trending:false, color:"#80ffdf" }},
  ],
};

// Empty shells — Supabase Realtime populates these at runtime
export const CONCERT_CHECKINS_GEOJSON = { type:"FeatureCollection", features:[] };
export const NEARBY_FANS_GEOJSON      = { type:"FeatureCollection", features:[] };
const EMPTY_FC                        = { type:"FeatureCollection", features:[] };

const MAPBOX_CDN_VERSION = "3.3.0";
const MAPBOX_CDN_BASE    = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_CDN_VERSION}`;

// ─── CSS injection (once, idempotent) ────────────────────────────────────────
function injectMapboxCSS() {
  if (document.getElementById("mapbox-gl-css")) return;
  const link = document.createElement("link");
  link.id   = "mapbox-gl-css";
  link.rel  = "stylesheet";
  link.href = `${MAPBOX_CDN_BASE}/mapbox-gl.css`;
  document.head.appendChild(link);
}

// ─── JS injection — loads CDN UMD bundle so window.mapboxgl is always set ────
function loadMapboxGL() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (window.__mapboxGLPromise) return window.__mapboxGLPromise;
  window.__mapboxGLPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id      = "mapbox-gl-js";
    script.src     = `${MAPBOX_CDN_BASE}/mapbox-gl.js`;
    script.onload  = () => { window.__mapboxGLPromise = null; resolve(window.mapboxgl); };
    script.onerror = (e) => { window.__mapboxGLPromise = null; reject(e); };
    document.head.appendChild(script);
  });
  return window.__mapboxGLPromise;
}

// ─── Cosmic style — deep space dark map, improved contrast ───────────────────
function applyCosmicStyle(map) {
  const layers = map.getStyle().layers;

  const paintOverrides = [
    // Slightly brighter land/water so globe reads clearly without looking generic
    ["background",               "background-color",  "#08061a"],
    ["water",                    "fill-color",        "#050a18"],   // distinct blue-dark from land
    ["land",                     "background-color",  "#16122e"],   // richer purple-dark
    ["landuse",                  "fill-color",        "#141030"],
    ["landuse-shadow",           "fill-color",        "#141030"],
    ["national-park",            "fill-color",        "#11102a"],
    // More visible country boundaries
    ["admin-0-boundary",         "line-color",        "rgba(184,162,255,0.40)"],
    ["admin-0-boundary",         "line-opacity",      0.72],
    ["admin-0-boundary",         "line-width",        0.7],
    ["admin-0-boundary-disputed","line-color",        "rgba(184,162,255,0.22)"],
    ["admin-0-boundary-disputed","line-opacity",      0.40],
    ["admin-1-boundary",         "line-color",        "rgba(184,162,255,0.11)"],
    ["admin-1-boundary",         "line-opacity",      0.42],
    ["admin-state-province",     "line-color",        "rgba(184,162,255,0.11)"],
    ["admin-state-province",     "line-opacity",      0.42],
    // More readable country labels
    ["country-label",            "text-color",        "rgba(184,162,255,0.58)"],
    ["country-label",            "text-halo-color",   "#08061a"],
    ["country-label",            "text-opacity",      0.62],
    ["state-label",              "text-color",        "rgba(184,162,255,0.22)"],
    ["state-label",              "text-opacity",      0.26],
    ["settlement-major-label",   "text-color",        "rgba(184,162,255,0.30)"],
    ["settlement-major-label",   "text-halo-color",   "#08061a"],
    ["settlement-major-label",   "text-opacity",      0.36],
    ["settlement-minor-label",   "text-color",        "rgba(184,162,255,0.16)"],
    ["settlement-minor-label",   "text-halo-color",   "#08061a"],
    ["settlement-minor-label",   "text-opacity",      0.20],
  ];

  paintOverrides.forEach(([id, prop, value]) => {
    try { map.setPaintProperty(id, prop, value); } catch (_) {}
  });

  const noisePatterns = ["road","street","path","tunnel","bridge","aeroway","transit","building","parking","pitch","gate"];
  layers
    .filter(l => noisePatterns.some(p => l.id.includes(p)))
    .forEach(l => { try { map.setLayoutProperty(l.id, "visibility", "none"); } catch (_) {} });
}

// ─── Layer definitions ────────────────────────────────────────────────────────
function buildLayers(showHeatmap) {
  return [
    // ── Heatmap ───────────────────────────────────────────────────────────────
    {
      id: "fan-heatmap", type: "heatmap", source: "fan-density", maxzoom: 6,
      paint: {
        "heatmap-weight":    ["interpolate",["linear"],["get","intensity"], 0,0, 1,1],
        "heatmap-intensity": ["interpolate",["linear"],["zoom"], 0,1, 6,3],
        "heatmap-color": [
          "interpolate",["linear"],["heatmap-density"],
          0,"rgba(6,6,15,0)", 0.2,"rgba(90,40,160,0.6)", 0.5,"rgba(184,162,255,0.78)",
          0.8,"rgba(240,168,204,0.95)", 1,"rgba(255,80,140,1)",
        ],
        "heatmap-radius":  ["interpolate",["linear"],["zoom"], 0,26, 6,110],
        "heatmap-opacity": showHeatmap ? 0.9 : 0,
      },
    },

    // ── City glow — 4 layered halos for depth ─────────────────────────────────
    // Wide atmospheric bloom
    { id:"fan-glow-atmosphere", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,62,12000,190], "circle-color":["get","color"], "circle-opacity":0.04, "circle-blur":1.5 }},
    // Soft outer glow
    { id:"fan-glow-outer", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,44,12000,132], "circle-color":["get","color"], "circle-opacity":0.09, "circle-blur":1.2 }},
    // Mid glow
    { id:"fan-glow-mid", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,24,12000,70], "circle-color":["get","color"], "circle-opacity":0.20, "circle-blur":0.55 }},
    // Inner halo — new layer for extra premium layering
    { id:"fan-glow-inner", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,12,12000,36], "circle-color":["get","color"], "circle-opacity":0.44, "circle-blur":0.22 }},
    // Bright crisp core
    { id:"fan-core", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,6,12000,22], "circle-color":["get","color"], "circle-opacity":1.0, "circle-stroke-width":1.5, "circle-stroke-color":"rgba(255,255,255,0.55)" }},

    // ── Trending pulse ring (RAF-animated) ────────────────────────────────────
    { id:"fan-pulse", type:"circle", source:"fan-density",
      filter:["==",["get","trending"],true],
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,28,12000,92], "circle-color":["get","color"], "circle-opacity":0.28, "circle-blur":0.80 }},

    // ── City labels ───────────────────────────────────────────────────────────
    { id:"fan-labels", type:"symbol", source:"fan-density", minzoom:2,
      layout:{
        "text-field":["concat",["get","city"],"\n",["case",[">=",["get","fans"],1000],["concat",["to-string",["round",["/",["get","fans"],1000]]],"K"],["to-string",["get","fans"]]]],
        "text-font":["DIN Offc Pro Bold","Arial Unicode MS Bold"],
        "text-size":["interpolate",["linear"],["get","fans"],800,10,12000,14],
        "text-offset":[0,1.8], "text-anchor":"top", "text-allow-overlap":false,
      },
      paint:{ "text-color":["get","color"], "text-halo-color":"#06060f", "text-halo-width":2, "text-opacity":0.95 },
    },

    // ── Future Supabase Realtime layers ───────────────────────────────────────
    { id:"concert-checkins", type:"circle", source:"concert-checkins",
      paint:{ "circle-radius":8, "circle-color":"#f0cc88", "circle-opacity":0.8, "circle-blur":0.2 }},
    { id:"nearby-fans", type:"circle", source:"nearby-fans",
      paint:{ "circle-radius":6, "circle-color":"#64c88c", "circle-opacity":0.85, "circle-stroke-width":1, "circle-stroke-color":"rgba(255,255,255,0.3)" }},

    // ── Selected city — premium ring set (RAF-animated, empty until tap) ──────
    { id:"sel-bloom", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,82,12000,225], "circle-color":["get","color"], "circle-opacity":0.08, "circle-blur":1.35 }},
    // Slow outermost ring
    { id:"sel-ring-outermost", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,58,12000,150], "circle-color":"rgba(0,0,0,0)", "circle-opacity":0, "circle-stroke-width":1, "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.20 }},
    { id:"sel-ring-outer", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,42,12000,118], "circle-color":"rgba(0,0,0,0)", "circle-opacity":0, "circle-stroke-width":1.5, "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.38 }},
    { id:"sel-ring-inner", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,28,12000,80], "circle-color":"rgba(0,0,0,0)", "circle-opacity":0, "circle-stroke-width":2, "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.65 }},
    { id:"sel-core", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,11,12000,28], "circle-color":"#ffffff", "circle-opacity":1.0, "circle-stroke-width":3, "circle-stroke-color":["get","color"], "circle-stroke-opacity":1 }},
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────
const MapboxMap = forwardRef(function MapboxMap({
  densityData         = CITY_DENSITY_GEOJSON,
  showHeatmap         = false,
  onCityClick         = null,
  selectedCityFeature = null,   // full GeoJSON Feature of the selected city
}, ref) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const rafRef       = useRef(null);
  const phaseRef     = useRef(0);
  const readyRef     = useRef(false);

  // Gesture hint — auto-fades after 3s, removed from DOM at 3.8s
  const [hintOpacity, setHintOpacity] = useState(1);
  const [hintVisible, setHintVisible] = useState(true);

  useImperativeHandle(ref, () => ({
    flyTo(lng, lat, zoom = 4.5) {
      if (!mapRef.current || !readyRef.current) return;
      mapRef.current.flyTo({ center:[lng,lat], zoom, speed:0.9, curve:1.3, essential:true });
    },
  }), []);

  // Auto-fade gesture hint
  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    const fadeT = setTimeout(() => setHintOpacity(0), 3000);
    const hideT = setTimeout(() => setHintVisible(false), 3800);
    return () => { clearTimeout(fadeT); clearTimeout(hideT); };
  }, []);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN || mapRef.current) return;
    injectMapboxCSS();
    let map;

    loadMapboxGL().then(mapboxgl => {
      if (!containerRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      map = new mapboxgl.Map({
        container: containerRef.current,
        style:     "mapbox://styles/mapbox/dark-v11",
        center:    [20, 18],
        zoom:      1.3,             // slightly more zoomed out — globe visible
        minZoom:   0.8,             // allow full globe pull-back
        maxZoom:   10,              // allow city-level detail
        attributionControl: false,
        logoPosition: "bottom-right",
        fadeDuration: 300,
        dragRotate:      true,      // enables globe spinning (right-click drag / ctrl+drag)
        touchZoomRotate: true,      // enables pinch-to-zoom + two-finger rotate
        touchPitch:      false,     // prevent accidental tilt on mobile
        pitchWithRotate: false,     // keep flat pitch while spinning
      });

      mapRef.current = map;
      map.addControl(new mapboxgl.AttributionControl({ compact:true }), "bottom-right");

      map.on("load", () => {
        // Globe projection — 3D spinning sphere
        map.setProjection({ name: "globe" });

        // Space atmosphere — horizon glow + deep space color + subtle stars
        map.setFog({
          color:            "#06060f",   // near-ground fog color
          "high-color":     "#1e1250",   // upper atmosphere purple glow
          "horizon-blend":  0.28,        // blend softness at horizon
          "space-color":    "#050318",   // deep space
          "star-intensity": 0.15,        // subtle native Mapbox stars
        });

        applyCosmicStyle(map);

        map.addSource("fan-density",      { type:"geojson", data: densityData });
        map.addSource("concert-checkins", { type:"geojson", data: CONCERT_CHECKINS_GEOJSON });
        map.addSource("nearby-fans",      { type:"geojson", data: NEARBY_FANS_GEOJSON });
        map.addSource("selected-city",    { type:"geojson", data: EMPTY_FC });

        buildLayers(showHeatmap).forEach(layer => map.addLayer(layer));
        readyRef.current = true;

        // ── RAF pulse animation ──────────────────────────────────────────────
        const animate = () => {
          if (!mapRef.current) return;
          phaseRef.current = (phaseRef.current + 0.022) % (Math.PI * 2);
          const sin = Math.sin(phaseRef.current);

          // Trending pulse — more vivid
          const pOpacity = 0.10 + sin * 0.20;
          const pMult    = 1 + sin * 0.22;
          // Three ring phases — each at different frequencies
          const s1 = Math.sin(phaseRef.current * 0.65);         // mid ring
          const s2 = Math.sin(phaseRef.current * 1.15 + 1.9);   // inner ring (faster)
          const s3 = Math.sin(phaseRef.current * 0.42 + 0.8);   // outermost ring (slowest)

          try {
            map.setPaintProperty("fan-pulse", "circle-opacity", Math.max(0, pOpacity));
            map.setPaintProperty("fan-pulse", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,28*pMult, 12000,92*pMult,
            ]);
            map.setPaintProperty("sel-ring-outermost", "circle-stroke-opacity", Math.max(0, 0.10 + s3 * 0.14));
            map.setPaintProperty("sel-ring-outermost", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,58*(1+s3*0.08), 12000,150*(1+s3*0.08),
            ]);
            map.setPaintProperty("sel-ring-outer", "circle-stroke-opacity", Math.max(0, 0.20 + s1 * 0.22));
            map.setPaintProperty("sel-ring-outer", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,42*(1+s1*0.14), 12000,118*(1+s1*0.14),
            ]);
            map.setPaintProperty("sel-ring-inner", "circle-stroke-opacity", Math.max(0, 0.40 + s2 * 0.28));
            map.setPaintProperty("sel-ring-inner", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,28*(1+s2*0.10), 12000,80*(1+s2*0.10),
            ]);
          } catch (_) {
            return;
          }
          rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);

        // City click
        map.on("click", "fan-core", e => {
          if (!e.features?.length || !onCityClick) return;
          onCityClick(e.features[0].properties);
        });
        map.on("mouseenter", "fan-core", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "fan-core", () => { map.getCanvas().style.cursor = ""; });
      });
    }).catch(err => console.warn("[MapboxMap] load error:", err));

    return () => {
      cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live density data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    try { mapRef.current.getSource("fan-density")?.setData(densityData); } catch (_) {}
  }, [densityData]);

  // ── Heatmap toggle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    try { mapRef.current.setPaintProperty("fan-heatmap", "heatmap-opacity", showHeatmap ? 0.9 : 0); } catch (_) {}
  }, [showHeatmap]);

  // ── Selected city emphasis ─────────────────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    try {
      mapRef.current.getSource("selected-city")?.setData(
        selectedCityFeature ? { type:"FeatureCollection", features:[selectedCityFeature] } : EMPTY_FC
      );

      if (selectedCityFeature) {
        const city = selectedCityFeature.properties.city;
        const notSel = ["!=", ["get","city"], city];
        // Dim all non-selected cities, spotlight the selected one
        mapRef.current.setPaintProperty("fan-core",            "circle-opacity", ["case", notSel, 0.20, 1.0]);
        mapRef.current.setPaintProperty("fan-glow-atmosphere", "circle-opacity", ["case", notSel, 0.01, 0.07]);
        mapRef.current.setPaintProperty("fan-glow-outer",      "circle-opacity", ["case", notSel, 0.01, 0.12]);
        mapRef.current.setPaintProperty("fan-glow-mid",        "circle-opacity", ["case", notSel, 0.03, 0.24]);
        mapRef.current.setPaintProperty("fan-glow-inner",      "circle-opacity", ["case", notSel, 0.04, 0.55]);
        mapRef.current.setPaintProperty("fan-labels",          "text-opacity",   ["case", notSel, 0.10, 1.0]);
      } else {
        // Restore all layers to default values matching buildLayers()
        mapRef.current.setPaintProperty("fan-core",            "circle-opacity", 1.0);
        mapRef.current.setPaintProperty("fan-glow-atmosphere", "circle-opacity", 0.04);
        mapRef.current.setPaintProperty("fan-glow-outer",      "circle-opacity", 0.09);
        mapRef.current.setPaintProperty("fan-glow-mid",        "circle-opacity", 0.20);
        mapRef.current.setPaintProperty("fan-glow-inner",      "circle-opacity", 0.44);
        mapRef.current.setPaintProperty("fan-labels",          "text-opacity",   0.95);
      }
    } catch (_) {}
  }, [selectedCityFeature]);

  // ── No-token fallback — cinematic interactive city visualization ──────────
  // IMPORTANT: This block must stay completely unchanged.
  // It renders when VITE_MAPBOX_TOKEN is missing — no white screen, no crash.
  if (!MAPBOX_TOKEN) {
    const selName = selectedCityFeature?.properties?.city ?? null;
    const cityDots = CITY_DENSITY_GEOJSON.features.map(f => {
      const [lng, lat] = f.geometry.coordinates;
      return {
        ...f.properties,
        x: ((lng + 180) / 360) * 100,
        y: ((90  - lat) / 180) * 100,
      };
    });
    const selCity = selName ? cityDots.find(c => c.city === selName) : null;

    return (
      <div style={{ width:"100%", height:"100%", background:"linear-gradient(165deg,#050410 0%,#090622 35%,#060318 65%,#050312 100%)", position:"relative" }}>

        {/* Aurora color bands */}
        <div style={{ position:"absolute", top:"12%", left:"-5%", right:"-5%", height:"22%", background:"linear-gradient(180deg,transparent,rgba(120,60,220,0.055),rgba(155,93,229,0.04),transparent)", pointerEvents:"none", animation:"auraDrift 14s ease-in-out infinite" }} />
        <div style={{ position:"absolute", top:"45%", left:"-5%", right:"-5%", height:"20%", background:"linear-gradient(180deg,transparent,rgba(240,100,160,0.04),rgba(220,80,130,0.03),transparent)", pointerEvents:"none", animation:"auraDrift 18s ease-in-out infinite", animationDelay:"5s" }} />
        <div style={{ position:"absolute", top:"68%", left:"-5%", right:"-5%", height:"16%", background:"linear-gradient(180deg,transparent,rgba(45,212,191,0.03),transparent)", pointerEvents:"none", animation:"auraDrift 11s ease-in-out infinite", animationDelay:"2s" }} />

        {/* Selected city atmosphere cloud */}
        {selCity && <>
          <div style={{ position:"absolute", left:`${selCity.x}%`, top:`${selCity.y}%`, transform:"translate(-50%,-50%)", width:280, height:280, borderRadius:"50%", background:`radial-gradient(ellipse,${selCity.color}14,transparent 65%)`, filter:"blur(28px)", pointerEvents:"none", animation:"ambientGlow 3s ease-in-out infinite" }} />
          <div style={{ position:"absolute", left:`${selCity.x}%`, top:`${selCity.y}%`, transform:"translate(-50%,-50%)", width:160, height:160, borderRadius:"50%", background:`radial-gradient(ellipse,${selCity.color}30,transparent 65%)`, filter:"blur(16px)", pointerEvents:"none", animation:"ambientGlow 2.2s ease-in-out infinite", animationDelay:"0.7s" }} />
          <div style={{ position:"absolute", left:`${selCity.x}%`, top:`${selCity.y}%`, transform:"translate(-50%,-50%)", width:72, height:72, borderRadius:"50%", background:`radial-gradient(ellipse,${selCity.color}55,transparent 65%)`, filter:"blur(8px)", pointerEvents:"none", animation:"pulse 1.8s ease-in-out infinite" }} />
        </>}

        {/* Geographic latitude grid lines */}
        {[25, 45, 62].map(y => (
          <div key={y} style={{ position:"absolute", top:`${y}%`, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,rgba(184,162,255,0.05),rgba(184,162,255,0.06),rgba(184,162,255,0.05),transparent)", pointerEvents:"none" }} />
        ))}
        {[20, 40, 55, 72, 86].map(x => (
          <div key={x} style={{ position:"absolute", left:`${x}%`, top:0, bottom:0, width:1, background:"linear-gradient(180deg,transparent,rgba(184,162,255,0.04),rgba(184,162,255,0.05),rgba(184,162,255,0.04),transparent)", pointerEvents:"none" }} />
        ))}

        {/* Rich starfield */}
        {[
          [6,14,1],[18,8,2],[32,22,1],[47,6,3],[58,18,1],[72,10,2],[84,5,1],[91,20,2],
          [12,38,1],[26,52,1],[38,44,2],[51,35,1],[64,48,1],[77,42,2],[89,55,1],[95,38,1],
          [8,70,2],[22,78,1],[35,66,1],[48,80,3],[61,72,1],[74,62,2],[87,76,1],[96,68,1],
          [15,90,1],[42,94,2],[68,88,1],[82,92,1],
        ].map(([x,y,s],i) => (
          <div key={i} style={{ position:"absolute", left:`${x}%`, top:`${y}%`, width:s, height:s, borderRadius:"50%", background: i%5===0?"rgba(240,168,204,0.7)": i%3===0?"rgba(100,200,140,0.5)": "rgba(184,162,255,0.55)", animation:`pulse ${2+i*0.18}s ease-in-out infinite`, animationDelay:`${(i*0.19)%3}s`, pointerEvents:"none" }} />
        ))}

        {/* City nodes */}
        {cityDots.map((city, i) => {
          const isSel  = city.city === selName;
          const hasSel = selName !== null;
          const scale  = Math.max(0.18, city.fans / 12000);
          const coreR  = isSel ? 16 : Math.max(4, 9 * scale);
          const bloomR = isSel ? 110 : (32 * scale + 14);
          const corOp  = isSel ? 1   : hasSel ? 0.20 : 0.88;
          const bloomOp= isSel ? 0.35 : hasSel ? 0.02 : scale * 0.18;

          return (
            <div key={city.city} style={{ position:"absolute", left:`${city.x}%`, top:`${city.y}%`, transform:"translate(-50%,-50%)", transition:"all 0.42s cubic-bezier(.4,0,.2,1)", zIndex: isSel ? 20 : 1 }}>
              <div style={{ position:"absolute", width:bloomR, height:bloomR, borderRadius:"50%", background:city.color, opacity:bloomOp, filter:`blur(${isSel?22:9}px)`, top:"50%", left:"50%", transform:"translate(-50%,-50%)", transition:"all 0.42s ease", animation:isSel?`ambientGlow 2s ease-in-out infinite`:`pulse ${2.8+i*0.35}s ease-in-out infinite`, animationDelay:`${i*0.28}s` }} />
              {isSel && [
                { size:92, delay:"0s",    border:"1px",   opacity:0.5 },
                { size:62, delay:"0.55s", border:"1.5px", opacity:0.7 },
                { size:36, delay:"1.1s",  border:"2px",   opacity:0.9 },
              ].map(({ size, delay, border, opacity }) => (
                <div key={size} style={{ position:"absolute", top:"50%", left:"50%", width:size, height:size, marginTop:-size/2, marginLeft:-size/2, pointerEvents:"none" }}>
                  <div style={{ width:"100%", height:"100%", borderRadius:"50%", border:`${border} solid ${city.color}`, opacity, animation:"mapPulse 2.6s ease-out infinite", animationDelay:delay }} />
                </div>
              ))}
              <div style={{ width:coreR, height:coreR, borderRadius:"50%", background:city.color, opacity:corOp, position:"relative", boxShadow:isSel?`0 0 28px ${city.color},0 0 10px ${city.color},0 0 4px white`:`0 0 6px ${city.color}55`, transition:"all 0.42s ease", border: isSel?"2px solid rgba(255,255,255,0.85)":"none" }} />
              {isSel && (
                <div style={{ position:"absolute", top:"calc(100% + 10px)", left:"50%", transform:"translateX(-50%)", pointerEvents:"none", animation:"up .3s ease", textAlign:"center", whiteSpace:"nowrap" }}>
                  <p style={{ fontSize:11, color:"white", fontFamily:"'Epilogue',sans-serif", fontWeight:800, letterSpacing:"0.02em", textShadow:`0 0 16px ${city.color},0 0 8px ${city.color}` }}>{city.city}</p>
                  <p style={{ fontSize:8.5, color:city.color, fontFamily:"'Instrument Sans',sans-serif", fontWeight:600, marginTop:2, opacity:0.85 }}>{city.fans >= 1000 ? `${(city.fans/1000).toFixed(1)}K fans` : city.fans}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Edge vignette */}
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 85% 85% at 50% 50%,transparent 55%,rgba(5,4,16,0.55) 100%)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", top:0, left:0, bottom:0, width:"12%", background:"linear-gradient(90deg,rgba(120,60,220,0.08),transparent)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", top:0, right:0, bottom:0, width:"12%", background:"linear-gradient(270deg,rgba(240,100,160,0.06),transparent)", pointerEvents:"none" }} />

        <div style={{ position:"absolute", bottom:8, left:"50%", transform:"translateX(-50%)", zIndex:3, pointerEvents:"none" }}>
          <p style={{ fontSize:8, color:"rgba(184,162,255,0.22)", fontFamily:"'Epilogue',sans-serif", fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", whiteSpace:"nowrap" }}>Live map · add VITE_MAPBOX_TOKEN</p>
        </div>
      </div>
    );
  }

  // ── Real Mapbox globe ─────────────────────────────────────────────────────
  return (
    <div style={{ width:"100%", height:"100%", position:"relative", borderRadius:"inherit" }}>
      <div ref={containerRef} style={{ width:"100%", height:"100%", borderRadius:"inherit" }} />

      {/* Gesture hint — auto-fades after 3s */}
      {hintVisible && (
        <div style={{
          position:       "absolute",
          bottom:         14,
          left:           "50%",
          transform:      "translateX(-50%)",
          background:     "rgba(6,4,20,0.82)",
          backdropFilter: "blur(14px)",
          border:         "1px solid rgba(184,162,255,0.22)",
          borderRadius:   99,
          padding:        "6px 15px",
          pointerEvents:  "none",
          zIndex:         2,
          opacity:        hintOpacity,
          transition:     "opacity 0.8s ease",
          whiteSpace:     "nowrap",
        }}>
          <p style={{ fontSize:9, color:"rgba(184,162,255,0.80)", fontFamily:"'Epilogue',sans-serif", fontWeight:600, letterSpacing:"0.09em", textTransform:"uppercase" }}>
            pinch to zoom · drag to spin
          </p>
        </div>
      )}
    </div>
  );
});

export default MapboxMap;
