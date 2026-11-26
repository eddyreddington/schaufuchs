// Farbmodus und Schriftgröße vor dem ersten Zeichnen setzen (eigene Datei wegen der Content-Security-Policy,
// script-src 'self'). "hell"/"dunkel" bzw. "gross"/"sehr-gross" hat der Nutzer gewählt; fehlt der Eintrag, gilt der
// Standard (Farben wie das System, normale Schrift).
(function () {
  try {
    var m = localStorage.getItem("farbmodus");
    if (m === "hell" || m === "dunkel") document.documentElement.setAttribute("data-modus", m);
    var g = localStorage.getItem("schriftgroesse");
    if (g === "gross" || g === "sehr-gross") document.documentElement.setAttribute("data-groesse", g);
  } catch (e) {}
})();
