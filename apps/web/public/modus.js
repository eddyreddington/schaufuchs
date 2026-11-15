// Farbmodus vor dem ersten Zeichnen setzen (eigene Datei wegen der Content-Security-Policy, script-src 'self').
// "hell" oder "dunkel" hat der Nutzer gewählt; fehlt der Eintrag, folgt die App dem System.
(function () {
  try {
    var m = localStorage.getItem("farbmodus");
    if (m === "hell" || m === "dunkel") document.documentElement.setAttribute("data-modus", m);
  } catch (e) {}
})();
