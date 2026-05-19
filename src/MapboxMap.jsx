import { useEffect, useRef, useState } from "react";
// Use namespace import so this works whether Vite pre-bundles mapbox-gl (optimizeDeps.include)
// or loads it raw (optimizeDeps.exclude). The `?? mapboxglModule` fallback handles the case
// where the raw file has no default export but does have named exports (Map, AttributionControl…).
import * as mapboxglModule from "mapbox-gl";
const mapboxgl = mapboxglModule.default ?? mapboxglModule;

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// ─── GeoJSON seed data ────────────────────────────────────────────────────────
// Plug Supabase Realtime into the `densityData` prop to go live.
// Shape must stay FeatureCollection<Point> with these properties so all
// Mapbox layer expressions continue to work unchanged.
export const CITY_DENSITY_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type:"Feature", geometry:{ type:"Point", coordinates:[-118.2437, 34.0522] },
      properties:{ city:"Los Angeles", fans:3800, intensity:0.32, level:"Spiking",        event:"aespa Drama Tour",     trending:true,  color:"#ffc8ec" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-96.7970,  32.7767] },
      properties:{ city:"Dallas",      fans:1200, intensity:0.10, level:"Very Active",    event:"BTS · Apr 30",          trending:false, color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-87.6298,  41.8781] },
      properties:{ city:"Chicago",     fans:950,  intensity:0.08, level:"Rising",         event:"Stray Kids · May 14",   trending:true,  color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-74.0059,  40.7128] },
      properties:{ city:"New York",    fans:4200, intensity:0.35, level:"Very Active",    event:"NewJeans · MSG Jun 18", trending:true,  color:"#a5d8ff" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[ -0.1278,  51.5074] },
      properties:{ city:"London",      fans:3100, intensity:0.26, level:"Active",         event:"Stray Kids EU leg",     trending:false, color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[  2.3522,  48.8566] },
      properties:{ city:"Paris",       fans:2000, intensity:0.17, level:"Active",         event:"General activity",      trending:false, color:"#80ffdf" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[ 13.4050,  52.5200] },
      properties:{ city:"Berlin",      fans:1400, intensity:0.12, level:"Active",         event:"General activity",      trending:false, color:"#b8b8d8" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[126.9780,  37.5665] },
      properties:{ city:"Seoul",       fans:12000,intensity:1.00, level:"Extremely Active",event:"BTS comeback wave",    trending:true,  color:"#ffe0f5" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[139.6917,  35.6895] },
      properties:{ city:"Tokyo",       fans:8500, intensity:0.71, level:"Very Active",    event:"aespa Drama Tour",      trending:true,  color:"#ffd4ee" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[121.4737,  31.2304] },
      properties:{ city:"Shanghai",    fans:2900, intensity:0.24, level:"Active",         event:"General activity",      trending:false, color:"#f0a8cc" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[120.9842,  14.5995] },
      properties:{ city:"Manila",      fans:2200, intensity:0.18, level:"Active",         event:"General activity",      trending:false, color:"#80ffdf" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[100.5018,  13.7563] },
      properties:{ city:"Bangkok",     fans:1800, intensity:0.15, level:"Active",         event:"General activity",      trending:false, color:"#ff9fa8" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[ 36.8219,  -1.2921] },
      properties:{ city:"Nairobi",     fans:800,  intensity:0.07, level:"Growing",        event:"General activity",      trending:false, color:"#f8d080" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[-46.6333, -23.5505] },
      properties:{ city:"São Paulo",   fans:1100, intensity:0.09, level:"Active",         event:"General activity",      trending:false, color:"#c4b5fd" }},
    { type:"Feature", geometry:{ type:"Point", coordinates:[151.2093, -33.8688] },
      properties:{ city:"Sydney",      fans:900,  intensity:0.08, level:"Steady",         event:"General activity",      trending:false, color:"#80ffdf" }},
  ],
};

