const defaultPlace = {
  name: "Kobe, Hyogo, Japan",
  latitude: 34.6901,
  longitude: 135.1955,
  timezone: "Asia/Tokyo"
};

const defaultVersion = "kobe-layout-v2";
const storedVersion = localStorage.getItem("weatherDefaultVersion");
let currentPlace;
if (storedVersion !== defaultVersion) {
  currentPlace = defaultPlace;
  localStorage.setItem("weatherPlace", JSON.stringify(defaultPlace));
  localStorage.setItem("weatherDefaultVersion", defaultVersion);
} else {
  currentPlace = JSON.parse(localStorage.getItem("weatherPlace") || "null") || defaultPlace;
}
let lastLocationCheck = Number(localStorage.getItem("weatherLastLocationCheck") || "0");

let radarHost = "";
let radarFrames = [];
let lastRadarSource = "https://www.rainviewer.com/api/weather-maps-api.html";

const mapState = {
  centerLat: 37.6,
  centerLon: 138.2,
  zoom: 4,
  dragging: false,
  startX: 0,
  startY: 0,
  startCenter: null
};

const statusEl = document.querySelector("#status");
const radarSlider = document.querySelector("#radar-slider");
const mapEl = document.querySelector("#map");

document.querySelector("#refresh").addEventListener("click", refreshAll);
document.querySelector("#hide").addEventListener("click", () => window.weatherField.windowAction("close"));
document.querySelector("#pin").addEventListener("click", async () => {
  const pinned = await window.weatherField.windowAction("toggle-pin");
  document.querySelector("#pin").style.color = pinned ? "var(--yellow)" : "var(--text)";
});
document.querySelector("#radar-source").addEventListener("click", () => window.weatherField.openLink(lastRadarSource));
radarSlider.addEventListener("input", () => updateRadarFrame(Number(radarSlider.value)));
mapEl.addEventListener("wheel", onMapWheel, { passive: false });
mapEl.addEventListener("pointerdown", onMapPointerDown);
mapEl.addEventListener("pointermove", onMapPointerMove);
mapEl.addEventListener("pointerup", onMapPointerUp);
mapEl.addEventListener("pointercancel", onMapPointerUp);

function setStatus(text) {
  statusEl.textContent = text;
}

function forecastUrl(place) {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: place.timezone || "auto",
    current: "temperature_2m,relative_humidity_2m,weather_code",
    hourly: "relative_humidity_2m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "7"
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function locationUrl() {
  return "https://ipinfo.io/json";
}

async function fetchJson(url) {
  const response = await window.weatherField.fetchUrl(url);
  return JSON.parse(response.text);
}

function placeFromIpInfo(data) {
  const [latitude, longitude] = String(data.loc || "").split(",").map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    name: [data.city, data.region, data.country].filter(Boolean).join(", "),
    latitude,
    longitude,
    timezone: data.timezone || "auto"
  };
}

async function updateLocationIfNeeded({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastLocationCheck < 60 * 60 * 1000) return false;
  try {
    setStatus("Checking location");
    const data = await fetchJson(locationUrl());
    const nextPlace = placeFromIpInfo(data);
    lastLocationCheck = now;
    localStorage.setItem("weatherLastLocationCheck", String(lastLocationCheck));
    if (!nextPlace) return false;
    const moved = Math.abs(nextPlace.latitude - currentPlace.latitude) > 0.02 || Math.abs(nextPlace.longitude - currentPlace.longitude) > 0.02;
    currentPlace = nextPlace;
    localStorage.setItem("weatherPlace", JSON.stringify(currentPlace));
    return moved;
  } catch (error) {
    console.warn(error);
    lastLocationCheck = now;
    localStorage.setItem("weatherLastLocationCheck", String(lastLocationCheck));
    return false;
  }
}

