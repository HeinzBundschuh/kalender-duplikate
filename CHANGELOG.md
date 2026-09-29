# Changelog

## 1.5.1
- Uses the published **Thunderbird Calendar API draft** (`experiments/calendar`, unmodified copies from the Thunderbird project) instead of the add-on's own Experiment API `calendarDuplicates`.
- Nutzt den veröffentlichten **Calendar-API-Entwurf** von Thunderbird (`experiments/calendar`, unveränderte Kopien) statt der eigenen Experiment-API `calendarDuplicates`.
- Title comparison: exactly equal, at least n common words (filler words ignored), or ignore title; punctuation and emojis can be ignored.
- Titelvergleich: genau gleich, mindestens n gemeinsame Wörter (ohne Füllwörter) oder egal; Satzzeichen und Emojis ignorierbar.
- ICS backup before deleting is saved via the downloads API / ICS-Backup vor dem Löschen über die Download-Schnittstelle.

## 1.3.2 – first public version / erste öffentliche Version
- Finds duplicate events within and between calendars; compare modes “within and between”, “only within each calendar”, “only between different calendars”.
- Match criteria: title (always), start, end, location, description; optional date range; case/space-insensitive titles.
- Preselection per group: keep oldest, most recently modified, or the entry in the calendar listed first. Read-only calendars are respected.
- Deletes selected entries after confirmation, with an automatic ICS backup.
- German and English user interface, MIT licence.