// Empty shells — Supabase Realtime populates these at runtime
export const CONCERT_CHECKINS_GEOJSON = { type:"FeatureCollection", features:[] };
export const NEARBY_FANS_GEOJSON      = { type:"FeatureCollection", features:[] };

// ─── CSS injection (once, idempotent) ────────────────────────────────────────
function injectMapboxCSS() {
  if (document.getElementById("mapbox-gl-css")) return;
  const link = document.createElement("link");
  link.id   = "mapbox-gl-css";
  link.rel  = "stylesheet";
  link.href = "https://api.mapbox.com/mapbox-gl-js/v3.23.1/mapbox-gl.css";
  document.head.appendChild(link);
}

// ─── Cosmic style overrides applied after the base style loads ───────────────
function applyCosmicStyle(map) {
  const layers = map.getStyle().layers;

  const paintOverrides = [
    ["background",             "background-color",  "#080620"],
    ["water",                  "fill-color",        "#0e0c38"],
    ["land",                   "background-color",  "#18144a"],
    ["landuse",                "fill-color",        "#161240"],
    ["landuse-shadow",         "fill-color",        "#141040"],
    ["national-park",          "fill-color",        "#1a1650"],
    ["admin-state-province",   "line-color",        "#4a3a9a"],
    ["admin-state-province",   "line-opacity",      0.7],
    ["country-label",          "text-color",        "#c4b5fd"],
    ["state-label",            "text-color",        "#9080cc"],
    ["settlement-major-label", "text-color",        "#e8e0ff"],
    ["settlement-major-label", "text-halo-color",   "#0a0820"],
    ["settlement-major-label", "text-halo-width",   1.2],
    ["settlement-minor-label", "text-color",        "#a090d8"],
    ["settlement-minor-label", "text-halo-color",   "#0a0820"],
    ["water-shadow",           "fill-color",        "#070520"],
    ["waterway",               "line-color",        "#1a1650"],
    ["ocean-label",            "text-color",        "#6050a8"],
    ["ocean-label",            "text-halo-color",   "#080620"],
  ];

  paintOverrides.forEach(([id, prop, value]) => {
    try { map.setPaintProperty(id, prop, value); } catch (_) {}
  });

  // Also try to brighten admin country borders for the illuminated-outline look
  layers
    .filter(l => l.id.includes("admin-country") || l.id.includes("admin-1"))
    .forEach(l => {
      try {
        map.setPaintProperty(l.id, "line-color", "#6050c0");
        map.setPaintProperty(l.id, "line-opacity", 0.6);
      } catch (_) {}
    });

  const noisePatterns = ["road","street","path","tunnel","bridge","aeroway","transit","building","parking","pitch","gate"];
  layers
    .filter(l => noisePatterns.some(p => l.id.includes(p)))
    .forEach(l => {
      try { map.setLayoutProperty(l.id, "visibility", "none"); } catch (_) {}
    });
}

