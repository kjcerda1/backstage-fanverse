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
      properties:{ city:"Paris",       fans:2000, intensity:0.17, level:"Active",          event:"General activity",      trending:false, color:"#9fe0c8" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[ 13.4050,  52.5200] },
      properties:{ city:"Berlin",      fans:1400, intensity:0.12, level:"Active",          event:"General activity",      trending:false, color:"#b8b8d8" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[126.9780,  37.5665] },
      properties:{ city:"Seoul",       fans:12000,intensity:1.00, level:"Extremely Active",event:"BTS comeback wave",     trending:true,  color:"#ffe0f5" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[139.6917,  35.6895] },
      properties:{ city:"Tokyo",       fans:8500, intensity:0.71, level:"Very Active",     event:"aespa Drama Tour",      trending:true,  color:"#ffd4ee" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[121.4737,  31.2304] },
      properties:{ city:"Shanghai",    fans:2900, intensity:0.24, level:"Active",          event:"General activity",      trending:false, color:"#f0a8cc" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[120.9842,  14.5995] },
      properties:{ city:"Manila",      fans:2200, intensity:0.18, level:"Active",          event:"General activity",      trending:false, color:"#9fe0c8" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[100.5018,  13.7563] },
      properties:{ city:"Bangkok",     fans:1800, intensity:0.15, level:"Active",          event:"General activity",      trending:false, color:"#ff9fa8" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[ 36.8219,  -1.2921] },
      properties:{ city:"Nairobi",     fans:800,  intensity:0.07, level:"Growing",         event:"General activity",      trending:false, color:"#f8d080" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-46.6333, -23.5505] },
      properties:{ city:"São Paulo",   fans:1100, intensity:0.09, level:"Active",          event:"General activity",      trending:false, color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[151.2093, -33.8688] },
      properties:{ city:"Sydney",      fans:900,  intensity:0.08, level:"Steady",          event:"General activity",      trending:false, color:"#9fe0c8" }},
  ],
};

// Empty shells — Supabase Realtime populates these at runtime
export const CONCERT_CHECKINS_GEOJSON = { type:"FeatureCollection", features:[] };
export const NEARBY_FANS_GEOJSON      = { type:"FeatureCollection", features:[] };
const EMPTY_FC                        = { type:"FeatureCollection", features:[] };

function curvedLineFeature(a, b, kind, label) {
  const [lng1, lat1] = a.geometry.coordinates;
  const [lng2, lat2] = b.geometry.coordinates;
  const steps = 36;
  const coordinates = [];
  const lift = Math.min(18, Math.max(6, Math.abs(lng2 - lng1) * 0.035 + Math.abs(lat2 - lat1) * 0.08));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng = lng1 + (lng2 - lng1) * t;
    const lat = lat1 + (lat2 - lat1) * t + Math.sin(Math.PI * t) * lift;
    coordinates.push([lng, Math.max(-82, Math.min(82, lat))]);
  }

  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: {
      kind,
      label,
      from: a.properties.city,
      to: b.properties.city,
    },
  };
}

export function buildFanverseArcGeoJSON(densityData = CITY_DENSITY_GEOJSON) {
  const features = densityData.features || [];
  const arcs = [];
  const eventGroups = {};

  features.forEach(f => {
    const event = f.properties.event;
    if (!event || event === "General activity") return;
    (eventGroups[event] = eventGroups[event] || []).push(f);
  });

  Object.entries(eventGroups).forEach(([event, group]) => {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) => b.properties.fans - a.properties.fans);
    for (let i = 0; i < sorted.length - 1; i++) {
      arcs.push(curvedLineFeature(sorted[i], sorted[i + 1], "tour", event));
    }
  });

  const hub = [...features].sort((a, b) => b.properties.fans - a.properties.fans)[0];
  if (hub) {
    [...features]
      .filter(f => f !== hub && f.properties.trending)
      .sort((a, b) => b.properties.fans - a.properties.fans)
      .slice(0, 3)
      .forEach(f => {
        const duplicate = arcs.some(arc =>
          (arc.properties.from === hub.properties.city && arc.properties.to === f.properties.city) ||
          (arc.properties.from === f.properties.city && arc.properties.to === hub.properties.city)
        );
        if (!duplicate) arcs.push(curvedLineFeature(hub, f, "flow", "Top fandom hub flow"));
      });
  }

  return { type:"FeatureCollection", features: arcs.slice(0, 5) };
}

