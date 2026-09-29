"use strict";

// Früher eigene Experiment-API "calendarDuplicates", jetzt der offizielle
// Calendar-API-Entwurf (siehe calendar-api.js).
const api = CalendarApi;
const $ = (id) => document.getElementById(id);

let calendars = [];     // [{id,name,readOnly,disabled}]
let groups = [];        // [[event, event, ...], ...]
const selected = new Set(); // "calendarId\u0000id"
let compareMode = "all";     // Modus der zuletzt ausgeführten Suche

const refKey = (ev) => ev.calendarId + "\u0000" + ev.id;

// ---------- kleine DOM-Helfer ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function setStatus(text, isError = false) {
  const s = $("status");
  s.textContent = text;
  s.classList.toggle("error", isError);
}

// ---------- Formatierung ----------
const fmtDate = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDateTime = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtTime = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });

function dayToDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtRange(ev) {
  const s = ev.start, e = ev.end;
  if (!s) return "(ohne Beginn)";
  if (s.allDay) {
    const sd = dayToDate(s.day);
    // Ende bei ganztägigen Terminen ist exklusiv
    if (e && e.allDay) {
      const ed = dayToDate(e.day);
      ed.setDate(ed.getDate() - 1);
      if (ed > sd) return `${fmtDate.format(sd)} – ${fmtDate.format(ed)} ${t("(ganztägig)")}`;
    }
    return `${fmtDate.format(sd)} ${t("(ganztägig)")}`;
  }
  const sd = new Date(s.ms);
  if (!e) return fmtDateTime.format(sd);
  const ed = new Date(e.ms);
  const sameDay = sd.toDateString() === ed.toDateString();
  return sameDay
    ? `${fmtDateTime.format(sd)} – ${fmtTime.format(ed)}`
    : `${fmtDateTime.format(sd)} – ${fmtDateTime.format(ed)}`;
}

const fmtStamp = (ms) => (ms ? fmtDateTime.format(new Date(ms)) : "–");

// ---------- Kalenderliste ----------
async function loadCalendars() {
  calendars = (await api.getCalendars()).filter((c) => !c.disabled);
  const box = $("calendars");
  box.textContent = "";
  if (!calendars.length) {
    box.append(h("div", { class: "small" }, t("Keine aktiven Kalender gefunden.")));
    return;
  }
  for (const c of calendars) {
    box.append(
      h("label", { class: "inline" },
        h("input", { type: "checkbox", class: "calcb", value: c.id, checked: true }),
        c.name,
        c.readOnly ? h("span", { class: "ro" }, t("(schreibgeschützt)")) : null
      )
    );
  }
}

// ---------- Duplikatsuche ----------
// loose: Groß-/Kleinschreibung, Leerzeichen, Satzzeichen und Emojis (z. B. 🏁) ignorieren
function normTitle(t, loose) {
  if (!loose) return t;
  const plain = String(t || "").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase("de");
  // Titel nur aus Zeichen/Emojis: dann den Original-Titel (ohne Leerzeichen-Unterschiede) nehmen
  return plain || String(t || "").trim().replace(/\s+/g, " ");
}
function dtKey(d) {
  if (!d) return "-";
  return d.allDay ? "D" + d.day : "T" + d.ms;
}
function startMs(ev) {
  if (!ev.start) return null;
  return ev.start.allDay ? dayToDate(ev.start.day).getTime() : ev.start.ms;
}

// ---------- Titel-Vergleich nach Wörtern ----------
const STOPWORDS = new Set((
  "der die das den dem des ein eine einer eines einem einen und oder mit von vom zum zur im in am an auf " +
  "bei für fur aus nach vor bis um zu ist the a an and or of to at on for with in by"
).split(" "));

// Bedeutungstragende Wörter eines Titels (klein, ohne Satzzeichen und Füllwörter)
function titleWords(title) {
  const words = String(title || "").toLocaleLowerCase("de")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && (w.length > 1 || /\d/.test(w)) && !STOPWORDS.has(w));
  return new Set(words);
}