// ─── Layer definitions ────────────────────────────────────────────────────────
// These are plain data — no React, no side effects. Swap source later.
function buildLayers(showHeatmap) {
  return [
    // Heatmap (active only when showHeatmap=true so World/Heatmap tabs share one map)
    {
      id: "fan-heatmap",
      type: "heatmap",
      source: "fan-density",
      maxzoom: 6,
      paint: {
        "heatmap-weight":     ["interpolate",["linear"],["get","intensity"], 0,0, 1,1],
        "heatmap-intensity":  ["interpolate",["linear"],["zoom"], 0,1, 6,3],
        "heatmap-color": [
          "interpolate",["linear"],["heatmap-density"],
          0,   "rgba(6,6,15,0)",
          0.2, "rgba(90,40,160,0.5)",
          0.5, "rgba(184,162,255,0.7)",
          0.8, "rgba(240,168,204,0.9)",
          1,   "rgba(255,80,140,1)",
        ],
        "heatmap-radius":  ["interpolate",["linear"],["zoom"], 0,20, 6,80],
        "heatmap-opacity": showHeatmap ? 0.85 : 0,
      },
    },

    // Outermost atmospheric halo — huge, barely visible
    {
      id: "fan-glow-outer",
      type: "circle",
      source: "fan-density",
      paint: {
        "circle-radius":  ["interpolate",["linear"],["get","fans"], 800,55, 12000,190],
        "circle-color":   ["get","color"],
        "circle-opacity": 0.06,
        "circle-blur":    2.0,
      },
    },

    // Mid atmospheric glow
    {
      id: "fan-glow-mid",
      type: "circle",
      source: "fan-density",
      paint: {
        "circle-radius":  ["interpolate",["linear"],["get","fans"], 800,26, 12000,90],
        "circle-color":   ["get","color"],
        "circle-opacity": 0.18,
        "circle-blur":    1.1,
      },
    },

    // Inner soft glow halo
    {
      id: "fan-glow-inner",
      type: "circle",
      source: "fan-density",
      paint: {
        "circle-radius":  ["interpolate",["linear"],["get","fans"], 800,14, 12000,48],
        "circle-color":   ["get","color"],
        "circle-opacity": 0.30,
        "circle-blur":    0.6,
      },
    },

    // Solid bright core dot
    {
      id: "fan-core",
      type: "circle",
      source: "fan-density",
      paint: {
        "circle-radius":        ["interpolate",["linear"],["get","fans"], 800,6, 12000,22],
        "circle-color":         ["get","color"],
        "circle-opacity":       1.0,
        "circle-stroke-width":  2,
        "circle-stroke-color":  "rgba(255,255,255,0.55)",
      },
    },

    // Animated pulse ring — only for trending cities (driven by RAF)
    {
      id: "fan-pulse",
      type: "circle",
      source: "fan-density",
      filter: ["==",["get","trending"], true],
      paint: {
        "circle-radius":  ["interpolate",["linear"],["get","fans"], 800,30, 12000,100],
        "circle-color":   ["get","color"],
        "circle-opacity": 0.28,
        "circle-blur":    1.0,
      },
    },

    // City name + fan count labels (visible from zoom 2+)
    {
      id: "fan-labels",
      type: "symbol",
      source: "fan-density",
      minzoom: 2,
      layout: {
        "text-field": ["concat",
          ["get","city"], "\n",
          ["case",
            [">=",["get","fans"],1000],
            ["concat",["to-string",["round",["/",["get","fans"],1000]]],"K"],
            ["to-string",["get","fans"]],
          ],
        ],
        "text-font":          ["DIN Offc Pro Bold","Arial Unicode MS Bold"],
        "text-size":          ["interpolate",["linear"],["get","fans"], 800,9, 12000,13],
        "text-offset":        [0, 1.8],
        "text-anchor":        "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color":       ["get","color"],
        "text-halo-color":  "#0a0820",
        "text-halo-width":  1.5,
        "text-opacity":     0.9,
      },
    },

    // Future: concert check-in markers (source populated by Supabase Realtime)
    {
      id: "concert-checkins",
      type: "circle",
      source: "concert-checkins",
      paint: {
        "circle-radius":  8,
        "circle-color":   "#f0cc88",
        "circle-opacity": 0.8,
        "circle-blur":    0.2,
      },
    },

    // Future: nearby fans (source populated when proximity is on + Supabase query)
    {
      id: "nearby-fans",
      type: "circle",
      source: "nearby-fans",
      paint: {
        "circle-radius":       6,
        "circle-color":        "#64c88c",
        "circle-opacity":      0.85,
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(255,255,255,0.3)",
      },
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MapboxMap({
  densityData  = CITY_DENSITY_GEOJSON,  // swap with Supabase realtime feed
  showHeatmap  = false,                  // toggle between World and Heatmap visualisation
  onCityClick  = null,
}) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const rafRef       = useRef(null);
  const phaseRef     = useRef(0);
  const readyRef     = useRef(false);  // true once all layers are added
  const [mapError, setMapError] = useState(null);

  // ── Init map (once) ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN || mapRef.current) return;

    injectMapboxCSS();
    let map;

    try {
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map = new mapboxgl.Map({
      container:          containerRef.current,
      style:              "mapbox://styles/mapbox/dark-v11",
      center:             [10, 42],
      zoom:               1.7,
      minZoom:            1,
      maxZoom:            8,
      attributionControl: false,
      logoPosition:       "bottom-right",
      fadeDuration:       300,
      dragRotate:         false,
      touchZoomRotate:    false,
    });

    mapRef.current = map;

    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    map.on("load", () => {
      applyCosmicStyle(map);

      map.addSource("fan-density",      { type:"geojson", data: densityData });
      map.addSource("concert-checkins", { type:"geojson", data: CONCERT_CHECKINS_GEOJSON });
      map.addSource("nearby-fans",      { type:"geojson", data: NEARBY_FANS_GEOJSON });

      buildLayers(showHeatmap).forEach(layer => map.addLayer(layer));

      readyRef.current = true;

      const animate = () => {
        if (!mapRef.current) return;
        phaseRef.current = (phaseRef.current + 0.025) % (Math.PI * 2);
        const sin        = Math.sin(phaseRef.current);
        const opacity    = 0.08 + sin * 0.14;
        const radiusMult = 1  + sin * 0.18;

        try {
          map.setPaintProperty("fan-pulse", "circle-opacity", Math.max(0, opacity));
          map.setPaintProperty("fan-pulse", "circle-radius", [
            "interpolate",["linear"],["get","fans"],
            800,  22 * radiusMult,
            12000,75 * radiusMult,
          ]);
        } catch (_) {
          return;
        }
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);

      map.on("click", "fan-core", e => {
        if (!e.features?.length || !onCityClick) return;
        onCityClick(e.features[0].properties);
      });
      map.on("mouseenter", "fan-core", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "fan-core", () => { map.getCanvas().style.cursor = ""; });
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    } catch (err) {
      console.error("[MapboxMap] init failed:", err.message);
      setMapError(err.message);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live data update — this is the Supabase Realtime hook point ────────────
  // When `densityData` changes (e.g. from a Supabase subscription callback),
  // we call setData() on the existing source — no map reinit needed.
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    try {
      mapRef.current.getSource("fan-density")?.setData(densityData);
    } catch (_) {}
  }, [densityData]);

  // ── Toggle heatmap layer opacity ──────────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    try {
      mapRef.current.setPaintProperty(
        "fan-heatmap", "heatmap-opacity", showHeatmap ? 0.85 : 0
      );
    } catch (_) {}
  }, [showHeatmap]);

  // ── Map init error fallback (import or GL context failure) ──────────────────
  if (mapError) {
    return (
      <div style={{
        width:"100%", height:"100%",
        background:"linear-gradient(160deg,#0d0b28,#1a1345,#2b1e52)",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        gap:8,
      }}>
        <p style={{ fontSize:28 }}>🗺️</p>
        <p style={{ fontSize:12, color:"rgba(184,162,255,0.55)", fontFamily:"'Epilogue',sans-serif", fontWeight:700 }}>
          Map unavailable
        </p>
        <p style={{ fontSize:10, color:"rgba(184,162,255,0.3)", textAlign:"center", maxWidth:180 }}>
          {mapError}
        </p>
      </div>
    );
  }

  // ── No-token fallback ─────────────────────────────────────────────────────
  if (!MAPBOX_TOKEN) {
    return (
      <div style={{
        width:"100%", height:"100%",
        background:"linear-gradient(160deg,#0d0b28,#1a1345,#2b1e52)",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        gap:8,
      }}>
        <p style={{ fontSize:28 }}>🗺️</p>
        <p style={{ fontSize:12, color:"rgba(184,162,255,0.55)", fontFamily:"'Epilogue',sans-serif", fontWeight:700 }}>
          Map unavailable
        </p>
        <p style={{ fontSize:10, color:"rgba(184,162,255,0.3)" }}>
          Add VITE_MAPBOX_TOKEN to .env
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width:"100%", height:"100%", borderRadius:"inherit" }}
    />
  );
}
