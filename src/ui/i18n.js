"use strict";
/* Zweisprachige Oberfläche (Deutsch / Englisch).
 * Der deutsche Text ist zugleich der Schlüssel; EN enthält die englische
 * Übersetzung. Platzhalter {0}, {1} … werden durch Argumente ersetzt.
 * Sprache: Thunderbird-Oberflächensprache; zum Testen im Browser ?lang=en|de.
 *
 * Bilingual UI (German / English). The German text doubles as the key; EN
 * holds the English translation. Placeholders {0}, {1} … take arguments.
 */
const UI_LANG = (() => {
  const q = new URLSearchParams(location.search).get("lang");
  if (q) return q;
  try { return browser.i18n.getUILanguage(); } catch (e) { return navigator.language || "en"; }
})();
const IS_DE = /^de\b/i.test(UI_LANG);
const LOCALE = IS_DE ? "de-AT" : UI_LANG || "en";

function t(de, ...args) {
  let s = IS_DE ? de : (EN[de] ?? de);
  return s.replace(/\{(\d+)\}/g, (_, i) => (args[+i] ?? ""));
}

/* HTML: data-t (Text), data-t-html (Text mit <b>/<i>), data-t-title, data-t-placeholder */
function translatePage() {
  document.documentElement.lang = IS_DE ? "de" : "en";
  if (IS_DE) return;
  for (const el of document.querySelectorAll("[data-t]")) el.textContent = t(el.textContent.trim());
  for (const el of document.querySelectorAll("[data-t-html]")) setSimpleMarkup(el, t(el.innerHTML.trim()));
  for (const el of document.querySelectorAll("[data-t-title]")) el.title = t(el.title);
  for (const el of document.querySelectorAll("[data-t-placeholder]")) el.placeholder = t(el.placeholder);
  document.title = t(document.title);
}

/* Setzt Text mit einfachem <b>/<i>-Markup ohne innerHTML (nur diese Tags, Rest als Text).
   Sets text with simple <b>/<i> markup without innerHTML (only these tags, everything else as text). */