function weatherInfo(code) {
  if (code === 0) return { type: "sun", text: "Clear" };
  if ([1, 2].includes(code)) return { type: "partly", text: "Partly" };
  if (code === 3) return { type: "cloud", text: "Cloudy" };
  if ([45, 48].includes(code)) return { type: "fog", text: "Fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { type: "drizzle", text: "Drizzle" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { type: "rain", text: "Rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { type: "snow", text: "Snow" };
  if ([95, 96, 99].includes(code)) return { type: "storm", text: "Storm" };
  return { type: "mixed", text: "Mixed" };
}

function weatherIcon(type) {
  const sun = '<circle cx="17" cy="17" r="6" fill="#f4d35e"/><g stroke="#f4d35e" stroke-width="2" stroke-linecap="round"><path d="M17 2v5"/><path d="M17 27v5"/><path d="M2 17h5"/><path d="M27 17h5"/><path d="M6.4 6.4l3.5 3.5"/><path d="M24.1 24.1l3.5 3.5"/><path d="M27.6 6.4l-3.5 3.5"/><path d="M9.9 24.1l-3.5 3.5"/></g>';
  const cloud = '<path d="M9 23h16a6 6 0 0 0 .4-12A9 9 0 0 0 8 14.2 4.5 4.5 0 0 0 9 23Z" fill="#aeb6c2"/>';
  const rain = '<g stroke="#7cc8ff" stroke-width="2" stroke-linecap="round"><path d="M11 26l-2 4"/><path d="M18 26l-2 4"/><path d="M25 26l-2 4"/></g>';
  const snow = '<g stroke="#d9f2ff" stroke-width="1.7" stroke-linecap="round"><path d="M11 28h5"/><path d="M13.5 25.5v5"/><path d="M22 28h5"/><path d="M24.5 25.5v5"/></g>';
  const fog = '<g stroke="#aeb6c2" stroke-width="2" stroke-linecap="round"><path d="M7 24h20"/><path d="M10 28h14"/></g>';
  const bolt = '<path d="M18 21l-4 9 8-10h-5l4-8-8 9h5Z" fill="#f4d35e"/>';
  let body = cloud;
  if (type === "sun") body = sun;
  if (type === "partly") body = `${sun}<g transform="translate(0 4)">${cloud}</g>`;
  if (type === "rain" || type === "drizzle") body = `${cloud}${rain}`;
  if (type === "snow") body = `${cloud}${snow}`;
  if (type === "fog") body = `${cloud}${fog}`;
  if (type === "storm") body = `${cloud}${bolt}${rain}`;
  return `<svg viewBox="0 0 34 34" aria-hidden="true">${body}</svg>`;
}

function shortDay(value) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "numeric", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function dailyHumidity(data, day) {
  const values = data.hourly.time
    .map((time, index) => time.startsWith(day) ? data.hourly.relative_humidity_2m[index] : null)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function renderForecast(data) {
  const current = data.current;
  const currentInfo = weatherInfo(current.weather_code);
  document.querySelector("#place").textContent = currentPlace.name;
  document.querySelector("#current-temp").textContent = `${Math.round(current.temperature_2m)} C`;
  document.querySelector("#current-summary").textContent = `${currentInfo.text} | H ${current.relative_humidity_2m}%`;
  document.querySelector("#current-icon").innerHTML = weatherIcon(currentInfo.type);

  const list = document.querySelector("#forecast");
  list.textContent = "";
  for (let i = 0; i < data.daily.time.length; i += 1) {
    const info = weatherInfo(data.daily.weather_code[i]);
    const humidity = dailyHumidity(data, data.daily.time[i]);
    const card = document.createElement("article");
    card.className = "day-card";
    card.innerHTML = `
      <div class="day-icon">${weatherIcon(info.type)}</div>
      <div class="day-main">
        <strong>${shortDay(data.daily.time[i])}</strong>
        <span>${info.text} | H ${humidity ?? "--"}%</span>
      </div>
      <div class="day-meta">
        <span class="day-temp">${Math.round(data.daily.temperature_2m_min[i])}/${Math.round(data.daily.temperature_2m_max[i])} C</span>
        <span>R ${data.daily.precipitation_probability_max[i] ?? 0}%</span>
      </div>
    `;
    list.append(card);
  }
}

function latLonToWorld(lat, lon, zoom) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}

function worldToLatLon(x, y, zoom) {
  const scale = 256 * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

function radarTimeLabel(frame) {
  if (!frame) return "--:--";
  const label = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(frame.time * 1000));
  return frame.kind === "future" ? `${label} +` : label;
}

function addTile(src, left, top, className) {
  const img = document.createElement("img");
  img.className = `map-tile ${className}`;
  img.src = src;
  img.style.left = `${left}px`;
  img.style.top = `${top}px`;
  img.alt = "";
  mapEl.append(img);
}

function addMapMarker() {
  const rect = mapEl.getBoundingClientRect();
  const zoom = mapState.zoom;
  const center = latLonToWorld(mapState.centerLat, mapState.centerLon, zoom);
  const place = latLonToWorld(currentPlace.latitude, currentPlace.longitude, zoom);
  const marker = document.createElement("div");
  marker.className = "place-marker";
  marker.title = currentPlace.name;
  marker.style.left = `${rect.width / 2 + place.x - center.x}px`;
  marker.style.top = `${rect.height / 2 + place.y - center.y}px`;
  mapEl.append(marker);
}

function addMapLabel() {
  const label = document.createElement("div");
  label.className = "map-label";
  label.textContent = `z${mapState.zoom} | scroll to zoom`;
  mapEl.append(label);
}

function renderMapTiles() {
  const frame = radarFrames[Number(radarSlider.value)];
  if (!frame || !radarHost) return;
  const rect = mapEl.getBoundingClientRect();
  const zoom = mapState.zoom;
  const center = latLonToWorld(mapState.centerLat, mapState.centerLon, zoom);
  const topLeft = {
    x: center.x - rect.width / 2,
    y: center.y - rect.height / 2
  };
  const minTileX = Math.floor(topLeft.x / 256);
  const minTileY = Math.floor(topLeft.y / 256);
  const maxTileX = Math.floor((topLeft.x + rect.width) / 256);
  const maxTileY = Math.floor((topLeft.y + rect.height) / 256);
  const tileCount = 2 ** zoom;

  mapEl.textContent = "";
  for (let ty = minTileY; ty <= maxTileY; ty += 1) {
    if (ty < 0 || ty >= tileCount) continue;
    for (let tx = minTileX; tx <= maxTileX; tx += 1) {
      const wrappedX = ((tx % tileCount) + tileCount) % tileCount;
      const left = tx * 256 - topLeft.x;
      const top = ty * 256 - topLeft.y;
      addTile(`https://basemaps.cartocdn.com/dark_all/${zoom}/${wrappedX}/${ty}.png`, left, top, "base-tile");
      addTile(`${radarHost}${frame.path}/256/${zoom}/${wrappedX}/${ty}/2/1_1.png`, left, top, "radar-tile");
    }
  }
  addMapMarker();
  addMapLabel();
  document.querySelector("#radar-time").textContent = radarTimeLabel(frame);
}

function updateRadarFrame(index) {
  if (!radarFrames[index]) return;
  renderMapTiles();
}

async function renderRadar() {
  const data = await fetchJson("https://api.rainviewer.com/public/weather-maps.json");
  radarHost = data.host;
  const past = (data.radar?.past || []).map((frame) => ({ ...frame, kind: "past" }));
  const future = (data.radar?.nowcast || []).map((frame) => ({ ...frame, kind: "future" }));
  radarFrames = [...past, ...future];
  if (!radarFrames.length) throw new Error("No radar frames available");
  radarSlider.max = String(radarFrames.length - 1);
  radarSlider.value = String(Math.max(0, past.length - 1));
  lastRadarSource = "https://www.rainviewer.com/api/weather-maps-api.html";
  renderMapTiles();
}

function onMapWheel(event) {
  event.preventDefault();
  const nextZoom = Math.max(4, Math.min(8, mapState.zoom + (event.deltaY < 0 ? 1 : -1)));
  if (nextZoom === mapState.zoom) return;
  mapState.zoom = nextZoom;
  renderMapTiles();
}

function onMapPointerDown(event) {
  mapState.dragging = true;
  mapState.startX = event.clientX;
  mapState.startY = event.clientY;
  mapState.startCenter = latLonToWorld(mapState.centerLat, mapState.centerLon, mapState.zoom);
  mapEl.classList.add("dragging");
  mapEl.setPointerCapture(event.pointerId);
}

function onMapPointerMove(event) {
  if (!mapState.dragging || !mapState.startCenter) return;
  const nextWorld = {
    x: mapState.startCenter.x - (event.clientX - mapState.startX),
    y: mapState.startCenter.y - (event.clientY - mapState.startY)
  };
  const nextCenter = worldToLatLon(nextWorld.x, nextWorld.y, mapState.zoom);
  mapState.centerLat = Math.max(20, Math.min(50, nextCenter.lat));
  mapState.centerLon = Math.max(118, Math.min(154, nextCenter.lon));
  renderMapTiles();
}

function onMapPointerUp(event) {
  mapState.dragging = false;
  mapState.startCenter = null;
  mapEl.classList.remove("dragging");
  if (mapEl.hasPointerCapture(event.pointerId)) mapEl.releasePointerCapture(event.pointerId);
}

async function refreshAll() {
  setStatus("Refreshing weather");
  try {
    await updateLocationIfNeeded();
    const forecast = await fetchJson(forecastUrl(currentPlace));
    renderForecast(forecast);
    await renderRadar();
    setStatus(`Updated ${currentPlace.name}`);
  } catch (error) {
    setStatus(error.message);
  }
}

updateLocationIfNeeded({ force: true }).finally(refreshAll);
setInterval(refreshAll, 30 * 60 * 1000);
setInterval(() => updateLocationIfNeeded({ force: true }).then(refreshAll), 60 * 60 * 1000);