// ─── Cosmic starfield — edge-zone pearls (x%, y%, size-px, anim-delay-s) ─────
// Positions are near the border (outside the 50% vignette transparent zone)
// so they live in the dark rim and never compete with map data.
const EDGE_STARS = [
  [4,8,1.5,0.0],[12,4,1.0,0.8],[88,5,1.5,0.3],[96,12,1.0,1.2],
  [2,28,1.0,1.8],[97,36,1.5,0.5],[3,58,1.5,1.1],[97,65,1.0,0.7],
  [6,90,1.5,1.6],[14,96,1.0,0.2],[86,94,1.5,0.9],[94,86,1.0,1.4],
  [28,3,1.0,0.6],[68,4,1.5,1.3],[26,95,1.0,1.9],[74,97,1.5,0.4],
  [1,50,1.5,1.7],[99,52,1.0,0.3],[50,1,2.0,1.0],[52,98,1.0,0.8],
  [18,8,1.0,1.3],[82,6,1.5,0.6],[16,88,1.0,0.9],[84,92,1.5,1.5],
];
const STAR_PALETTE = [
  "rgba(240,215,255,0.90)",  // pearl white-lavender
  "rgba(240,168,204,0.85)",  // sakura pink
  "rgba(142,239,212,0.80)",  // teal lightstick
  "rgba(248,235,168,0.82)",  // moonlight gold
];

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

  // Attribution refinement — reduces visual competition while remaining
  // fully legible and compliant with Mapbox ToS (opacity ≥ 0.78, text readable).
  // Attribution text and logo remain visible; only brightness is softened.
  if (!document.getElementById("mapbox-attrib-style")) {
    const style = document.createElement("style");
    style.id = "mapbox-attrib-style";
    style.textContent = [
      // Dark-glass attribution — reduces visual brightness against dark map while
      // remaining legible and compliant with Mapbox ToS (opacity ≥ 0.72, text readable).
      ".mapboxgl-ctrl-attrib{font-size:8px!important;opacity:0.72;background:rgba(6,4,18,0.78)!important;border-radius:8px!important}",
      ".mapboxgl-ctrl-attrib a{color:rgba(200,185,255,0.80)!important;text-decoration:none}",
      ".mapboxgl-ctrl-logo{opacity:0.68}",
    ].join("");
    document.head.appendChild(style);
  }
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
    // Clear land/water separation — land brighter purple, water near-black blue
    // NOTE: dark-v11's actual background-type layer is "land" (no layer is literally
    // named "background" in this style) — verified against the live style JSON.
    // Land must read clearly lighter than water — this is a readable map first.
    ["water",                    "fill-color",        "#0d0730"],   // deep midnight purple — still dark, not pure black
    ["land",                     "background-color",  "#2a1a5c"],   // clearly lighter violet — continents must pop
    ["landuse",                  "fill-color",        "#301f66"],
    ["national-park",            "fill-color",        "#2c1c5e"],
    // Crisp, visible country boundaries — gold-violet tint
    ["admin-0-boundary",         "line-color",        "rgba(224,202,255,0.75)"],
    ["admin-0-boundary",         "line-opacity",      0.90],
    ["admin-0-boundary",         "line-width",        1.0],
    ["admin-0-boundary-disputed","line-color",        "rgba(224,202,255,0.38)"],
    ["admin-0-boundary-disputed","line-opacity",      0.55],
    ["admin-1-boundary",         "line-color",        "rgba(224,202,255,0.20)"],
    ["admin-1-boundary",         "line-opacity",      0.50],
    // Subdued but legible labels — quiet, not dominant, not invisible
    ["country-label",            "text-color",        "rgba(220,208,255,0.68)"],
    ["country-label",            "text-halo-color",   "#080618"],
    ["country-label",            "text-opacity",      0.68],
    ["state-label",              "text-color",        "rgba(184,162,255,0.22)"],
    ["state-label",              "text-opacity",      0.24],
    ["settlement-major-label",   "text-color",        "rgba(200,185,255,0.40)"],
    ["settlement-major-label",   "text-halo-color",   "#080618"],
    ["settlement-major-label",   "text-opacity",      0.42],
    ["settlement-minor-label",   "text-color",        "rgba(184,162,255,0.20)"],
    ["settlement-minor-label",   "text-halo-color",   "#080618"],
    ["settlement-minor-label",   "text-opacity",      0.22],
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
    // Purposeful activity arcs — kept deliberately faint. These support the
    // city orbs; they must never read as "lines" before the eye finds the
    // glowing cities themselves. Capped in buildFanverseArcGeoJSON.
    { id:"fan-arcs-glow", type:"line", source:"fan-arcs",
      paint:{ "line-color":["case",["==",["get","kind"],"tour"],"#f0cc88","#c4b5fd"], "line-width":["case",["==",["get","kind"],"tour"],1.0,0.8], "line-opacity":0.14, "line-blur":1.4 }},
    { id:"fan-arcs-core", type:"line", source:"fan-arcs",
      paint:{ "line-color":["case",["==",["get","kind"],"tour"],"#f0cc88","#d8b4e8"], "line-width":["case",["==",["get","kind"],"tour"],0.4,0.3], "line-opacity":0.26 }},
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

    // ── City glow — 4 layered halos (reduced for clarity, not fog) ───────────
    // Wide atmospheric bloom — kept subtle, well below labels
    { id:"fan-glow-atmosphere", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,52,12000,165], "circle-color":["get","color"], "circle-opacity":0.05, "circle-blur":1.2 }},
    // Soft outer glow
    { id:"fan-glow-outer", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,36,12000,112], "circle-color":["get","color"], "circle-opacity":0.10, "circle-blur":0.95 }},
    // Mid glow
    { id:"fan-glow-mid", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,20,12000,60], "circle-color":["get","color"], "circle-opacity":0.20, "circle-blur":0.38 }},
    // Inner halo — tight, sharp aura ring
    { id:"fan-glow-inner", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,11,12000,30], "circle-color":["get","color"], "circle-opacity":0.42, "circle-blur":0.12 }},
    // Bright crisp core dot — slightly larger to compensate for tighter halos
    { id:"fan-core", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,7,12000,24], "circle-color":["get","color"], "circle-opacity":1.0, "circle-stroke-width":1.8, "circle-stroke-color":"rgba(235,218,255,0.72)" }},

    // ── Trending pulse ring (RAF-animated, goes below labels) ─────────────────
    { id:"fan-pulse", type:"circle", source:"fan-density",
      filter:["==",["get","trending"],true],
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,22,12000,74], "circle-color":["get","color"], "circle-opacity":0.22, "circle-blur":0.70 }},

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
      paint:{ "circle-radius":6, "circle-color":"#8fcdab", "circle-opacity":0.85, "circle-stroke-width":1, "circle-stroke-color":"rgba(255,255,255,0.3)" }},

    // ── Selected city — premium ring set, tuned ~25% down from a prior pass
    // that blew out into a "giant white flashlight." Keep a colored core,
    // a soft halo, and the map underneath still readable. ─────────────────
    { id:"sel-bloom", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,50,12000,135], "circle-color":["get","color"], "circle-opacity":0.05, "circle-blur":1.15 }},
    // Slow outermost ring
    { id:"sel-ring-outermost", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,40,12000,100], "circle-color":"rgba(0,0,0,0)", "circle-opacity":0, "circle-stroke-width":1, "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.16 }},
    { id:"sel-ring-outer", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,29,12000,80], "circle-color":"rgba(0,0,0,0)", "circle-opacity":0, "circle-stroke-width":1.3, "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.30 }},
    { id:"sel-ring-inner", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,19,12000,54], "circle-color":"rgba(0,0,0,0)", "circle-opacity":0, "circle-stroke-width":1.7, "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.52 }},
    { id:"sel-core", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,9,12000,21], "circle-color":["get","color"], "circle-opacity":0.92, "circle-stroke-width":2.2, "circle-stroke-color":"rgba(255,255,255,0.75)", "circle-stroke-opacity":1 }},
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
    let cancelled = false;

    loadMapboxGL().then(mapboxgl => {
      // Guards against the StrictMode dev double-invoke: if cleanup already
      // ran (or another instance already attached) before this promise
      // resolved, bail instead of creating a zombie map on a stale container.
      if (cancelled || !containerRef.current || mapRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      map = new mapboxgl.Map({
        container: containerRef.current,
        style:     "mapbox://styles/mapbox/dark-v11",
        center:    [55, 28],          // shows Seoul, Tokyo, Manila on right; Europe center; Americas left
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
        map.addSource("fan-arcs",         { type:"geojson", data: buildFanverseArcGeoJSON(densityData) });
        map.addSource("concert-checkins", { type:"geojson", data: CONCERT_CHECKINS_GEOJSON });
        map.addSource("nearby-fans",      { type:"geojson", data: NEARBY_FANS_GEOJSON });
        map.addSource("selected-city",    { type:"geojson", data: EMPTY_FC });

        // Insert haze/glow/pulse layers BELOW the base-map's own symbol layers
        // so country and continent labels show through. Core dots and our custom
        // fan-labels stay on top (no beforeId = appended above everything).
        const firstSymbolId = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
        const BELOW_LABELS = new Set(['fan-arcs-glow','fan-arcs-core','fan-heatmap','fan-glow-atmosphere','fan-glow-outer','fan-glow-mid','fan-glow-inner','fan-pulse']);
        buildLayers(showHeatmap).forEach(layer => {
          map.addLayer(layer, BELOW_LABELS.has(layer.id) && firstSymbolId ? firstSymbolId : undefined);
        });
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
              "interpolate",["linear"],["get","fans"], 800,22*pMult, 12000,74*pMult,
            ]);
            map.setPaintProperty("sel-ring-outermost", "circle-stroke-opacity", Math.max(0, 0.08 + s3 * 0.10));
            map.setPaintProperty("sel-ring-outermost", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,40*(1+s3*0.06), 12000,100*(1+s3*0.06),
            ]);
            map.setPaintProperty("sel-ring-outer", "circle-stroke-opacity", Math.max(0, 0.16 + s1 * 0.16));
            map.setPaintProperty("sel-ring-outer", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,29*(1+s1*0.10), 12000,80*(1+s1*0.10),
            ]);
            map.setPaintProperty("sel-ring-inner", "circle-stroke-opacity", Math.max(0, 0.32 + s2 * 0.20));
            map.setPaintProperty("sel-ring-inner", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,19*(1+s2*0.08), 12000,54*(1+s2*0.08),
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
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      else if (map) { map.remove(); }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live density data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    try {
      mapRef.current.getSource("fan-density")?.setData(densityData);
      mapRef.current.getSource("fan-arcs")?.setData(buildFanverseArcGeoJSON(densityData));
    } catch (_) {}
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
        mapRef.current.setPaintProperty("fan-core",            "circle-opacity", ["case", notSel, 0.18, 1.0]);
        mapRef.current.setPaintProperty("fan-glow-atmosphere", "circle-opacity", ["case", notSel, 0.01, 0.07]);
        mapRef.current.setPaintProperty("fan-glow-outer",      "circle-opacity", ["case", notSel, 0.01, 0.12]);
        mapRef.current.setPaintProperty("fan-glow-mid",        "circle-opacity", ["case", notSel, 0.02, 0.22]);
        mapRef.current.setPaintProperty("fan-glow-inner",      "circle-opacity", ["case", notSel, 0.03, 0.46]);
        mapRef.current.setPaintProperty("fan-labels",          "text-opacity",   ["case", notSel, 0.10, 1.0]);
        // Even "emphasized" arcs stay thin filaments, not bands — they support
        // the selected city, they never compete with it.
        const connectedArc = ["any", ["==", ["get","from"], city], ["==", ["get","to"], city]];
        mapRef.current.setPaintProperty("fan-arcs-glow", "line-opacity", ["case", connectedArc, 0.36, 0.06]);
        mapRef.current.setPaintProperty("fan-arcs-core", "line-opacity", ["case", connectedArc, 0.55, 0.10]);
        mapRef.current.setPaintProperty("fan-arcs-glow", "line-width", ["case", connectedArc, 1.5, 0.7]);
        mapRef.current.setPaintProperty("fan-arcs-core", "line-width", ["case", connectedArc, 0.5, 0.22]);
      } else {
        // Restore all layers to default values matching buildLayers()
        mapRef.current.setPaintProperty("fan-core",            "circle-opacity", 1.0);
        mapRef.current.setPaintProperty("fan-glow-atmosphere", "circle-opacity", 0.05);
        mapRef.current.setPaintProperty("fan-glow-outer",      "circle-opacity", 0.10);
        mapRef.current.setPaintProperty("fan-glow-mid",        "circle-opacity", 0.20);
        mapRef.current.setPaintProperty("fan-glow-inner",      "circle-opacity", 0.42);
        mapRef.current.setPaintProperty("fan-labels",          "text-opacity",   0.95);
        mapRef.current.setPaintProperty("fan-arcs-glow", "line-opacity", 0.14);
        mapRef.current.setPaintProperty("fan-arcs-core", "line-opacity", 0.26);
        mapRef.current.setPaintProperty("fan-arcs-glow", "line-width", ["case",["==",["get","kind"],"tour"],1.0,0.8]);
        mapRef.current.setPaintProperty("fan-arcs-core", "line-width", ["case",["==",["get","kind"],"tour"],0.4,0.3]);
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

        {/* Purposeful arcs: shared events and top-hub fandom flow only */}
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:1 }}>
          {buildFanverseArcGeoJSON({ type:"FeatureCollection", features: CITY_DENSITY_GEOJSON.features }).features.map((arc, i) => {
            const from = cityDots.find(c => c.city === arc.properties.from);
            const to = cityDots.find(c => c.city === arc.properties.to);
            if (!from || !to) return null;
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2 - 7;
            const d = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
            const connected = selName && (arc.properties.from === selName || arc.properties.to === selName);
            const dimmed = selName && !connected;
            const color = arc.properties.kind === "tour" ? "#f0cc88" : "#d8b4e8";
            // Barely-there filaments — they support the city orbs, never compete with them.
            return <g key={`${arc.properties.from}-${arc.properties.to}-${i}`} style={{ opacity: dimmed ? 0.08 : connected ? 0.55 : 0.22, transition:"opacity .25s" }}>
              <path d={d} stroke={color} strokeWidth={connected ? 0.40 : 0.26} fill="none" style={{ filter:"blur(0.5px)" }} />
              <path d={d} stroke={color} strokeWidth={connected ? 0.14 : 0.08} fill="none" />
            </g>;
          })}
        </svg>

        {/* City nodes */}
        {cityDots.map((city, i) => {
          const isSel  = city.city === selName;
          const hasSel = selName !== null;
          const scale  = Math.max(0.18, city.fans / 12000);
          const coreR  = isSel ? 13 : Math.max(4, 9 * scale);
          const bloomR = isSel ? 88 : (32 * scale + 14);
          const corOp  = isSel ? 0.92 : hasSel ? 0.20 : 0.88;
          const bloomOp= isSel ? 0.28 : hasSel ? 0.02 : scale * 0.18;

          return (
            <div key={city.city} onClick={() => onCityClick?.(city)} style={{ position:"absolute", left:`${city.x}%`, top:`${city.y}%`, transform:"translate(-50%,-50%)", transition:"all 0.42s cubic-bezier(.4,0,.2,1)", zIndex: isSel ? 20 : 1, cursor:onCityClick?"pointer":"default" }}>
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
              <div style={{ width:coreR, height:coreR, borderRadius:"50%", background:city.color, opacity:corOp, position:"relative", boxShadow:isSel?`0 0 20px ${city.color},0 0 7px ${city.color}`:`0 0 6px ${city.color}55`, transition:"all 0.42s ease", border: isSel?"1.5px solid rgba(255,255,255,0.60)":"none" }} />
              {isSel && (
                <div style={{ position:"absolute", top:"calc(100% + 10px)", left:"50%", transform:"translateX(-50%)", pointerEvents:"none", animation:"up .3s ease", textAlign:"center", whiteSpace:"nowrap" }}>
                  <p style={{ fontSize:11, color:"white", fontFamily:"'Epilogue',sans-serif", fontWeight:800, letterSpacing:"0.02em", textShadow:`0 0 16px ${city.color},0 0 8px ${city.color}` }}>{city.city}</p>
                  <p style={{ fontSize:8.5, color:city.color, fontFamily:"'Instrument Sans',sans-serif", fontWeight:600, marginTop:2, opacity:0.85 }}>{city.fans >= 1000 ? `${(city.fans/1000).toFixed(1)}K fans` : city.fans}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Edge vignette — dimensional but keeps the city-dot field readable */}
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 80% 80% at 50% 46%,transparent 58%,rgba(5,4,16,0.42) 82%,rgba(3,2,12,0.70) 100%)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 48% 36% at 80% 8%, rgba(196,181,253,0.10), transparent 60%)", pointerEvents:"none" }} />
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

      {/* Globe depth vignette — darkens edges for dimension, but keeps the
          center two-thirds of the map fully legible (this is a tool, not a poster). */}
      <div style={{
        position:      "absolute",
        inset:         0,
        borderRadius:  "inherit",
        pointerEvents: "none",
        background:    "radial-gradient(ellipse 78% 78% at 50% 46%, transparent 58%, rgba(5,3,16,0.40) 82%, rgba(3,2,14,0.68) 100%)",
        zIndex:        1,
      }} />

      {/* Purple horizon glow — subtle top-right atmosphere accent, kept light
          so it reads as dimension, not as a colored overlay covering geography. */}
      <div style={{
        position:      "absolute",
        inset:         0,
        borderRadius:  "inherit",
        pointerEvents: "none",
        background:    "radial-gradient(ellipse 50% 36% at 80% 8%, rgba(196,181,253,0.12), transparent 60%)",
        zIndex:        1,
      }} />

      {/* Iridescent aurora — lavender/pink/teal/gold blobs confined to the dark
          edge zone only, so they never wash out the land/water itself. */}
      <div style={{
        position:      "absolute",
        inset:         0,
        borderRadius:  "inherit",
        pointerEvents: "none",
        background:    [
          "radial-gradient(ellipse 42% 32% at 6% 10%, rgba(184,162,255,0.09), transparent 70%)",
          "radial-gradient(ellipse 40% 30% at 95% 12%, rgba(240,168,204,0.08), transparent 66%)",
          "radial-gradient(ellipse 42% 32% at 93% 90%, rgba(142,239,212,0.05), transparent 72%)",
          "radial-gradient(ellipse 38% 28% at 5% 92%, rgba(248,215,128,0.06), transparent 68%)",
        ].join(","),
        animation:     "ambientGlow 16s ease-in-out infinite",
        zIndex:        2,
      }} />

      {/* Iridescent rim light — inset box-shadow halo (no added blur/fog) */}
      <div style={{
        position:      "absolute",
        inset:         0,
        borderRadius:  "inherit",
        pointerEvents: "none",
        boxShadow:     [
          "inset 0 0 55px rgba(184,162,255,0.10)",
          "inset 0 0 28px rgba(240,168,204,0.06)",
          "inset 0 0 18px rgba(142,239,212,0.04)",
          "inset 0 0 60px rgba(3,2,12,0.32)",
        ].join(", "),
        zIndex:        2,
      }} />

      {/* Cosmic starfield — tiny pearls in the dark vignette rim.
          starTwinkle oscillates between 0.12–0.22 opacity — refined, not cheesy. */}
      {EDGE_STARS.map(([x, y, s, d], i) => (
        <div key={i} style={{
          position:       "absolute",
          left:           `${x}%`,
          top:            `${y}%`,
          width:          s,
          height:         s,
          borderRadius:   "50%",
          background:     STAR_PALETTE[i % 4],
          boxShadow:      `0 0 ${s * 2.5}px ${STAR_PALETTE[i % 4]}`,
          pointerEvents:  "none",
          animation:      `starTwinkle ${2.0 + d}s ease-in-out infinite`,
          animationDelay: `${d}s`,
          zIndex:         2,
        }} />
      ))}

      {/* Diagonal glass sheen — top-left pearl reflection (liquid glass technique).
          Covers top 40% only; gradient fades to transparent so map is unobstructed. */}
      <div style={{
        position:      "absolute",
        top:           0,
        left:          0,
        right:         0,
        height:        "40%",
        borderRadius:  "inherit",
        pointerEvents: "none",
        background:    "linear-gradient(138deg, rgba(255,255,255,0.038) 0%, rgba(255,255,255,0.016) 38%, transparent 62%)",
        animation:     "shimmer 9s ease-in-out infinite",
        zIndex:        3,
      }} />

      {/* Top pearl edge highlight — the glass rim light.
          Single-pixel line at top, fades through lavender/pink/white. */}
      <div style={{
        position:      "absolute",
        top:           0,
        left:          "6%",
        right:         "6%",
        height:        "1px",
        pointerEvents: "none",
        background:    "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), rgba(200,185,255,0.36), rgba(255,220,238,0.26), rgba(142,239,212,0.16), rgba(255,255,255,0.10), transparent)",
        zIndex:        3,
      }} />

      {/* Left pearl edge — glass catching light on the left rim */}
      <div style={{
        position:      "absolute",
        top:           "6%",
        left:          0,
        width:         "1.5px",
        height:        "32%",
        pointerEvents: "none",
        background:    "linear-gradient(180deg, transparent, rgba(200,185,255,0.30), rgba(255,220,238,0.18), transparent)",
        zIndex:        3,
      }} />

      {/* Bottom depth shadow — glass underside, adds dimensional depth */}
      <div style={{
        position:      "absolute",
        bottom:        0,
        left:          0,
        right:         0,
        height:        "11%",
        borderRadius:  "inherit",
        pointerEvents: "none",
        background:    "linear-gradient(0deg, rgba(3,2,12,0.40) 0%, transparent 100%)",
        zIndex:        3,
      }} />

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