// Gleich, wenn mindestens n Wörter gemeinsam sind – bei kürzeren Titeln
// müssen alle Wörter des kürzeren im längeren vorkommen.
function wordsMatch(a, b, n) {
  if (!a.size || !b.size) return false;
  const need = Math.min(n, a.size, b.size);
  let shared = 0;
  for (const w of a) if (b.has(w) && ++shared >= need) return true;
  return false;
}

// Teilt eine Menge von Terminen in Gruppen mit ähnlichem Titel (Union-Find
// über einen Wörter-Index, damit auch große Mengen schnell bleiben).
function clusterByWords(list, n) {
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const words = list.map((ev) => titleWords(ev.title));
  const index = new Map();
  words.forEach((set, i) => {
    for (const w of set) {
      if (!index.has(w)) index.set(w, []);
      index.get(w).push(i);
    }
  });
  words.forEach((set, i) => {
    const checked = new Set();
    for (const w of set) {
      for (const j of index.get(w)) {
        if (j <= i || checked.has(j)) continue;
        checked.add(j);
        if (find(i) !== find(j) && wordsMatch(set, words[j], n)) parent[find(j)] = find(i);
      }
    }
  });
  // Titel ganz ohne Wörter (z. B. nur Satzzeichen) nur bei exakt gleichem Titel zusammen
  const byExact = new Map();
  words.forEach((set, i) => {
    if (set.size) return;
    const k = normTitle(list[i].title, true);
    if (byExact.has(k)) parent[find(i)] = find(byExact.get(k));
    else byExact.set(k, i);
  });
  const out = new Map();
  list.forEach((ev, i) => {
    const r = find(i);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(ev);
  });
  return [...out.values()];
}

function buildKey(ev, o) {
  const parts = [o.titleMode === "exact" ? normTitle(ev.title, o.looseTitle) : ""];
  if (o.cmpStart) parts.push(dtKey(ev.start));
  if (o.cmpEnd) parts.push(dtKey(ev.end));
  if (o.cmpLocation) parts.push(normTitle(ev.location, o.looseTitle));
  if (o.cmpDescription) parts.push(ev.description.trim());
  if (o.compareMode === "within") parts.push(ev.calendarId);
  return parts.join("\u0001");
}

function readOptions() {
  return {
    compareMode: $("compareMode").value,
    cmpStart: $("cmpStart").checked,
    cmpEnd: $("cmpEnd").checked,
    cmpLocation: $("cmpLocation").checked,
    cmpDescription: $("cmpDescription").checked,
    looseTitle: $("looseTitle").checked,
    titleMode: $("titleMode").value,
    minWords: Math.max(1, Math.min(9, parseInt($("minWords").value, 10) || 2)),
    from: $("from").value ? dayToDate($("from").value).getTime() : null,
    to: $("to").value ? dayToDate($("to").value).getTime() + 86400000 : null,
  };
}

async function search() {
  const ids = [...document.querySelectorAll(".calcb:checked")].map((cb) => cb.value);
  if (!ids.length) {
    setStatus(t("Bitte mindestens einen Kalender auswählen."), true);
    return;
  }
  const o = readOptions();
  if (o.titleMode === "any" && !o.cmpStart) {
    setStatus(t("Wenn der Titel egal ist, muss mindestens „Beginn“ verglichen werden."), true);
    return;
  }
  if (!o.cmpStart && !o.cmpEnd) {
    const ok = confirm(t("Ohne Beginn und Ende werden alle Termine mit gleichem Titel als Duplikate gewertet (z. B. jeder „Zahnarzt“-Termin). Trotzdem fortfahren?"));
    if (!ok) return;
  }
  savePrefs();

  setStatus(t("Termine werden gelesen …"));
  $("search").disabled = true;
  let events;
  try {
    events = await api.getEvents(ids);
  } catch (e) {
    setStatus(t("Fehler beim Lesen: {0}", e.message || e), true);
    $("search").disabled = false;
    return;
  }
  $("search").disabled = false;

  const map = new Map();
  let considered = 0;
  for (const ev of events) {
    const sm = startMs(ev);
    if (o.from != null && (sm == null || sm < o.from)) continue;
    if (o.to != null && (sm == null || sm >= o.to)) continue;
    considered++;
    const k = buildKey(ev, o);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(ev);
  }
  compareMode = o.compareMode;
  let buckets = [...map.values()];
  if (o.titleMode === "words") {
    buckets = buckets.flatMap((b) => (b.length > 1 ? clusterByWords(b, o.minWords) : [b]));
  }
  groups = buckets
    .filter((g) => g.length > 1)
    // Modus "cross": nur Gruppen, die in mindestens zwei verschiedenen Kalendern vorkommen
    .filter((g) => compareMode !== "cross" || new Set(g.map((e) => e.calendarId)).size > 1)
    .sort((a, b) => (startMs(a[0]) ?? 0) - (startMs(b[0]) ?? 0));

  selected.clear();
  applyPreselection();
  render();

  const total = groups.reduce((n, g) => n + g.length, 0);
  setStatus(
    groups.length
      ? t("{0} Termine geprüft – {1} Gruppen mit insgesamt {2} Einträgen gefunden, davon {3} zum Löschen vorausgewählt. Bitte kontrollieren.", considered, groups.length, total, selected.size)
      : t("{0} Termine geprüft – keine Duplikate gefunden.", considered)
  );
}

