// Start der installierten App (start_url im Manifest). Als eigene Datei statt Inline-Skript:
// die Content-Security-Policy erlaubt nur Skripte vom eigenen Server (script-src 'self').
// War auf dem Gerät zuletzt ein Preisrichter angemeldet, geht es direkt zur Bewertung am Tablet
// (auch ohne Netz, die Seite liegt im Service-Worker-Cache), sonst zur normalen Startseite.
(function () {
  var ziel = "/";
  try {
    var slug = localStorage.getItem("letzteRichterSchau");
    if (slug) ziel = "/richter/" + encodeURIComponent(slug);
  } catch (e) {}
  location.replace(ziel);
})();
