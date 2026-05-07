const statusEl = document.querySelector("#status");
const currentModeEl = document.querySelector("#current-mode");
const remoteStateEl = document.querySelector("#remote-state");
const modeSelectEl = document.querySelector("#mode-select");
const applyEl = document.querySelector("#apply");
const autoRemoteEl = document.querySelector("#auto-remote");

let settings = {};
let modes = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function parseModeValue(value) {
  const [size, frequencyText] = value.split("@");
  const [width, height] = size.split("x").map(Number);
  const frequency = Number(frequencyText || 0);
  return { width, height, frequency };
}

function modeValue(mode) {
  return `${mode.width}x${mode.height}@${mode.frequency || 0}`;
}

function renderModes(info) {
  modes = info.modes || [];
  modeSelectEl.textContent = "";
  for (const mode of modes) {
    const option = document.createElement("option");
    option.value = modeValue(mode);
    option.textContent = mode.label;
    modeSelectEl.append(option);
  }
  const currentValue = modeValue(info.current);
  const hasCurrentMode = modes.some((mode) => modeValue(mode) === currentValue);
  if (hasCurrentMode) {
    modeSelectEl.value = currentValue;
  } else if (settings.remotePreset?.width && settings.remotePreset?.height) {
    const preset = settings.remotePreset;
    const matching = modes.find((mode) => mode.width === preset.width && mode.height === preset.height);
    modeSelectEl.value = modeValue(matching || preset);
  } else if (modes.length) {
    modeSelectEl.value = modeValue(modes[0]);
  }
}

async function refresh() {
  try {
    const [info, active] = await Promise.all([
      window.resolutionField.displayInfo(),
      window.resolutionField.remoteActive()
    ]);
    currentModeEl.textContent = info.current.label;
    remoteStateEl.textContent = active ? "Active" : "Idle";
    renderModes(info);
    setStatus(`Updated ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`);
  } catch (error) {
    setStatus(error.message || "Could not refresh");
  }
}

async function applyMode(mode) {
  setStatus(`Applying ${mode.width}x${mode.height}`);
  try {
    const result = await window.resolutionField.setDisplay(mode);
    currentModeEl.textContent = result.current.label;
    setStatus(`Applied ${result.current.label}`);
    await refresh();
  } catch (error) {
    setStatus(error.message || "Could not apply");
  }
}

document.querySelector("#refresh").addEventListener("click", refresh);
document.querySelector("#hide").addEventListener("click", () => window.resolutionField.windowAction("close"));
document.querySelector("#pin").addEventListener("click", async () => {
  const pinned = await window.resolutionField.windowAction("toggle-pin");
  document.querySelector("#pin").style.color = pinned ? "var(--yellow)" : "var(--text)";
});

applyEl.addEventListener("click", async () => {
  if (!modeSelectEl.value) {
    setStatus("Select a resolution first");
    return;
  }
  const mode = parseModeValue(modeSelectEl.value);
  settings.remotePreset = mode;
  settings = await window.resolutionField.writeSettings(settings);
  await applyMode(mode);
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", async () => {
    const [width, height] = button.dataset.preset.split("x").map(Number);
    const matching = modes.find((mode) => mode.width === width && mode.height === height) || { width, height, frequency: 60 };
    settings.remotePreset = matching;
    settings = await window.resolutionField.writeSettings(settings);
    await applyMode(matching);
  });
});

autoRemoteEl.addEventListener("change", async () => {
  settings.autoRemote = autoRemoteEl.checked;
  settings = await window.resolutionField.writeSettings(settings);
  setStatus(settings.autoRemote ? "Auto remote mode on" : "Auto remote mode off");
});

async function init() {
  settings = await window.resolutionField.readSettings();
  autoRemoteEl.checked = Boolean(settings.autoRemote);
  await refresh();
  setInterval(refresh, 10000);
}

init();
