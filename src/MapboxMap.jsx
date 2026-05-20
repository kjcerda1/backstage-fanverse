import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

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

// ─── Cosmic style — deep space dark map ──────────────────────────────────────
function applyCosmicStyle(map) {
  const layers = map.getStyle().layers;

  const paintOverrides = [
    ["background",               "background-color",  "#06060f"],
    ["water",                    "fill-color",        "#070711"],
    ["land",                     "background-color",  "#111126"],
    ["landuse",                  "fill-color",        "#0f0e28"],
    ["landuse-shadow",           "fill-color",        "#0f0e28"],
    ["national-park",            "fill-color",        "#0e0c24"],
    ["admin-0-boundary",         "line-color",        "rgba(184,162,255,0.28)"],
    ["admin-0-boundary",         "line-opacity",      0.55],
    ["admin-0-boundary",         "line-width",        0.6],
    ["admin-0-boundary-disputed","line-color",        "rgba(184,162,255,0.15)"],
    ["admin-0-boundary-disputed","line-opacity",      0.3],
    ["admin-1-boundary",         "line-color",        "rgba(184,162,255,0.08)"],
    ["admin-1-boundary",         "line-opacity",      0.35],
    ["admin-state-province",     "line-color",        "rgba(184,162,255,0.08)"],
    ["admin-state-province",     "line-opacity",      0.35],
    ["country-label",            "text-color",        "rgba(184,162,255,0.35)"],
    ["country-label",            "text-halo-color",   "#06060f"],
    ["country-label",            "text-opacity",      0.4],
    ["state-label",              "text-color",        "rgba(184,162,255,0.15)"],
    ["state-label",              "text-opacity",      0.2],
    ["settlement-major-label",   "text-color",        "rgba(184,162,255,0.22)"],
    ["settlement-major-label",   "text-halo-color",   "#06060f"],
    ["settlement-major-label",   "text-opacity",      0.28],
    ["settlement-minor-label",   "text-color",        "rgba(184,162,255,0.12)"],
    ["settlement-minor-label",   "text-halo-color",   "#06060f"],
    ["settlement-minor-label",   "text-opacity",      0.15],
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
    // Heatmap
    {
      id: "fan-heatmap", type: "heatmap", source: "fan-density", maxzoom: 6,
      paint: {
        "heatmap-weight":    ["interpolate",["linear"],["get","intensity"], 0,0, 1,1],
        "heatmap-intensity": ["interpolate",["linear"],["zoom"], 0,1, 6,3],
        "heatmap-color": [
          "interpolate",["linear"],["heatmap-density"],
          0,"rgba(6,6,15,0)", 0.2,"rgba(90,40,160,0.5)", 0.5,"rgba(184,162,255,0.7)",
          0.8,"rgba(240,168,204,0.9)", 1,"rgba(255,80,140,1)",
        ],
        "heatmap-radius":  ["interpolate",["linear"],["zoom"], 0,20, 6,80],
        "heatmap-opacity": showHeatmap ? 0.85 : 0,
      },
    },

    // City glows + core
    { id:"fan-glow-outer", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,32,12000,100], "circle-color":["get","color"], "circle-opacity":0.05, "circle-blur":1.4 }},
    { id:"fan-glow-mid", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,15,12000,52], "circle-color":["get","color"], "circle-opacity":0.14, "circle-blur":0.7 }},
    { id:"fan-core", type:"circle", source:"fan-density",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,5,12000,20], "circle-color":["get","color"], "circle-opacity":0.9, "circle-stroke-width":1.5, "circle-stroke-color":"rgba(255,255,255,0.25)" }},

    // Trending pulse (RAF-animated)
    { id:"fan-pulse", type:"circle", source:"fan-density",
      filter:["==",["get","trending"],true],
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,22,12000,75], "circle-color":["get","color"], "circle-opacity":0.25, "circle-blur":0.9 }},

    // Labels
    { id:"fan-labels", type:"symbol", source:"fan-density", minzoom:2,
      layout:{
        "text-field":["concat",["get","city"],"\n",["case",[">=",["get","fans"],1000],["concat",["to-string",["round",["/",["get","fans"],1000]]],"K"],["to-string",["get","fans"]]]],
        "text-font":["DIN Offc Pro Bold","Arial Unicode MS Bold"],
        "text-size":["interpolate",["linear"],["get","fans"],800,9,12000,13],
        "text-offset":[0,1.8], "text-anchor":"top", "text-allow-overlap":false,
      },
      paint:{ "text-color":["get","color"], "text-halo-color":"#06060f", "text-halo-width":1.5, "text-opacity":0.9 },
    },

    // Future layers (Supabase Realtime)
    { id:"concert-checkins", type:"circle", source:"concert-checkins",
      paint:{ "circle-radius":8, "circle-color":"#f0cc88", "circle-opacity":0.8, "circle-blur":0.2 }},
    { id:"nearby-fans", type:"circle", source:"nearby-fans",
      paint:{ "circle-radius":6, "circle-color":"#64c88c", "circle-opacity":0.85, "circle-stroke-width":1, "circle-stroke-color":"rgba(255,255,255,0.3)" }},

    // Selected city emphasis (empty source until a city is tapped)
    { id:"sel-bloom", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,56,12000,160], "circle-color":["get","color"], "circle-opacity":0.07, "circle-blur":1.2 }},
    { id:"sel-ring-outer", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,40,12000,115], "circle-color":"rgba(0,0,0,0)", "circle-opacity":0, "circle-stroke-width":1.5, "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.35 }},
    { id:"sel-ring-inner", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,27,12000,76], "circle-color":"rgba(0,0,0,0)", "circle-opacity":0, "circle-stroke-width":2, "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.6 }},
    { id:"sel-core", type:"circle", source:"selected-city",
      paint:{ "circle-radius":["interpolate",["linear"],["get","fans"],800,10,12000,26], "circle-color":"#ffffff", "circle-opacity":0.95, "circle-stroke-width":3, "circle-stroke-color":["get","color"], "circle-stroke-opacity":1 }},
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

  useImperativeHandle(ref, () => ({
    flyTo(lng, lat, zoom = 4.5) {
      if (!mapRef.current || !readyRef.current) return;
      mapRef.current.flyTo({ center:[lng,lat], zoom, speed:0.8, curve:1.4, essential:true });
    },
  }), []);

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
        zoom:      1.5,
        minZoom:   1,
        maxZoom:   8,
        attributionControl: false,
        logoPosition: "bottom-right",
        fadeDuration: 300,
        dragRotate:   false,
        touchZoomRotate: false,
      });

      mapRef.current = map;
      map.addControl(new mapboxgl.AttributionControl({ compact:true }), "bottom-right");

      map.on("load", () => {
        applyCosmicStyle(map);

        map.addSource("fan-density",      { type:"geojson", data: densityData });
        map.addSource("concert-checkins", { type:"geojson", data: CONCERT_CHECKINS_GEOJSON });
        map.addSource("nearby-fans",      { type:"geojson", data: NEARBY_FANS_GEOJSON });
        map.addSource("selected-city",    { type:"geojson", data: EMPTY_FC });

        buildLayers(showHeatmap).forEach(layer => map.addLayer(layer));
        readyRef.current = true;

        // RAF animation loop
        const animate = () => {
          if (!mapRef.current) return;
          phaseRef.current = (phaseRef.current + 0.022) % (Math.PI * 2);
          const sin        = Math.sin(phaseRef.current);

          const pOpacity = 0.08 + sin * 0.14;
          const pMult    = 1 + sin * 0.18;
          const s1 = Math.sin(phaseRef.current * 0.65);
          const s2 = Math.sin(phaseRef.current * 1.15 + 1.9);

          try {
            map.setPaintProperty("fan-pulse", "circle-opacity", Math.max(0, pOpacity));
            map.setPaintProperty("fan-pulse", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,22*pMult, 12000,75*pMult,
            ]);
            map.setPaintProperty("sel-ring-outer", "circle-stroke-opacity", Math.max(0, 0.18 + s1 * 0.22));
            map.setPaintProperty("sel-ring-outer", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,40*(1+s1*0.14), 12000,115*(1+s1*0.14),
            ]);
            map.setPaintProperty("sel-ring-inner", "circle-stroke-opacity", Math.max(0, 0.38 + s2 * 0.28));
            map.setPaintProperty("sel-ring-inner", "circle-radius", [
              "interpolate",["linear"],["get","fans"], 800,27*(1+s2*0.1), 12000,76*(1+s2*0.1),
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
    try { mapRef.current.setPaintProperty("fan-heatmap", "heatmap-opacity", showHeatmap ? 0.85 : 0); } catch (_) {}
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
        mapRef.current.setPaintProperty("fan-core",       "circle-opacity", ["case", notSel, 0.28, 0.95]);
        mapRef.current.setPaintProperty("fan-glow-outer", "circle-opacity", ["case", notSel, 0.01, 0.08]);
        mapRef.current.setPaintProperty("fan-glow-mid",   "circle-opacity", ["case", notSel, 0.04, 0.18]);
        mapRef.current.setPaintProperty("fan-labels",     "text-opacity",   ["case", notSel, 0.18, 1.0]);
      } else {
        mapRef.current.setPaintProperty("fan-core",       "circle-opacity", 0.9);
        mapRef.current.setPaintProperty("fan-glow-outer", "circle-opacity", 0.05);
        mapRef.current.setPaintProperty("fan-glow-mid",   "circle-opacity", 0.14);
        mapRef.current.setPaintProperty("fan-labels",     "text-opacity",   0.9);
      }
    } catch (_) {}
  }, [selectedCityFeature]);

  // ── No-token fallback — cinematic interactive city visualization ──────────
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

  return <div ref={containerRef} style={{ width:"100%", height:"100%", borderRadius:"inherit" }} />;
});

export default MapboxMap;