function setSimpleMarkup(el, s) {
  el.textContent = "";
  const stack = [el];
  for (const part of s.split(/(<\/?[bi]>)/)) {
    if (/^<[bi]>$/.test(part)) {
      const n = document.createElement(part[1]);
      stack[stack.length - 1].append(n);
      stack.push(n);
    } else if (/^<\/[bi]>$/.test(part)) {
      if (stack.length > 1) stack.pop();
    } else if (part) {
      stack[stack.length - 1].append(part.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    }
  }
}

/* English translations (key = German text) */
const EN = {
  "Groß-/Kleinschreibung, Leerzeichen, Satzzeichen und Emojis im Titel ignorieren": "Ignore upper/lower case, spaces, punctuation and emojis in the title",
  "genau gleich": "exactly equal",
  "mindestens gemeinsame Wörter": "at least common words",
  "egal (nur Datum/Uhrzeit vergleichen)": "ignore (compare date/time only)",
  "Anzahl gemeinsamer Wörter": "Number of common words",
  "Füllwörter wie „der“, „und“, „am“ zählen nicht. Hat ein Titel weniger Wörter, müssen alle seine Wörter im anderen vorkommen.": "Filler words like “the”, “and”, “at” do not count. If a title has fewer words, all of its words must appear in the other one.",
  "Wenn der Titel egal ist, muss mindestens „Beginn“ verglichen werden.": "If the title is ignored, at least “Start” must be compared.",
  "Backup konnte nicht gespeichert werden.": "The backup could not be saved.",
  "Kalender nicht gefunden ({0})": "Calendar not found ({0})",
  "„{0}“ ist schreibgeschützt": "“{0}” is read-only",
  "Termin nicht mehr vorhanden ({0})": "Event no longer exists ({0})",
  "„{0}“ in „{1}“: {2}": "“{0}” in “{1}”: {2}",
  "Abbrechen": "Cancel",
  "ganztägig": "all day",
  "(ganztägig)": "(all day)",
  "„{0}“ ausblenden": "Hide “{0}”",
  "Das ist ein Serientermin. Was soll ausgeblendet werden?": "This is a recurring event. What should be hidden?",
  "Ganze Serie": "Entire series",
  "Nur dieses Vorkommen": "This occurrence only",
  "„{0}“ exportiert (ganze Serie):": "“{0}” exported (entire series):",
  "„{0}“ exportiert:": "“{0}” exported:",
  "Export fehlgeschlagen: {0}": "Export failed: {0}",
  "„{0}“ löschen": "Delete “{0}”",
  "Serientermin am {0}.": "Recurring event on {0}.",
  "Vorher wird ein ICS-Backup im Download-Ordner gespeichert.": "An ICS backup is saved to your downloads folder first.",
  "Löschen": "Delete",
  "„{0}“ gelöscht (nur dieses Vorkommen).": "“{0}” deleted (this occurrence only).",
  "„{0}“ gelöscht.": "“{0}” deleted.",
  "Nichts gelöscht.": "Nothing deleted.",
  "Backup: {0}": "Backup: {0}",
  "Löschen fehlgeschlagen: {0}": "Delete failed: {0}",
  "Alle Termine dieses Monats sind ausgeblendet.": "All events of this month are hidden.",
  "Keine Termine in diesem Monat.": "No events this month.",
  "Serie": "Series",
  "ausgeblendet (dieses Vorkommen)": "hidden (this occurrence)",
  "ausgeblendet": "hidden",
  "kompakt": "compact",
  "(ohne Titel)": "(no title)",
  "Wieder anzeigen": "Show again",
  "Ausblenden": "Hide",
  "Wieder normal anzeigen": "Show normally again",
  "Kompakt anzeigen": "Show compactly",
  "Ganze Serie als ICS exportieren": "Export entire series as ICS",
  "Als ICS exportieren": "Export as ICS",
  "Kalender ist schreibgeschützt": "Calendar is read-only",
  "einzelnes Vorkommen {0}": "single occurrence {0}",
  "ganze Serie": "entire series",
  "Keine Einträge.": "No entries.",
  "👁 Einblenden": "👁 Show",
  "Normal anzeigen": "Show normally",
  "Termine werden geladen …": "Loading events …",
  "Termine konnten nicht geladen werden: {0}": "Events could not be loaded: {0}",
  "Kalender-Duplikate": "Calendar Duplicate Finder",
  "Doppelte Termine finden, auswählen und löschen. Vor jedem Löschen wird automatisch ein ICS-Backup im Download-Ordner angelegt.": "Find, select and delete duplicate events. Before every deletion an ICS backup is saved to your downloads folder automatically.",
  "Keine aktiven Kalender gefunden.": "No active calendars found.",
  "(schreibgeschützt)": "(read-only)",
  "Bitte mindestens einen Kalender auswählen.": "Please select at least one calendar.",
  "Ohne Beginn und Ende werden alle Termine mit gleichem Titel als Duplikate gewertet (z. B. jeder „Zahnarzt“-Termin). Trotzdem fortfahren?": "Without start and end, all events with the same title count as duplicates (e.g. every “Dentist” appointment). Continue anyway?",
  "Termine werden gelesen …": "Reading events …",
  "Fehler beim Lesen: {0}": "Error while reading: {0}",
  "{0} Termine geprüft – {1} Gruppen mit insgesamt {2} Einträgen gefunden, davon {3} zum Löschen vorausgewählt. Bitte kontrollieren.": "{0} events checked – {1} groups with {2} entries in total found, {3} of them preselected for deletion. Please review.",
  "{0} Termine geprüft – keine Duplikate gefunden.": "{0} events checked – no duplicates found.",
  "{0} Einträge": "{0} entries",
  "Kalender": "Calendar",
  "Termin": "Event",
  "Ort": "Location",
  "Angelegt": "Created",
  "Geändert": "Modified",
  "Zum Löschen markieren": "Mark for deletion",
  "schreibgeschützt": "read-only",
  "Löschen entfernt die gesamte Serie": "Deleting removes the entire series",
  "Titel: {0}": "Title: {0}",
  "Ausgewählte löschen ({0})": "Delete selected ({0})",
  "{0} Termin(e) wirklich löschen?": "Really delete {0} event(s)?",
  "{0} davon sind Serientermine – es wird jeweils die GESAMTE Serie gelöscht.": "{0} of them are recurring events – the ENTIRE series will be deleted in each case.",
  "In {0} Gruppe(n) sind ALLE Einträge markiert – dieser Termin wäre danach komplett weg.": "In {0} group(s) ALL entries are selected – that event would be gone completely.",
  "Backup wird erstellt und Termine werden gelöscht …": "Creating backup and deleting events …",
  "{0} Termin(e) gelöscht.": "{0} event(s) deleted.",
  "Probleme:": "Problems:",
  "Fehler beim Löschen: {0}": "Error while deleting: {0}",
  "Kalender konnten nicht geladen werden: {0}": "Calendars could not be loaded: {0}",
  "Vergleichen": "Compare",
  "innerhalb und zwischen den Kalendern": "within and between calendars",
  "nur innerhalb jedes Kalenders": "only within each calendar",
  "nur zwischen verschiedenen Kalendern": "only between different calendars",
  "Als doppelt gilt, wenn gleich sind …": "Count as duplicate if these match …",
  "Titel": "Title",
  "Beginn": "Start",
  "Ende": "End",
  "Beschreibung": "Description",
  "Groß-/Kleinschreibung und Leerzeichen im Titel ignorieren": "Ignore upper/lower case and spaces in the title",
  "Zeitraum (optional)": "Date range (optional)",
  "von": "from",
  "bis": "to",
  "Vorauswahl – behalten wird je Gruppe": "Preselection – keep per group",
  "der älteste Eintrag (zuerst angelegt)": "the oldest entry (created first)",
  "der zuletzt geänderte Eintrag": "the most recently modified entry",
  "der Eintrag im zuerst gelisteten Kalender": "the entry in the calendar listed first",
  "Duplikate suchen": "Find duplicates",
  "Vorauswahl anwenden": "Apply preselection",
  "Auswahl aufheben": "Clear selection",
  "Kalender-Ansicht": "Calendar Hide & Compact",
  "Termine in der Monats- und Mehrwochenansicht ausblenden oder kompakt anzeigen – rein optisch. Export und Löschen wirken dagegen auf die echten Termine; vor jedem Löschen wird ein ICS-Backup im Download-Ordner angelegt.": "Hide events in the month and multiweek view or show them compactly – display only. Export and delete, however, act on the real events; before every deletion an ICS backup is saved to your downloads folder.",
  "Vorheriger Monat": "Previous month",
  "Nächster Monat": "Next month",
  "Heute": "Today",
  "ausgeblendete gedimmt zeigen": "show hidden events dimmed",
  "Schalter": "Switches",
  "<b>Ausblenden aktiv</b> – ausgeblendete Termine werden im Kalender nicht angezeigt": "<b>Hiding active</b> – hidden events are not shown in the calendar",
  "<b>Kompaktmodus aktiv</b> – markierte Termine erscheinen als schmaler Balken (Titel im Tooltip)": "<b>Compact mode active</b> – marked events appear as a thin bar (title in the tooltip)",
  "Zusätzlich <b>alle Serientermine</b> kompakt anzeigen": "Additionally show <b>all recurring events</b> compactly",
  "Ausgeblendet": "Hidden",
  "Kompakt": "Compact",
  "👁 Alles einblenden": "👁 Show all",
  "Alle normal anzeigen": "Show all normally",
  "Im Kalender (Monats-/Mehrwochenansicht) geht das auch per Rechtsklick auf einen Termin: ausblenden, kompakt, als ICS exportieren. Löschen dort über Thunderbirds eigenes „Löschen“. Diese Seite öffnest du über die Schaltfläche „Ansicht“ oder <i>Extras → Kalender-Ansicht verwalten …</i>": "In the calendar (month/multiweek view) you can also right-click an event: hide, compact, export as ICS. To delete there, use Thunderbird’s own “Delete”. Open this page with the “Hide &amp; Compact” button or <i>Tools → Manage hidden and compact events …</i>",
  "Terminplaner": "Month Planner",
  "Termine: {0}": "Events: {0}",
  "Ort: {0}": "Location: {0}",
  "Kalender: {0}": "Calendar: {0}",
  "Alle Termine dieses Tages anzeigen": "Show all events of this day",
  "Keine Termine.": "No events.",
  "Öffnen / Bearbeiten": "Open / edit",
  "Serie ausblenden": "Hide series",
  "Termin ausblenden": "Hide event",
  "Nur dieses Vorkommen ausblenden": "Hide this occurrence only",
  "„Alle Serien kompakt“ ausschalten": "Turn off “all series compact”",
  "Serie kompakt anzeigen": "Show series compactly",
  "Termin kompakt anzeigen": "Show event compactly",
  "Serie als ICS exportieren": "Export series as ICS",
  "Löschen (Kalender schreibgeschützt)": "Delete (calendar is read-only)",
  "Löschen …": "Delete …",
  "Neuer Termin …": "New event …",
  "Alle Termine dieses Tages": "All events of this day",
  "{0} ausgeblendet": "{0} hidden",
  "alle Serien kompakt": "all series compact",
  "{0} kompakt": "{0} compact",
  "Ausblenden & Kompakt": "Hide & compact",
  "Ausblenden aktiv": "Hiding active",
  "Kompaktmodus aktiv": "Compact mode active",
  "alle Serientermine kompakt": "all recurring events compact",
  "Normal": "Normal",
  "alle": "all",
  "keine": "none",
  "ein Vorkommen": "one occurrence",
  "„{0}“ ausgeblendet – wieder einblenden unten rechts über „🙈 … ausgeblendet“": "“{0}” hidden – show it again at the bottom right via “🙈 … hidden”",
  "Öffnen fehlgeschlagen: {0}": "Opening failed: {0}",
  "Neuer Termin fehlgeschlagen: {0}": "New event failed: {0}",
  "Heute:": "Today:",
  "Termine": "Events",
  "innerhalb einer Woche": "within one week",
  "vorheriger Monat": "previous month",
  "nächster Monat": "next month",
  "Pastellfarben": "Pastel colours",
  "Mausrad / Bild↑↓: Monat blättern · Pos1: heute · Doppelklick: Termin öffnen bzw. neu · Rechtsklick: Menü": "Mouse wheel / PgUp PgDn: change month · Home: today · Double-click: open or new event · Right-click: menu",
  "Seitenleiste ein-/ausblenden": "Show/hide sidebar",
  "Neu laden": "Reload",
  "Ausgeblendete und kompakte Termine verwalten": "Manage hidden and compact events",
  "Frühsport": "Morning workout",
  "Wochenmarkt": "Farmers market",
  "Chorprobe": "Choir rehearsal",
  "Team-Besprechung": "Team meeting",
  "Biomüll": "Organic waste",
  "Restmüll": "General waste",
  "Geburtstag Anna": "Anna’s birthday",
  "Stadtfest": "Town festival",
  "Zahnarzt": "Dentist",
  "Elternabend": "Parents’ evening",
  "Herbstferien": "Autumn holidays"
};
