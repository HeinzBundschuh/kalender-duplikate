// Öffnet die Duplikat-Übersicht in einem eigenen Tab (bzw. holt einen offenen Tab nach vorne).
// Erreichbar über die Symbolleisten-Schaltfläche (in allen Bereichen, auch im Kalender)
// und über Extras → „Kalender-Duplikate suchen …“.
const PAGE = browser.runtime.getURL("ui/duplicates.html");

async function openPage() {
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((t) => t.url && t.url.startsWith(PAGE));
  if (existing) {
    await browser.tabs.update(existing.id, { active: true });
    await browser.tabs.reload(existing.id);
  } else {
    await browser.tabs.create({ url: PAGE });
  }
}

browser.action.onClicked.addListener(openPage);

browser.runtime.onInstalled.addListener(() => {
  browser.menus.create({
    id: "kd-open",
    title: browser.i18n.getMessage("menuOpen"),
    contexts: ["tools_menu"],
  });
});

browser.menus.onClicked.addListener((info) => {
  if (info.menuItemId === "kd-open") {
    openPage();
  }
});
