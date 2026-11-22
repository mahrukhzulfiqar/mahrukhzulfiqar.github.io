// Live Danish electricity prices from Energinet's open data (Energi Data Service).
(() => {
  const el = document.getElementById("ticker-data");
  if (!el) return;
  const TZ = "Europe/Copenhagen", SLOTS = 16, CACHE_MIN = 20;
  const dkDate = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(Date.now() + d * 864e5));
  const fmt = (d, o) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...o }).format(d);
  const hm = (d) => fmt(d, { hour: "2-digit", minute: "2-digit" });
  const dayHm = (d) => fmt(d, { weekday: "short" }) + " " + hm(d);

  async function load() {
    try {
      const c = JSON.parse(localStorage.getItem("gw-ticker") || "null");
      if (c && Date.now() - c.ts < CACHE_MIN * 6e4) return c.rows;
    } catch (e) {}
    const url = "https://api.energidataservice.dk/dataset/DayAheadPrices?start=" + dkDate(0) + "&end=" + dkDate(2) +
      "&filter=" + encodeURIComponent('{"PriceArea":["DK1","DK2"]}') + "&sort=TimeUTC%20asc&limit=1000";
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rows = (await res.json()).records.filter((r) => r.DayAheadPriceDKK != null)
      .map((r) => [r.TimeUTC, r.PriceArea, r.DayAheadPriceDKK / 1000]);
    try { localStorage.setItem("gw-ticker", JSON.stringify({ ts: Date.now(), rows })); } catch (e) {}
    return rows;
  }

  function nowPrice(rows, area) {
    const t = Date.now();
    const pts = rows.filter((r) => r[1] === area).map((r) => ({ t: new Date(r[0] + "Z").getTime(), p: r[2] }));
    const cur = pts.find((x) => x.t <= t && t < x.t + 15 * 6e4);
    return { cur, ahead: pts.filter((x) => x.t + 15 * 6e4 > t) };
  }

  load().then((rows) => {
    const dk2 = nowPrice(rows, "DK2"), dk1 = nowPrice(rows, "DK1");
    if (!dk2.cur || dk2.ahead.length < SLOTS) throw new Error("no data");
    let best = 0, bestAvg = Infinity;
    for (let i = 0; i + SLOTS <= dk2.ahead.length; i++) {
      const avg = dk2.ahead.slice(i, i + SLOTS).reduce((a, x) => a + x.p, 0) / SLOTS;
      if (avg < bestAvg) { bestAvg = avg; best = i; }
    }
    const s = new Date(dk2.ahead[best].t), e = new Date(dk2.ahead[best + SLOTS - 1].t + 15 * 6e4);
    el.innerHTML =
      "<span>East Denmark now <b>" + dk2.cur.p.toFixed(2) + "</b> kr/kWh</span>" +
      (dk1.cur ? "<span>West Denmark now <b>" + dk1.cur.p.toFixed(2) + "</b> kr/kWh</span>" : "") +
      "<span>Cheapest 4 h to charge an EV in Copenhagen: <span class=\"hl\">" + dayHm(s) + " to " + hm(e) + "</span></span>" +
      "<a href=\"gridwise.html\">How it works</a>";
  }).catch(() => {
    el.innerHTML = "<span>Live Danish electricity prices from Energinet, powered by <a href=\"gridwise.html\">GridWise</a></span>";
  });
})();
