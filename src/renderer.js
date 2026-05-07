const feeds = [
  { source: "Optica", url: "https://opg.optica.org/rss/optica_feed.xml" },
  { source: "Optics Express", url: "https://opg.optica.org/rss/opex_feed.xml" }
];

const defaultSoundQueries = [
  "sound field imaging",
  "acoustic field imaging",
  "sound field reconstruction",
  "near-field acoustic holography",
  "acoustic holography",
  "sound source localization"
];

const allowedJournalNeedles = [
  "advances in optics and photonics",
  "applied optics",
  "biomedical optics express",
  "journal of the optical society of america a",
  "journal of the optical society of america b",
  "optica",
  "optica quantum",
  "optical materials express",
  "optics continuum",
  "optics express",
  "optics letters",
  "photonics research",
  "apl photonics",
  "apl materials",
  "applied physics letters",
  "optics and lasers in engineering",
  "optics and laser technology",
  "optics and lasers technology",
  "optics laser technology",
  "light science and applications",
  "light science applications",
  "acs photonics",
  "laser and photonics reviews",
  "laser photonics reviews",
  "advanced optical materials",
  "journal of lightwave technology",
  "ieee photonics technology letters",
  "optics communications",
  "physical review a",
  "applied physics reviews",
  "nature communications",
  "communications physics",
  "scientific reports",
  "npj",
  "communications engineering",
  "communications materials"
];

const state = {
  journals: [],
  sound: JSON.parse(localStorage.getItem("soundPapers") || "[]"),
  soundMode: localStorage.getItem("soundMode") || "Sound Field Imaging defaults",
  saved: []
};
let articleDataPath = "";
let isSavingSaved = false;

const statusEl = document.querySelector("#status");
const queryEl = document.querySelector("#query");
const yearFilterEl = document.querySelector("#year-filter");

document.querySelector("#refresh").addEventListener("click", refreshAll);
document.querySelector("#search").addEventListener("click", refreshSound);
document.querySelector("#hide").addEventListener("click", () => window.paperWidget.windowAction("close"));
document.querySelector("#pin").addEventListener("click", async () => {
  const pinned = await window.paperWidget.windowAction("toggle-pin");
  document.querySelector("#pin").style.color = pinned ? "var(--yellow)" : "var(--text)";
});

queryEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") refreshSound();
});

yearFilterEl.addEventListener("change", () => {
  localStorage.setItem("topicSearchYear", yearFilterEl.value);
  refreshSound();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab, .panel").forEach((el) => el.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.tab}`).classList.add("active");
  });
});

function setStatus(text) {
  statusEl.textContent = text;
}

function cleanText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeText(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xmlText, source) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  return Array.from(doc.querySelectorAll("item")).slice(0, 18).map((item) => {
    const title = cleanText(item.querySelector("title")?.textContent || "Untitled");
    const link = cleanText(item.querySelector("link")?.textContent || "");
    const dateText = cleanText(item.querySelector("pubDate")?.textContent || "");
    const description = cleanText(item.querySelector("description")?.textContent || "");
    return {
      id: link || `${source}:${title}`,
      title,
      link,
      source,
      date: formatDate(dateText),
      authors: "",
      abstract: description,
      isOpenAccess: null,
      oaStatus: ""
    };
  });
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function selectedStartDate() {
  const year = yearFilterEl.value || "2024";
  return `${year}-01-01`;
}

function setupYearFilter() {
  const currentYear = new Date().getFullYear();
  const savedYear = localStorage.getItem("topicSearchYear") || "2024";
  yearFilterEl.textContent = "";
  for (let year = currentYear; year >= 2018; year -= 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    yearFilterEl.append(option);
  }
  yearFilterEl.value = savedYear;
  if (yearFilterEl.value !== savedYear) yearFilterEl.value = "2024";
}

function crossrefUrl(query, startDate) {
  const params = new URLSearchParams({
    query,
    rows: "100",
    sort: "published",
    order: "desc",
    filter: `type:journal-article,from-pub-date:${startDate}`,
    select: "DOI,title,author,published-print,published-online,container-title,URL,abstract"
  });
  return `https://api.crossref.org/works?${params.toString()}`;
}