// ---------- Vorauswahl ----------
function keeperOf(group) {
  const strategy = $("keepStrategy").value;
  const writable = group.filter((e) => !e.readOnly);
  // Ein schreibgeschützter Eintrag kann ohnehin nicht gelöscht werden -> gilt als "behalten"
  const ro = group.find((e) => e.readOnly);
  if (ro) return ro;
  const list = writable.length ? writable : group;
  if (strategy === "newest") {
    return list.reduce((a, b) => (b.modified > a.modified ? b : a));
  }
  if (strategy === "calendarOrder") {
    const order = calendars.map((c) => c.id);
    return list.reduce((a, b) =>
      order.indexOf(b.calendarId) < order.indexOf(a.calendarId) ? b : a
    );
  }
  // oldest
  return list.reduce((a, b) => ((b.created || Infinity) < (a.created || Infinity) ? b : a));
}

function applyPreselection() {
  selected.clear();
  for (const g of groups) {
    const keep = keeperOf(g);
    for (const ev of g) {
      if (ev.readOnly || ev === keep) continue;
      // Modus "cross": Einträge im Kalender des behaltenen Eintrags bleiben unangetastet,
      // markiert werden nur die Kopien in den anderen Kalendern.
      if (compareMode === "cross" && ev.calendarId === keep.calendarId) continue;
      selected.add(refKey(ev));
    }
  }
}

// ---------- Anzeige ----------
function render() {
  const root = $("groups");
  root.textContent = "";
  for (const g of groups) {
    const first = g[0];
    const card = h("div", { class: "group" },
      h("div", { class: "group-head" },
        h("span", { class: "title" }, first.title || "(ohne Titel)"),
        h("span", { class: "when" }, fmtRange(first)),
        h("span", { class: "count" }, t("{0} Einträge", g.length))
      )
    );
    const table = h("table", {},
      h("tr", {},
        h("th", {}, ""), h("th", {}, t("Kalender")), h("th", {}, t("Titel")), h("th", {}, t("Termin")),
        h("th", {}, t("Ort")), h("th", {}, t("Angelegt")), h("th", {}, t("Geändert"))
      )
    );
    for (const ev of g) {
      const key = refKey(ev);
      const cb = h("input", {
        type: "checkbox",
        checked: selected.has(key),
        disabled: ev.readOnly,
        title: ev.readOnly ? t("Kalender ist schreibgeschützt") : t("Zum Löschen markieren"),
        onchange: (e) => {
          if (e.target.checked) selected.add(key); else selected.delete(key);
          updateState();
        },
      });
      const row = h("tr", { "data-key": key },
        h("td", { class: "cb" }, cb),
        h("td", {}, ev.calendarName, ev.readOnly ? h("span", { class: "badge" }, t("schreibgeschützt")) : null),
        h("td", { class: "title-cell" + (ev.title !== first.title ? " differs" : ""), title: ev.title }, ev.title || t("(ohne Titel)")),
        h("td", {},
          fmtRange(ev),
          ev.recurring ? h("span", { class: "badge", title: t("Löschen entfernt die gesamte Serie") }, t("Serie")) : null
        ),
        h("td", {}, ev.location || h("span", { class: "small" }, "–")),
        h("td", { class: "small" }, fmtStamp(ev.created)),
        h("td", { class: "small" }, fmtStamp(ev.modified))
      );
      table.append(row);
    }
    card.append(table);
    card._group = g;
    root.append(card);
  }
  updateState();
}

