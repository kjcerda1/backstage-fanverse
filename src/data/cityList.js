// ─── CITY LIST — global-ready normalized location data ────────────────────────
// Each entry: city, region (full), region_code (short/empty), country (full),
//   country_code (ISO-2), continent, lat, lng, timezone (IANA)
// Used for: autocomplete, Fan Hubs, local discovery, future continent/country drill-down.
// NEVER store or expose exact GPS — city-level only.
export const CITY_LIST = [
  // ── North America › United States ───────────────────────────────────────────
  {city:"New York",       region:"New York",      region_code:"NY", country:"United States", country_code:"US", continent:"North America", lat:40.71,  lng:-74.01,  timezone:"America/New_York"},
  {city:"Los Angeles",    region:"California",    region_code:"CA", country:"United States", country_code:"US", continent:"North America", lat:34.05,  lng:-118.24, timezone:"America/Los_Angeles"},
  {city:"Chicago",        region:"Illinois",      region_code:"IL", country:"United States", country_code:"US", continent:"North America", lat:41.88,  lng:-87.63,  timezone:"America/Chicago"},
  {city:"Houston",        region:"Texas",         region_code:"TX", country:"United States", country_code:"US", continent:"North America", lat:29.76,  lng:-95.37,  timezone:"America/Chicago"},
  {city:"Dallas",         region:"Texas",         region_code:"TX", country:"United States", country_code:"US", continent:"North America", lat:32.78,  lng:-96.80,  timezone:"America/Chicago"},
  {city:"San Antonio",    region:"Texas",         region_code:"TX", country:"United States", country_code:"US", continent:"North America", lat:29.42,  lng:-98.49,  timezone:"America/Chicago"},
  {city:"Austin",         region:"Texas",         region_code:"TX", country:"United States", country_code:"US", continent:"North America", lat:30.27,  lng:-97.74,  timezone:"America/Chicago"},
  {city:"Atlanta",        region:"Georgia",       region_code:"GA", country:"United States", country_code:"US", continent:"North America", lat:33.75,  lng:-84.39,  timezone:"America/New_York"},
  {city:"Miami",          region:"Florida",       region_code:"FL", country:"United States", country_code:"US", continent:"North America", lat:25.77,  lng:-80.19,  timezone:"America/New_York"},
  {city:"Orlando",        region:"Florida",       region_code:"FL", country:"United States", country_code:"US", continent:"North America", lat:28.54,  lng:-81.38,  timezone:"America/New_York"},
  {city:"Tampa",          region:"Florida",       region_code:"FL", country:"United States", country_code:"US", continent:"North America", lat:27.95,  lng:-82.46,  timezone:"America/New_York"},
  {city:"Washington",     region:"District of Columbia", region_code:"DC", country:"United States", country_code:"US", continent:"North America", lat:38.91, lng:-77.04, timezone:"America/New_York"},
  {city:"Philadelphia",   region:"Pennsylvania",  region_code:"PA", country:"United States", country_code:"US", continent:"North America", lat:39.95,  lng:-75.17,  timezone:"America/New_York"},
  {city:"Boston",         region:"Massachusetts", region_code:"MA", country:"United States", country_code:"US", continent:"North America", lat:42.36,  lng:-71.06,  timezone:"America/New_York"},
  {city:"Seattle",        region:"Washington",    region_code:"WA", country:"United States", country_code:"US", continent:"North America", lat:47.61,  lng:-122.33, timezone:"America/Los_Angeles"},
  {city:"San Francisco",  region:"California",    region_code:"CA", country:"United States", country_code:"US", continent:"North America", lat:37.77,  lng:-122.42, timezone:"America/Los_Angeles"},
  {city:"San Jose",       region:"California",    region_code:"CA", country:"United States", country_code:"US", continent:"North America", lat:37.34,  lng:-121.89, timezone:"America/Los_Angeles"},
  {city:"San Diego",      region:"California",    region_code:"CA", country:"United States", country_code:"US", continent:"North America", lat:32.72,  lng:-117.16, timezone:"America/Los_Angeles"},
  {city:"Sacramento",     region:"California",    region_code:"CA", country:"United States", country_code:"US", continent:"North America", lat:38.58,  lng:-121.49, timezone:"America/Los_Angeles"},
  {city:"Las Vegas",      region:"Nevada",        region_code:"NV", country:"United States", country_code:"US", continent:"North America", lat:36.17,  lng:-115.14, timezone:"America/Los_Angeles"},
  {city:"Phoenix",        region:"Arizona",       region_code:"AZ", country:"United States", country_code:"US", continent:"North America", lat:33.45,  lng:-112.07, timezone:"America/Phoenix"},
  {city:"Tucson",         region:"Arizona",       region_code:"AZ", country:"United States", country_code:"US", continent:"North America", lat:32.22,  lng:-110.93, timezone:"America/Phoenix"},
  {city:"Denver",         region:"Colorado",      region_code:"CO", country:"United States", country_code:"US", continent:"North America", lat:39.74,  lng:-104.99, timezone:"America/Denver"},
  {city:"Salt Lake City", region:"Utah",          region_code:"UT", country:"United States", country_code:"US", continent:"North America", lat:40.76,  lng:-111.89, timezone:"America/Denver"},
  {city:"Portland",       region:"Oregon",        region_code:"OR", country:"United States", country_code:"US", continent:"North America", lat:45.52,  lng:-122.68, timezone:"America/Los_Angeles"},
  {city:"Minneapolis",    region:"Minnesota",     region_code:"MN", country:"United States", country_code:"US", continent:"North America", lat:44.98,  lng:-93.27,  timezone:"America/Chicago"},
  {city:"Kansas City",    region:"Missouri",      region_code:"MO", country:"United States", country_code:"US", continent:"North America", lat:39.10,  lng:-94.58,  timezone:"America/Chicago"},
  {city:"St. Louis",      region:"Missouri",      region_code:"MO", country:"United States", country_code:"US", continent:"North America", lat:38.63,  lng:-90.20,  timezone:"America/Chicago"},
  {city:"Nashville",      region:"Tennessee",     region_code:"TN", country:"United States", country_code:"US", continent:"North America", lat:36.17,  lng:-86.78,  timezone:"America/Chicago"},
  {city:"Memphis",        region:"Tennessee",     region_code:"TN", country:"United States", country_code:"US", continent:"North America", lat:35.15,  lng:-90.05,  timezone:"America/Chicago"},
  {city:"New Orleans",    region:"Louisiana",     region_code:"LA", country:"United States", country_code:"US", continent:"North America", lat:29.95,  lng:-90.07,  timezone:"America/Chicago"},
  {city:"Indianapolis",   region:"Indiana",       region_code:"IN", country:"United States", country_code:"US", continent:"North America", lat:39.77,  lng:-86.16,  timezone:"America/Indiana/Indianapolis"},
  {city:"Columbus",       region:"Ohio",          region_code:"OH", country:"United States", country_code:"US", continent:"North America", lat:39.96,  lng:-82.99,  timezone:"America/New_York"},
  {city:"Detroit",        region:"Michigan",      region_code:"MI", country:"United States", country_code:"US", continent:"North America", lat:42.33,  lng:-83.05,  timezone:"America/Detroit"},
  {city:"Pittsburgh",     region:"Pennsylvania",  region_code:"PA", country:"United States", country_code:"US", continent:"North America", lat:40.44,  lng:-79.99,  timezone:"America/New_York"},
  {city:"Baltimore",      region:"Maryland",      region_code:"MD", country:"United States", country_code:"US", continent:"North America", lat:39.29,  lng:-76.61,  timezone:"America/New_York"},
  {city:"Charlotte",      region:"North Carolina",region_code:"NC", country:"United States", country_code:"US", continent:"North America", lat:35.23,  lng:-80.84,  timezone:"America/New_York"},
  {city:"Raleigh",        region:"North Carolina",region_code:"NC", country:"United States", country_code:"US", continent:"North America", lat:35.78,  lng:-78.64,  timezone:"America/New_York"},
  {city:"Richmond",       region:"Virginia",      region_code:"VA", country:"United States", country_code:"US", continent:"North America", lat:37.54,  lng:-77.43,  timezone:"America/New_York"},
  {city:"Honolulu",       region:"Hawaii",        region_code:"HI", country:"United States", country_code:"US", continent:"North America", lat:21.31,  lng:-157.86, timezone:"Pacific/Honolulu"},
  // ── North America › Canada ───────────────────────────────────────────────────
  {city:"Toronto",        region:"Ontario",       region_code:"ON", country:"Canada",         country_code:"CA", continent:"North America", lat:43.65,  lng:-79.38,  timezone:"America/Toronto"},
  {city:"Vancouver",      region:"British Columbia", region_code:"BC", country:"Canada",      country_code:"CA", continent:"North America", lat:49.28,  lng:-123.12, timezone:"America/Vancouver"},
  {city:"Montreal",       region:"Quebec",        region_code:"QC", country:"Canada",         country_code:"CA", continent:"North America", lat:45.51,  lng:-73.56,  timezone:"America/Toronto"},
  // ── North America › Mexico ───────────────────────────────────────────────────
  {city:"Mexico City",    region:"",              region_code:"",   country:"Mexico",          country_code:"MX", continent:"North America", lat:19.43,  lng:-99.13,  timezone:"America/Mexico_City"},
  {city:"Monterrey",      region:"",              region_code:"",   country:"Mexico",          country_code:"MX", continent:"North America", lat:25.67,  lng:-100.31, timezone:"America/Monterrey"},
  {city:"Guadalajara",    region:"",              region_code:"",   country:"Mexico",          country_code:"MX", continent:"North America", lat:20.66,  lng:-103.35, timezone:"America/Mexico_City"},
  // ── Asia › South Korea ───────────────────────────────────────────────────────
  {city:"Seoul",          region:"",              region_code:"",   country:"South Korea",     country_code:"KR", continent:"Asia",          lat:37.57,  lng:126.98,  timezone:"Asia/Seoul"},
  {city:"Busan",          region:"",              region_code:"",   country:"South Korea",     country_code:"KR", continent:"Asia",          lat:35.18,  lng:129.08,  timezone:"Asia/Seoul"},
  {city:"Incheon",        region:"",              region_code:"",   country:"South Korea",     country_code:"KR", continent:"Asia",          lat:37.46,  lng:126.71,  timezone:"Asia/Seoul"},
  // ── Asia › Japan ─────────────────────────────────────────────────────────────
  {city:"Tokyo",          region:"",              region_code:"",   country:"Japan",           country_code:"JP", continent:"Asia",          lat:35.68,  lng:139.69,  timezone:"Asia/Tokyo"},
  {city:"Osaka",          region:"",              region_code:"",   country:"Japan",           country_code:"JP", continent:"Asia",          lat:34.69,  lng:135.50,  timezone:"Asia/Tokyo"},
  {city:"Yokohama",       region:"",              region_code:"",   country:"Japan",           country_code:"JP", continent:"Asia",          lat:35.44,  lng:139.64,  timezone:"Asia/Tokyo"},
  {city:"Nagoya",         region:"",              region_code:"",   country:"Japan",           country_code:"JP", continent:"Asia",          lat:35.18,  lng:136.91,  timezone:"Asia/Tokyo"},
  {city:"Fukuoka",        region:"",              region_code:"",   country:"Japan",           country_code:"JP", continent:"Asia",          lat:33.59,  lng:130.40,  timezone:"Asia/Tokyo"},
  // ── Asia › Southeast Asia ────────────────────────────────────────────────────
  {city:"Manila",         region:"",              region_code:"",   country:"Philippines",     country_code:"PH", continent:"Asia",          lat:14.60,  lng:120.98,  timezone:"Asia/Manila"},
  {city:"Bangkok",        region:"",              region_code:"",   country:"Thailand",        country_code:"TH", continent:"Asia",          lat:13.75,  lng:100.50,  timezone:"Asia/Bangkok"},
  {city:"Singapore",      region:"",              region_code:"",   country:"Singapore",       country_code:"SG", continent:"Asia",          lat:1.35,   lng:103.82,  timezone:"Asia/Singapore"},
  {city:"Jakarta",        region:"",              region_code:"",   country:"Indonesia",       country_code:"ID", continent:"Asia",          lat:-6.21,  lng:106.85,  timezone:"Asia/Jakarta"},
  {city:"Taipei",         region:"",              region_code:"",   country:"Taiwan",          country_code:"TW", continent:"Asia",          lat:25.05,  lng:121.53,  timezone:"Asia/Taipei"},
  {city:"Hong Kong",      region:"",              region_code:"",   country:"Hong Kong",       country_code:"HK", continent:"Asia",          lat:22.32,  lng:114.17,  timezone:"Asia/Hong_Kong"},
  // ── Europe ────────────────────────────────────────────────────────────────────
  {city:"London",         region:"",              region_code:"",   country:"United Kingdom",  country_code:"GB", continent:"Europe",        lat:51.51,  lng:-0.13,   timezone:"Europe/London"},
  {city:"Paris",          region:"",              region_code:"",   country:"France",          country_code:"FR", continent:"Europe",        lat:48.86,  lng:2.35,    timezone:"Europe/Paris"},
  {city:"Berlin",         region:"",              region_code:"",   country:"Germany",         country_code:"DE", continent:"Europe",        lat:52.52,  lng:13.41,   timezone:"Europe/Berlin"},
  {city:"Madrid",         region:"",              region_code:"",   country:"Spain",           country_code:"ES", continent:"Europe",        lat:40.42,  lng:-3.70,   timezone:"Europe/Madrid"},
  {city:"Amsterdam",      region:"",              region_code:"",   country:"Netherlands",     country_code:"NL", continent:"Europe",        lat:52.37,  lng:4.90,    timezone:"Europe/Amsterdam"},
  {city:"Milan",          region:"",              region_code:"",   country:"Italy",           country_code:"IT", continent:"Europe",        lat:45.46,  lng:9.19,    timezone:"Europe/Rome"},
  // ── Oceania ───────────────────────────────────────────────────────────────────
  {city:"Sydney",         region:"New South Wales", region_code:"NSW", country:"Australia",   country_code:"AU", continent:"Oceania",       lat:-33.87, lng:151.21,  timezone:"Australia/Sydney"},
  {city:"Melbourne",      region:"Victoria",      region_code:"VIC", country:"Australia",     country_code:"AU", continent:"Oceania",       lat:-37.81, lng:144.96,  timezone:"Australia/Melbourne"},
  // ── South America ────────────────────────────────────────────────────────────
  {city:"São Paulo",      region:"São Paulo",     region_code:"SP", country:"Brazil",          country_code:"BR", continent:"South America", lat:-23.55, lng:-46.63,  timezone:"America/Sao_Paulo"},
  {city:"Rio de Janeiro", region:"Rio de Janeiro",region_code:"RJ", country:"Brazil",          country_code:"BR", continent:"South America", lat:-22.91, lng:-43.17,  timezone:"America/Sao_Paulo"},
  {city:"Buenos Aires",   region:"",              region_code:"",   country:"Argentina",       country_code:"AR", continent:"South America", lat:-34.61, lng:-58.38,  timezone:"America/Argentina/Buenos_Aires"},
  {city:"Santiago",       region:"",              region_code:"",   country:"Chile",           country_code:"CL", continent:"South America", lat:-33.46, lng:-70.65,  timezone:"America/Santiago"},
  {city:"Bogotá",         region:"",              region_code:"",   country:"Colombia",        country_code:"CO", continent:"South America", lat:4.71,   lng:-74.07,  timezone:"America/Bogota"},
  {city:"Lima",           region:"",              region_code:"",   country:"Peru",            country_code:"PE", continent:"South America", lat:-12.05, lng:-77.04,  timezone:"America/Lima"},
];

// Stable slug: "san_antonio_tx_us", "seoul_kr", "toronto_on_ca"
// Includes country_code so keys are globally unique even if city names collide.
export const makeCityKey = (c) =>
  [c.city, c.region_code, c.country_code]
    .filter(Boolean)
    .join('_')
    .toLowerCase()
    .replace(/[\s.]+/g,'_')
    .replace(/[^a-z0-9_]/g,'');

// Short UI display: "San Antonio, TX" / "Toronto, ON" / "Seoul, South Korea"
export const makeCityDisplay = (c) => {
  if (c.region_code) return `${c.city}, ${c.region_code}`;
  return `${c.city}, ${c.country}`;
};

// Canonical full string stored in city_display meta field:
// "San Antonio, TX, USA" / "Toronto, ON, Canada" / "Seoul, South Korea"
export const makeCityFull = (c) => {
  if (c.country_code === 'US' && c.region_code) return `${c.city}, ${c.region_code}, USA`;
  if (c.country_code === 'CA' && c.region_code) return `${c.city}, ${c.region_code}, Canada`;
  if (c.region_code) return `${c.city}, ${c.region_code}, ${c.country}`;
  return `${c.city}, ${c.country}`;
};