function openAlexUrl(query, startDate, page = 1) {
  const params = new URLSearchParams({
    search: query,
    filter: `from_publication_date:${startDate},type:article`,
    "per-page": "100",
    page: String(page)
  });
  return `https://api.openalex.org/works?${params.toString()}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await window.paperWidget.fetchUrl(url);
    } catch (error) {
      const isRateLimited = error.message.includes("HTTP 429");
      const isTimeout = error.message.includes("aborted") || error.message.includes("AbortError");
      if ((!isRateLimited && !isTimeout) || attempt === retries) throw error;
      await sleep(2500 + attempt * 2500);
    }
  }
  throw new Error(`Could not fetch ${url}`);
}

function splitQueries(value) {
  const customQueries = value
    .split(/\s+OR\s+|,/i)
    .map((query) => cleanText(query))
    .filter(Boolean)
    .slice(0, 8);
  return customQueries.length ? customQueries : defaultSoundQueries;
}

function searchQueries(value) {
  return splitQueries(value);
}

function stemToken(token) {
  const word = token.toLowerCase();
  if (word === "holography" || word === "holographic" || word === "hologram" || word === "holograms") return "holograph";
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 4) return word.slice(0, -1);
  if (word.endsWith("ic") && word.length > 5) return word.slice(0, -2);
  return word;
}

function queryStems(query) {
  return normalizeText(query)
    .split(" ")
    .filter((token) => token.length > 2)
    .map(stemToken);
}

function isAllowedJournal(source) {
  const normalized = normalizeText(source);
  return allowedJournalNeedles.some((needle) => {
    const normalizedNeedle = normalizeText(needle);
    return normalized === normalizedNeedle || normalized.includes(normalizedNeedle);
  }) || normalized.startsWith("nature ") || normalized === "nature" || normalized.startsWith("science ") || normalized === "science" || normalized.startsWith("apl ");
}

function relevanceScore(paper, queries) {
  const haystack = normalizeText(`${paper.title} ${paper.abstract}`);
  const haystackStems = new Set(haystack.split(" ").filter(Boolean).map(stemToken));
  let best = 0;
  for (const query of queries) {
    const normalizedQuery = normalizeText(query);
    if (normalizedQuery && haystack.includes(normalizedQuery)) best = Math.max(best, 10);
    const stems = queryStems(query);
    if (!stems.length) continue;
    const hits = stems.filter((stem) => haystackStems.has(stem)).length;
    const ratio = hits / stems.length;
    const score = hits + ratio * 4;
    best = Math.max(best, score);
  }
  return best;
}

function crossrefDate(item) {
  const parts = item["published-online"]?.["date-parts"]?.[0] || item["published-print"]?.["date-parts"]?.[0];
  if (!parts) return "";
  return formatDate(parts.join("-"));
}

function normalizeCrossref(item) {
  const title = cleanText(item.title?.[0] || "Untitled");
  const source = cleanText(item["container-title"]?.[0] || "Journal article");
  const authors = (item.author || [])
    .slice(0, 5)
    .map((author) => cleanText([author.given, author.family].filter(Boolean).join(" ")))
    .filter(Boolean)
    .join(", ");
  return {
    id: item.DOI || item.URL || title,
    title,
    link: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ""),
    source,
    date: crossrefDate(item),
    authors,
    abstract: cleanText((item.abstract || "").replace(/<[^>]+>/g, "")),
    isOpenAccess: null,
    oaStatus: ""
  };
}

function decodeOpenAlexAbstract(index = {}) {
  if (!index || typeof index !== "object") return "";
  const entries = Object.entries(index);
  if (!entries.length) return "";
  const words = [];
  for (const [word, positions] of entries) {
    for (const position of positions) words[position] = word;
  }
  return words.filter(Boolean).join(" ");
}

function normalizeOpenAlex(item) {
  const source = cleanText(item.primary_location?.source?.display_name || item.locations?.[0]?.source?.display_name || "Journal article");
  const openAccess = item.open_access || {};
  const authors = (item.authorships || [])
    .slice(0, 5)
    .map((authorship) => cleanText(authorship.author?.display_name || ""))
    .filter(Boolean)
    .join(", ");
  return {
    id: item.doi || item.id || item.title,
    title: cleanText(item.title || "Untitled"),
    link: item.doi || item.primary_location?.landing_page_url || item.id || "",
    source,
    date: formatDate(item.publication_date || ""),
    authors,
    abstract: decodeOpenAlexAbstract(item.abstract_inverted_index),
    isOpenAccess: Boolean(openAccess.is_oa),
    oaStatus: cleanText(openAccess.oa_status || "")
  };
}

async function fetchOpenAlexPages(query, startDate, maxItems = 500) {
  const items = [];
  const pageSize = 100;
  const maxPages = Math.ceil(maxItems / pageSize);
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchWithRetry(openAlexUrl(query, startDate, page), 1);
    const results = JSON.parse(response.text).results || [];
    items.push(...results.map((item, index) => ({
      ...normalizeOpenAlex(item),
      openAlexRank: items.length + index
    })));
    if (results.length < pageSize) break;
    await sleep(250);
  }
  return items.slice(0, maxItems);
}

async function fetchCrossrefItems(query, startDate) {
  const response = await fetchWithRetry(crossrefUrl(query, startDate), 1);
  return (JSON.parse(response.text).message?.items || []).map(normalizeCrossref);
}

async function loadSaved({ migrateLocal = false } = {}) {
  try {
    const data = await window.paperWidget.readData();
    articleDataPath = data.path || articleDataPath;
    const remoteSaved = Array.isArray(data.saved) ? data.saved : [];
    const legacySaved = migrateLocal ? JSON.parse(localStorage.getItem("savedPapers") || "[]") : [];
    state.saved = remoteSaved.length ? remoteSaved : legacySaved;
    if (!remoteSaved.length && legacySaved.length) await persistSaved();
  } catch (error) {
    console.warn(error);
    state.saved = JSON.parse(localStorage.getItem("savedPapers") || "[]");
  }
}

async function persistSaved() {
  isSavingSaved = true;
  try {
    const data = await window.paperWidget.writeData({ saved: state.saved });
    articleDataPath = data.path || articleDataPath;
    localStorage.setItem("savedPapers", JSON.stringify(state.saved));
  } catch (error) {
    console.warn(error);
    localStorage.setItem("savedPapers", JSON.stringify(state.saved));
  } finally {
    isSavingSaved = false;
  }
}

async function refreshSavedFromDisk() {
  if (isSavingSaved) return;
  const before = JSON.stringify(state.saved);
  await loadSaved();
  if (JSON.stringify(state.saved) !== before) renderAll();
}

async function savePaper(paper) {
  const exists = state.saved.some((entry) => entry.id === paper.id);
  state.saved = exists ? state.saved.filter((entry) => entry.id !== paper.id) : [paper, ...state.saved].slice(0, 80);
  await persistSaved();
  renderAll();
}

function isSaved(paper) {
  return state.saved.some((entry) => entry.id === paper.id);
}

function renderList(target, papers, emptyText) {
  const list = document.querySelector(target);
  list.textContent = "";
  if (!papers.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText;
    list.append(empty);
    return;
  }

  const template = document.querySelector("#paper-template");
  for (const paper of papers) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".source").textContent = paper.source;
    const oaBadge = node.querySelector(".oa-badge");
    if (paper.isOpenAccess === null || paper.isOpenAccess === undefined) {
      oaBadge.remove();
    } else {
      oaBadge.textContent = paper.isOpenAccess ? `OA${paper.oaStatus ? ` ${paper.oaStatus}` : ""}` : "Closed";
      oaBadge.classList.toggle("closed", !paper.isOpenAccess);
      oaBadge.title = paper.isOpenAccess ? "Open Access" : "Not marked as Open Access";
    }
    node.querySelector(".date").textContent = paper.date;
    node.querySelector("h2").textContent = paper.title;
    node.querySelector(".authors").textContent = paper.authors || "Latest article feed";
    node.querySelector(".abstract").textContent = paper.abstract || "No abstract available from this source.";
    node.querySelector(".open").addEventListener("click", () => paper.link && window.paperWidget.openLink(paper.link));
    const save = node.querySelector(".save");
    save.textContent = isSaved(paper) ? "Saved" : "Save";
    save.classList.toggle("saved", isSaved(paper));
    save.addEventListener("click", () => savePaper(paper));
    list.append(node);
  }
}

function renderAll() {
  document.querySelector("#sound-mode").textContent = state.soundMode;
  renderList("#journal-list", state.journals, "No journal articles loaded yet.");
  renderList("#sound-list", state.sound, "No Sound Field Imaging results loaded yet.");
  renderList("#saved-list", state.saved, "Saved papers will appear here.");
}

async function refreshJournals() {
  const results = [];
  for (const feed of feeds) {
    const response = await window.paperWidget.fetchUrl(feed.url);
    results.push(...parseRss(response.text, feed.source));
  }
  state.journals = results.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function refreshSound() {
  const queries = searchQueries(queryEl.value);
  const relevanceQueries = splitQueries(queryEl.value);
  const startDate = selectedStartDate();
  state.soundMode = queryEl.value.trim() ? `Custom: ${queryEl.value.trim()}` : "Sound Field Imaging defaults";
  localStorage.setItem("soundMode", state.soundMode);
  setStatus(`Searching ${state.soundMode} from ${startDate.slice(0, 4)}`);
  const queryResults = [];
  let fetchedCount = 0;
  let sourceErrors = 0;
  for (const [index, query] of queries.entries()) {
    setStatus(`Searching OpenAlex ${index + 1}/${queries.length}: ${query}`);
    try {
      const openAlexItems = await fetchOpenAlexPages(query, startDate, 800);
      fetchedCount += openAlexItems.length;
      queryResults.push(openAlexItems);
    } catch (error) {
      sourceErrors += 1;
      console.warn(error);
    }
    if (index < queries.length - 1) await sleep(500);
  }
  setStatus("Filtering results");
  const seen = new Set();
  const allCandidates = queryResults.flat();
  const relevantCandidates = allCandidates
    .map((paper) => ({ ...paper, relevance: relevanceScore(paper, relevanceQueries) }))
    .filter((paper) => {
      if (!paper.title || !paper.link || seen.has(paper.id)) return false;
      seen.add(paper.id);
      return true;
    });
  const papers = relevantCandidates
    .sort((a, b) => a.openAlexRank - b.openAlexRank)
    .slice(0, 80);
  state.sound = papers;
  localStorage.setItem("soundPapers", JSON.stringify(state.sound));
  const errorText = sourceErrors ? `, source errors ${sourceErrors}` : "";
  state.soundMode = `${state.soundMode} | OpenAlex | from ${startDate.slice(0, 4)} | hits ${fetchedCount}, shown ${papers.length}${errorText}`;
  setStatus(papers.length ? `Showing ${papers.length} OpenAlex papers` : `No OpenAlex papers | hits ${fetchedCount}${errorText}`);
  renderAll();
}

async function refreshAll() {
  setStatus("Refreshing feeds");
  const errors = [];
  try {
    await refreshJournals();
  } catch (error) {
    errors.push(error);
  }
  try {
    await refreshSound();
  } catch (error) {
    errors.push(error);
  }
  renderAll();
  if (errors.length) {
    setStatus("Updated with some network limits");
  } else {
    setStatus(`Updated ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`);
  }
}

async function init() {
  setupYearFilter();
  await loadSaved({ migrateLocal: true });
  renderAll();
  refreshAll();
}

init();
setInterval(refreshAll, 60 * 60 * 1000);
setInterval(refreshSavedFromDisk, 15 * 1000);