function updateState() {
  for (const card of document.querySelectorAll(".group")) {
    const g = card._group;
    let n = 0;
    for (const tr of card.querySelectorAll("tr[data-key]")) {
      const on = selected.has(tr.dataset.key);
      tr.classList.toggle("selected", on);
      if (on) n++;
    }
    card.classList.toggle("all-selected", n === g.length);
  }
  const count = selected.size;
  $("delete").textContent = t("Ausgewählte löschen ({0})", count);
  $("delete").disabled = count === 0;
  $("preselect").disabled = groups.length === 0;
  $("clear").disabled = count === 0;
}

// ---------- Löschen ----------
async function deleteSelected() {
  const all = groups.flat();
  const toDelete = all.filter((ev) => selected.has(refKey(ev)));
  if (!toDelete.length) return;

  const series = toDelete.filter((e) => e.recurring).length;
  const fullGroups = groups.filter((g) => g.every((e) => selected.has(refKey(e)))).length;

  let msg = t("{0} Termin(e) wirklich löschen?", toDelete.length) + "\n\n" + t("Vorher wird ein ICS-Backup im Download-Ordner gespeichert.");
  if (series) msg += "\n\n⚠ " + t("{0} davon sind Serientermine – es wird jeweils die GESAMTE Serie gelöscht.", series);
  if (fullGroups) msg += "\n\n⚠ " + t("In {0} Gruppe(n) sind ALLE Einträge markiert – dieser Termin wäre danach komplett weg.", fullGroups);
  if (!confirm(msg)) return;

  $("delete").disabled = true;
  setStatus(t("Backup wird erstellt und Termine werden gelöscht …"));
  try {
    const res = await api.deleteEvents(toDelete.map((e) => ({ calendarId: e.calendarId, id: e.id })));
    let text = t("{0} Termin(e) gelöscht.", res.deleted);
    if (res.backupPath) text += "\n" + t("Backup: {0}", res.backupPath);
    if (res.errors.length) text += "\n\n" + t("Probleme:") + "\n• " + res.errors.join("\n• ");
    await search();              // Liste neu aufbauen
    setStatus(text + "\n\n" + $("status").textContent, res.errors.length > 0);
  } catch (e) {
    setStatus(t("Fehler beim Löschen: {0}", e.message || e), true);
    updateState();
  }
}

// ---------- Einstellungen des Titel-Vergleichs merken ----------
function updateTitleControls() {
  const mode = $("titleMode").value;
  $("minWords").hidden = mode !== "words";
  $("titleHint").hidden = mode !== "words";
  $("looseTitle").closest("label").hidden = mode !== "exact";
}
function savePrefs() {
  try {
    localStorage.setItem("titlePrefs", JSON.stringify({ mode: $("titleMode").value, minWords: $("minWords").value }));
  } catch (e) {}
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("titlePrefs") || "{}");
    if (["exact", "words", "any"].includes(p.mode)) $("titleMode").value = p.mode;
    if (p.minWords) $("minWords").value = p.minWords;
  } catch (e) {}
  updateTitleControls();
}
$("titleMode").addEventListener("change", () => { updateTitleControls(); savePrefs(); });
$("minWords").addEventListener("change", savePrefs);

// ---------- Start ----------
$("search").addEventListener("click", search);
$("preselect").addEventListener("click", () => { applyPreselection(); updateState(); render(); });
$("clear").addEventListener("click", () => { selected.clear(); render(); });
$("delete").addEventListener("click", deleteSelected);
$("keepStrategy").addEventListener("change", () => { if (groups.length) { applyPreselection(); render(); } });

translatePage();
loadPrefs();
$("delete").textContent = t("Ausgewählte löschen ({0})", 0);
loadCalendars().catch((e) => setStatus(t("Kalender konnten nicht geladen werden: {0}", e.message || e), true));
