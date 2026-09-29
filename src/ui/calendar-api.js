"use strict";
/* Zugriff auf Thunderbirds Kalender über den veröffentlichten Calendar-API-Entwurf
 * (https://github.com/thunderbird/webext-experiments, Ordner "calendar"; die
 * Dateien unter experiments/ sind unveränderte Kopien davon).
 *
 * Stellt dieselben drei Funktionen bereit wie die frühere eigene
 * Experiment-API "calendarDuplicates": getCalendars, getEvents, deleteEvents.
 *
 * Access to Thunderbird's calendars through the published Calendar API draft
 * (unmodified copies under experiments/). Provides the same three functions as
 * the former custom "calendarDuplicates" Experiment API.
 */

const CalendarApi = (() => {
  // ---------------- iCalendar lesen / reading iCalendar ----------------

  // RFC 5545 §3.1: Folgezeilen (beginnen mit Leerzeichen/Tab) zusammenfügen.
  function unfold(text) {
    return String(text || "").replace(/\r?\n[ \t]/g, "");
  }

  function unescapeText(value) {
    return value.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
  }

  // Alle Komponenten eines Typs, z. B. VEVENT oder VTIMEZONE.
  function components(text, name) {
    return text.match(new RegExp(`^BEGIN:${name}\\r?$[\\s\\S]*?^END:${name}\\r?$`, "gm")) || [];
  }

  // VEVENT ohne verschachtelte Komponenten (VALARM hat z. B. eine eigene DESCRIPTION).
  function ownLines(vevent) {
    const inner = vevent.replace(/^BEGIN:VEVENT\r?\n/, "").replace(/^END:VEVENT\r?$/m, "");
    return inner.replace(/^BEGIN:(\w[\w-]*)\r?$[\s\S]*?^END:\1\r?$/gm, "");
  }

  // Liefert { params: {NAME: wert}, value } oder null.
  function prop(lines, name) {
    const m = lines.match(new RegExp(`^${name}((?:;[^:\\r\\n]*)?):([^\\r\\n]*)`, "m"));
    if (!m) return null;
    const params = {};
    for (const p of m[1].split(";").slice(1)) {
      const i = p.indexOf("=");
      if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, "");
    }
    return { params, value: m[2].trim() };
  }

  function textProp(lines, name) {
    const p = prop(lines, name);
    return p ? unescapeText(p.value) : "";
  }

  // "/mozilla.org/20050126_1/Europe/Vienna" (alte Thunderbird-Kalender) -> "Europe/Vienna"
  function cleanTzid(tzid) {
    return String(tzid || "").replace(/^\/mozilla\.org\/[^/]+\//, "").replace(/^\//, "");
  }

  const tzFormatters = new Map();
  function tzFormatter(tz) {
    if (!tzFormatters.has(tz)) {
      let fmt = null;
      try {
        fmt = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, hourCycle: "h23",
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        });
      } catch (e) {
        fmt = null; // unbekannte Zeitzone (z. B. Windows-Name) -> wie lokale Zeit behandeln
      }
      tzFormatters.set(tz, fmt);
    }
    return tzFormatters.get(tz);
  }

  // Wanduhrzeit in Zeitzone tz -> UTC-Millisekunden; null, wenn tz unbekannt.
  function zonedToUtc(y, mo, d, h, mi, s, tz) {
    const fmt = tzFormatter(tz);
    if (!fmt) return null;
    const wall = Date.UTC(y, mo - 1, d, h, mi, s);
    const offsetAt = (ms) => {
      const p = {};
      for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
    };
    let ms = wall - offsetAt(wall);
    ms = wall - offsetAt(ms); // zweiter Schritt korrigiert Sommer-/Winterzeit-Grenzen
    return ms;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function localDay(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // DTSTART/DTEND/… -> { ms, allDay, day, tz } wie bisher von der eigenen API geliefert.
  function parseDate(p) {
    if (!p) return null;
    const m = p.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (!h) {
      const date = new Date(+y, +mo - 1, +d);
      return { ms: date.getTime(), allDay: true, day: `${y}-${mo}-${d}`, tz: "" };
    }
    const tz = z ? "UTC" : cleanTzid(p.params.TZID);
    let ms = null;
    if (z) ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    else if (tz) ms = zonedToUtc(+y, +mo, +d, +h, +mi, +s, tz);
    if (ms == null) ms = new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime(); // floating / unbekannt
    return { ms, allDay: false, day: localDay(new Date(ms)), tz };
  }

  // DURATION (P1D, PT1H30M, P2W …) -> Millisekunden
  function parseDuration(value) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value || "");
    if (!m) return null;
    const [, sign, w, d, h, mi, s] = m;
    const ms = ((((+(w || 0) * 7 + +(d || 0)) * 24 + +(h || 0)) * 60 + +(mi || 0)) * 60 + +(s || 0)) * 1000;
    return sign === "-" ? -ms : ms;
  }

  function endFromStart(start, lines) {
    const dur = parseDuration(prop(lines, "DURATION")?.value);
    if (start.allDay) {
      // Ganztägig: Ende exklusiv; ohne DTEND/DURATION genau ein Tag (RFC 5545).
      const [y, mo, d] = start.day.split("-").map(Number);
      const days = dur != null ? Math.round(dur / 86400000) : 1;
      const date = new Date(y, mo - 1, d + days);
      return { ms: date.getTime(), allDay: true, day: localDay(date), tz: "" };
    }
    const ms = start.ms + (dur ?? 0);
    return { ms, allDay: false, day: localDay(new Date(ms)), tz: start.tz };
  }

  function utcStamp(lines, name) {
    const d = parseDate(prop(lines, name));
    return d ? d.ms : 0;
  }

  // Hauptobjekt (Master) eines Termins: das VEVENT ohne RECURRENCE-ID.
  function masterEvent(ical) {
    const events = components(unfold(ical), "VEVENT");
    return events.find((v) => !/^RECURRENCE-ID[;:]/m.test(ownLines(v))) || events[0] || null;
  }

  function toEvent(apiItem, calendar) {
    const vevent = masterEvent(apiItem.item);
    if (!vevent) return null;
    const lines = ownLines(vevent);
    const start = parseDate(prop(lines, "DTSTART"));
    const end = parseDate(prop(lines, "DTEND")) || (start ? endFromStart(start, lines) : null);
    return {
      id: apiItem.id,
      calendarId: calendar.id,
      calendarName: calendar.name,
      readOnly: !!calendar.readOnly,
      title: textProp(lines, "SUMMARY"),
      location: textProp(lines, "LOCATION"),
      description: textProp(lines, "DESCRIPTION"),
      start,
      end,
      recurring: /^(RRULE|RDATE)[;:]/m.test(lines),
      created: utcStamp(lines, "CREATED"),
      modified: utcStamp(lines, "LAST-MODIFIED") || utcStamp(lines, "DTSTAMP"),
    };
  }

  // ---------------- Backup (ICS) ----------------

  // Mehrere VCALENDAR-Texte zu einer Datei zusammenfassen (Zeitzonen nur einmal).
  function mergeCalendars(icalTexts) {
    const timezones = new Map();
    const events = [];
    for (const text of icalTexts) {
      const unfolded = unfold(text).replace(/\r?\n/g, "\r\n");
      for (const tz of components(unfolded, "VTIMEZONE")) {
        const id = prop(tz, "TZID")?.value || tz;
        if (!timezones.has(id)) timezones.set(id, tz.trim());
      }
      for (const ev of components(unfolded, "VEVENT")) events.push(ev.trim());
    }
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Heinz Bundschuh//Kalender-Duplikate//DE",
      ...timezones.values(),
      ...events,
      "END:VCALENDAR",
      "",
    ].join("\r\n");
  }

  function waitForDownload(downloadId) {
    return new Promise((resolve, reject) => {
      const listener = (delta) => {
        if (delta.id !== downloadId || !delta.state) return;
        if (delta.state.current === "complete") {
          browser.downloads.onChanged.removeListener(listener);
          resolve();
        } else if (delta.state.current === "interrupted") {
          browser.downloads.onChanged.removeListener(listener);
          reject(new Error(t("Backup konnte nicht gespeichert werden.")));
        }
      };
      browser.downloads.onChanged.addListener(listener);
      // Falls der Download schon fertig war, bevor der Listener hing:
      browser.downloads.search({ id: downloadId }).then(([item]) => {
        if (item?.state === "complete") {
          browser.downloads.onChanged.removeListener(listener);
          resolve();
        } else if (item?.state === "interrupted") {
          browser.downloads.onChanged.removeListener(listener);
          reject(new Error(t("Backup konnte nicht gespeichert werden.")));
        }
      });
    });
  }

  // Speichert die ICS im Download-Ordner und liefert den vollständigen Pfad.
  async function saveBackup(ics) {
    const n = new Date();
    const stamp =
      `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}-` +
      `${pad(n.getHours())}${pad(n.getMinutes())}${pad(n.getSeconds())}`;
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    try {
      const id = await browser.downloads.download({
        url,
        filename: `kalender-duplikate-backup-${stamp}.ics`,
        saveAs: false,
        conflictAction: "uniquify",
      });
      await waitForDownload(id);
      const [item] = await browser.downloads.search({ id });
      return item?.filename || `kalender-duplikate-backup-${stamp}.ics`;
    } finally {
      // Etwas warten, damit der Download die Blob-Daten sicher gelesen hat.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }

  // ---------------- öffentliche Funktionen / public functions ----------------

  async function getCalendars() {
    const list = await browser.calendar.calendars.query({});
    return (list || []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      readOnly: !!c.readOnly,
      disabled: c.enabled === false,
    }));
  }

  async function getEvents(calendarIds) {
    const all = await getCalendars();
    const result = [];
    for (const id of calendarIds) {
      const calendar = all.find((c) => c.id === id);
      if (!calendar || calendar.disabled) continue;
      let items;
      try {
        // Ohne Zeitraum und ohne expand: nur Hauptobjekte, keine Einzelvorkommen.
        items = await browser.calendar.items.query({ calendarId: id, type: "event", returnFormat: "ical" });
      } catch (e) {
        console.error(`Kalender-Duplikate: ${calendar.name} nicht lesbar`, e);
        continue;
      }
      for (const item of items || []) {
        try {
          const ev = toEvent(item, calendar);
          if (ev) result.push(ev);
        } catch (e) {
          console.error("Kalender-Duplikate: Termin nicht lesbar", item?.id, e);
        }
      }
    }
    return result;
  }

  async function deleteEvents(refs) {
    const calendars = await getCalendars();
    const found = [];
    const errors = [];

    // 1) Termine einsammeln (aktueller Stand, als ICS für das Backup)
    for (const ref of refs) {
      const calendar = calendars.find((c) => c.id === ref.calendarId);
      if (!calendar) {
        errors.push(t("Kalender nicht gefunden ({0})", ref.calendarId));
        continue;
      }
      if (calendar.readOnly) {
        errors.push(t("„{0}“ ist schreibgeschützt", calendar.name));
        continue;
      }
      let item = null;
      try {
        item = await browser.calendar.items.get(ref.calendarId, ref.id, { returnFormat: "ical" });
      } catch (e) {
        item = null;
      }
      if (!item) {
        errors.push(t("Termin nicht mehr vorhanden ({0})", ref.id));
        continue;
      }
      found.push({ calendar, ref, item });
    }

    // 2) Backup – schlägt es fehl, wird nichts gelöscht.
    let backupPath = "";
    if (found.length) {
      backupPath = await saveBackup(mergeCalendars(found.map((f) => f.item.item)));
    }

    // 3) Löschen
    let deleted = 0;
    for (const { calendar, ref, item } of found) {
      try {
        await browser.calendar.items.remove(ref.calendarId, ref.id);
        deleted++;
      } catch (e) {
        const title = textProp(ownLines(masterEvent(item.item) || ""), "SUMMARY") || ref.id;
        errors.push(t("„{0}“ in „{1}“: {2}", title, calendar.name, e.message || e));
      }
    }
    return { deleted, backupPath, errors };
  }

  return {
    getCalendars,
    getEvents,
    deleteEvents,
    // für Tests / for tests
    _internal: { toEvent, mergeCalendars, parseDate, zonedToUtc },
  };
})();
