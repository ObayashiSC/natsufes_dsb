/* =========================================================================
 *  compare.js — 比較モード（Aフィルター vs Bフィルター）
 *  ------------------------------------------------------------------------
 *  2つのフィルター条件（A / B）を独立に設定し、同じ指標を左右2系列の
 *  グラフで比較する専用画面。
 *
 *  ・フィルター項目の定義は filter-defs.js（window.FilterDefs）を共用。
 *    → 通常画面と同じ項目（性別・年代・居住地・徒歩圏・勤務地・勤務地(詳細)）。
 *  ・データ取得は config.js の DATA_SOURCE を参照（dashboard-core.js は不使用）。
 *  ・表示は「件数」と「構成比(%)」をトグルで切替できる。
 *
 *  依存: Chart.js / config.js / filter-defs.js
 * ======================================================================= */
(function () {
  "use strict";

  var FD  = window.FilterDefs;
  var CFG = window.DASHBOARD_CONFIG || {};
  var FLD = FD.FLD;

  var COLOR = { A: "#3f66b3", B: "#c2643c" };   /* A=青 / B=オレンジ */
  var RAW = [];
  var charts = {};
  var mode = "count";                            /* count | pct */

  var ST = { A: FD.newState(), B: FD.newState() };
  var PERIOD = { from: null, to: null };

  var $ = function (s) { return document.querySelector(s); };

  /* ===================== 値の取り出し ===================== */
  function tokens(v) {
    if (v === undefined || v === null) return [];
    var s = String(v).trim();
    if (!s) return [];
    return s.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
  }

  /* ---- 比較するグラフ一覧 ---- */
  var CHARTS = [
    { key: "gender",    title: "性別",                 order: FD.ORDER.gender,    get: function (r) { return tokens(r[FLD.gender]); } },
    { key: "age",       title: "年代",                 order: FD.ORDER.age,       get: function (r) { var v = FD.ageBand(r[FLD.birth]); return v ? [v] : []; } },
    { key: "res",       title: "居住地（サマリ）",      order: FD.ORDER.res,       get: function (r) { var v = FD.resGroupOf(r); return v ? [v] : []; } },
    { key: "resDetail", title: "居住地（詳細）",        order: FD.ORDER.resDetail, get: function (r) { var v = FD.resDetailOf(r); return v ? [v] : []; } },
    { key: "walk",      title: "徒歩圏 / 徒歩圏外",     order: FD.ORDER.walk,      get: function (r) { var v = FD.walkBand(r); return v ? [v] : []; } },
    { key: "wrk",       title: "勤務地（サマリ）",      order: FD.ORDER.wrk,       get: function (r) { var v = FD.wrkGroupOf(r); return v ? [v] : []; } },
    { key: "wrkDetail", title: "勤務地（詳細）",        order: FD.ORDER.wrkDetail, get: function (r) { var v = FD.wrkDetailOf(r); return v ? [v] : []; } },
    { key: "source",    title: "流入経路（登録トリガー）", order: null,             get: function (r) { return tokens(r[FLD.source]); } },
    { key: "heard",     title: "認知経路（Q5・複数回答）", order: null,             get: function (r) { return tokens(r[FLD.heard]); } },
    { key: "rich",      title: "リッチメニュー クリック",  order: null,             get: function (r) { return tokens(r[FLD.rich]); } },
    { key: "sent",      title: "まちへの愛着（Q6・複数回答）", order: (CFG.sentimentOrder || null), get: function (r) { return tokens(r[FLD.sent]); } },
  ];

  /* ===================== 期間 ===================== */
  function toDate(s) { return s ? new Date(String(s).replace(" ", "T").replace(/\//g, "-")) : null; }
  function dayKey(d) {
    var x = new Date(d);
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  function inPeriod(r) {
    var d = toDate(r[FLD.added]);
    if (!d) return false;
    if (PERIOD.from && dayKey(d) < PERIOD.from) return false;
    if (PERIOD.to   && dayKey(d) > PERIOD.to)   return false;
    return true;
  }
  function baseRows() { return RAW.filter(inPeriod); }
  function rowsOf(side) { return FD.filter(ST[side], baseRows()); }

  /* ===================== フィルターUI（A / B）===================== */
  function buildSide(side) {
    var host = $("#flt" + side);
    if (!host) return;
    host.innerHTML = "";
    FD.KEYS.forEach(function (g) {
      var wrap = document.createElement("div");
      wrap.className = "gf-dd";
      wrap.id = "dd_" + side + "_" + g.k;
      wrap.innerHTML =
        '<button type="button" class="gf-dd-btn">' +
          '<span class="gf-dd-cap">' + g.label + '</span>' +
          '<span class="gf-dd-sum">すべて</span>' +
          '<span class="gf-dd-arrow">▾</span>' +
        '</button>' +
        '<div class="gf-dd-pop" hidden></div>';

      var btn = wrap.querySelector(".gf-dd-btn");
      var pop = wrap.querySelector(".gf-dd-pop");
      var sum = wrap.querySelector(".gf-dd-sum");

      btn.onclick = function (e) {
        e.stopPropagation();
        var willOpen = pop.hidden;
        closeAllPops();
        if (willOpen) { pop.hidden = false; wrap.classList.add("open"); }
      };

      FD.optionsFor(g, RAW).forEach(function (v) {
        var lab = document.createElement("label");
        lab.className = "gf-dd-opt";
        var cb = document.createElement("input");
        cb.type = "checkbox"; cb.value = v;
        cb.checked = ST[side][g.k].has(v);
        cb.onchange = function () {
          if (cb.checked) ST[side][g.k].add(v); else ST[side][g.k].delete(v);
          updateSum(); render();
        };
        var sp = document.createElement("span"); sp.textContent = v;
        lab.appendChild(cb); lab.appendChild(sp);
        pop.appendChild(lab);
      });

      wrap._sum = sum;
      wrap._key = g.k;
      wrap._side = side;
      host.appendChild(wrap);
    });
    updateSum();
  }

  function closeAllPops() {
    document.querySelectorAll(".gf-dd").forEach(function (dd) {
      var p = dd.querySelector(".gf-dd-pop");
      if (p) p.hidden = true;
      dd.classList.remove("open");
    });
  }

  function updateSum() {
    document.querySelectorAll(".gf-dd").forEach(function (dd) {
      if (!dd._sum) return;
      var set = ST[dd._side][dd._key];
      if (!set.size)           { dd._sum.textContent = "すべて"; dd.classList.remove("has"); }
      else if (set.size === 1) { dd._sum.textContent = Array.from(set)[0]; dd.classList.add("has"); }
      else                     { dd._sum.textContent = set.size + "件選択"; dd.classList.add("has"); }
    });
    $("#descA").textContent = FD.describe(ST.A);
    $("#descB").textContent = FD.describe(ST.B);
  }

  function clearSide(side) {
    FD.KEYS.forEach(function (g) { ST[side][g.k].clear(); });
    document.querySelectorAll("#flt" + side + " .gf-dd-opt input:checked").forEach(function (cb) { cb.checked = false; });
    updateSum(); render();
  }

  function swapSides() {
    var tmp = ST.A; ST.A = ST.B; ST.B = tmp;
    buildSide("A"); buildSide("B"); render();
  }

  /* ===================== 集計 ===================== */
  function tally(rows, getter) {
    var m = new Map();
    rows.forEach(function (r) {
      getter(r).forEach(function (t) { m.set(t, (m.get(t) || 0) + 1); });
    });
    return m;
  }

  function labelsFor(c, mA, mB) {
    if (c.order && c.order.length) {
      var used = new Set(c.order);
      var extra = [];
      [mA, mB].forEach(function (m) { m.forEach(function (_, k) { if (!used.has(k) && extra.indexOf(k) < 0) extra.push(k); }); });
      return c.order.concat(extra);
    }
    var all = new Set();
    [mA, mB].forEach(function (m) { m.forEach(function (_, k) { all.add(k); }); });
    return Array.from(all).sort(function (a, b) {
      return ((mB.get(b) || 0) + (mA.get(b) || 0)) - ((mB.get(a) || 0) + (mA.get(a) || 0));
    });
  }

  /* ===================== KPI 比較表 =====================
   *  ※「流入経路 判明率」は要件により廃止（ほぼ全件が判明し差が出ないため）
   * ==================================================== */
  function metricsOf(rows) {
    var total = rows.length;
    var blocked = rows.filter(function (r) { return String(r[FLD.blocked]) === "1"; }).length;
    var answered = rows.filter(function (r) { return tokens(r[FLD.gender]).length || tokens(r[FLD.res]).length; }).length;
    var rich = rows.filter(function (r) { return tokens(r[FLD.rich]).length; }).length;
    var walkIn = rows.filter(function (r) { return FD.walkBand(r) === "徒歩圏"; }).length;
    var pct = function (n) { return total ? Math.round(n / total * 100) : 0; };
    return {
      "対象人数":            total + " 名",
      "アクティブ率":        pct(total - blocked) + " %",
      "ブロック率":          pct(blocked) + " %",
      "アンケート回答率":    pct(answered) + " %",
      "徒歩圏の割合":        pct(walkIn) + " %",
      "リッチメニュー利用率": pct(rich) + " %",
    };
  }

  function renderKPI(rowsA, rowsB) {
    var a = metricsOf(rowsA), b = metricsOf(rowsB);
    var html = '<table class="cmp-table"><thead><tr><th>指標</th>' +
      '<th class="ca">A</th><th class="cb">B</th></tr></thead><tbody>';
    Object.keys(a).forEach(function (k) {
      html += '<tr><td>' + k + '</td><td class="ca">' + a[k] + '</td><td class="cb">' + b[k] + '</td></tr>';
    });
    html += '</tbody></table>';
    $("#kpiCompare").innerHTML = html;
  }

  /* ===================== 折れ線（日毎の登録者数）===================== */
  function renderLine(rowsA, rowsB) {
    var days = [];
    var ds = baseRows().map(function (r) { return toDate(r[FLD.added]); }).filter(Boolean).sort(function (x, y) { return x - y; });
    if (!ds.length) return;
    var d = new Date(ds[0]); d.setHours(0, 0, 0, 0);
    var end = new Date(ds[ds.length - 1]); end.setHours(0, 0, 0, 0);
    while (d <= end) { days.push(dayKey(d)); d.setDate(d.getDate() + 1); }

    function series(rows) {
      var m = new Map(days.map(function (k) { return [k, 0]; }));
      rows.forEach(function (r) {
        var k = dayKey(toDate(r[FLD.added]));
        if (m.has(k)) m.set(k, m.get(k) + 1);
      });
      return days.map(function (k) { return m.get(k); });
    }

    if (charts.line) charts.line.destroy();
    charts.line = new Chart($("#cmpLine").getContext("2d"), {
      type: "line",
      data: {
        labels: days.map(function (k) { var p = k.split("-"); return p[1] + "/" + p[2]; }),
        datasets: [
          { label: "A", data: series(rowsA), borderColor: COLOR.A, backgroundColor: COLOR.A, tension: .35, pointRadius: 2, borderWidth: 2.4, fill: false },
          { label: "B", data: series(rowsB), borderColor: COLOR.B, backgroundColor: COLOR.B, tension: .35, pointRadius: 2, borderWidth: 2.4, fill: false },
        ],
      },
      options: opts(false),
    });
  }

  /* ===================== グラフ描画 ===================== */
  function opts(horizontal) {
    return {
      responsive: true, maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      animation: { duration: 350 },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#1b1f24", borderColor: "#2a3038", borderWidth: 1,
          titleColor: "#e8ecef", bodyColor: "#c9d1d9", padding: 10, cornerRadius: 8,
          callbacks: mode === "pct" ? {
            label: function (c) { return c.dataset.label + ": " + c.parsed[horizontal ? "x" : "y"] + " %"; },
          } : {},
        },
      },
      scales: {
        x: horizontal
          ? { beginAtZero: true, grid: { color: "rgba(16,24,40,.08)" }, ticks: { color: "#5b636c", font: { size: 11 } } }
          : { grid: { display: false }, ticks: { color: "#5b636c", font: { size: 11 }, autoSkip: false } },
        y: horizontal
          ? { grid: { display: false }, ticks: { color: "#5b636c", font: { size: 11 }, autoSkip: false,
              callback: function (v) { var l = this.getLabelForValue(v); return (typeof l === "string" && l.length > 16) ? l.slice(0, 16) + "…" : l; } } }
          : { beginAtZero: true, grid: { color: "rgba(16,24,40,.08)" }, ticks: { color: "#5b636c", font: { size: 11 }, precision: 0 } },
      },
    };
  }

  function renderCharts(rowsA, rowsB) {
    var host = $("#cmpGrid");
    host.innerHTML = "";
    CHARTS.forEach(function (c) {
      var mA = tally(rowsA, c.get), mB = tally(rowsB, c.get);
      var labels = labelsFor(c, mA, mB);
      if (!labels.length) return;

      var sumA = 0, sumB = 0;
      labels.forEach(function (l) { sumA += (mA.get(l) || 0); sumB += (mB.get(l) || 0); });
      var conv = function (v, sum) { return mode === "pct" ? (sum ? Math.round(v / sum * 1000) / 10 : 0) : v; };
      var vA = labels.map(function (l) { return conv(mA.get(l) || 0, sumA); });
      var vB = labels.map(function (l) { return conv(mB.get(l) || 0, sumB); });

      var id = "cmp_" + c.key;
      var h = Math.max(180, labels.length * 30 + 60);
      host.insertAdjacentHTML("beforeend",
        '<div class="panel cmp-panel">' +
          '<div class="panel-head"><h3>' + c.title + '</h3>' +
          '<span class="sub">A ' + sumA + " / B " + sumB + (mode === "pct" ? "（構成比）" : "（件数）") + '</span></div>' +
          '<div class="cmp-box" style="height:' + h + 'px"><canvas id="' + id + '"></canvas></div>' +
        '</div>');

      if (charts[id]) charts[id].destroy();
      charts[id] = new Chart(document.getElementById(id).getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "A", data: vA, backgroundColor: COLOR.A, borderRadius: 0, barPercentage: .82, categoryPercentage: .72 },
            { label: "B", data: vB, backgroundColor: COLOR.B, borderRadius: 0, barPercentage: .82, categoryPercentage: .72 },
          ],
        },
        options: opts(true),
      });
    });
  }

  /* ===================== 全体描画 ===================== */
  function render() {
    var rowsA = rowsOf("A"), rowsB = rowsOf("B");
    var base = baseRows().length;
    $("#cntA").textContent = rowsA.length + " / " + base + " 名";
    $("#cntB").textContent = rowsB.length + " / " + base + " 名";
    renderKPI(rowsA, rowsB);
    renderLine(rowsA, rowsB);
    renderCharts(rowsA, rowsB);
  }

  /* ===================== 起動 ===================== */
  function initPeriod() {
    var ds = RAW.map(function (r) { return toDate(r[FLD.added]); }).filter(Boolean).sort(function (a, b) { return a - b; });
    if (!ds.length) return;
    PERIOD.from = dayKey(ds[0]);
    PERIOD.to   = dayKey(ds[ds.length - 1]);
    var f = $("#pFrom"), t = $("#pTo");
    f.value = PERIOD.from; t.value = PERIOD.to;
    f.min = t.min = PERIOD.from; f.max = t.max = PERIOD.to;
    f.onchange = function () { PERIOD.from = f.value; render(); };
    t.onchange = function () { PERIOD.to = t.value; render(); };
  }

  /* 通常画面から引き継いだフィルターを A に反映 */
  function restoreA() {
    try {
      var s = sessionStorage.getItem("gfilter:A");
      if (!s) return;
      var o = JSON.parse(s);
      Object.keys(o).forEach(function (k) {
        if (ST.A[k]) (o[k] || []).forEach(function (v) { ST.A[k].add(v); });
      });
      sessionStorage.removeItem("gfilter:A");
    } catch (e) {}
  }

  function bindUI() {
    $("#clrA").onclick = function () { clearSide("A"); };
    $("#clrB").onclick = function () { clearSide("B"); };
    $("#swapAB").onclick = swapSides;
    document.querySelectorAll("#modeSeg button").forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll("#modeSeg button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        mode = b.dataset.mode;
        render();
      };
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".gf-dd")) closeAllPops(); });
  }

  async function boot() {
    try {
      var res = await fetch(CFG.DATA_SOURCE + "?_=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      var json = await res.json();
      RAW = Array.isArray(json) ? json : (json.records || []);
      if (!RAW.length) throw new Error("records empty");
      $("#recCount").textContent = RAW.length.toLocaleString();

      restoreA();
      initPeriod();
      buildSide("A"); buildSide("B");
      bindUI();
      render();
    } catch (e) {
      console.error(e);
      $("#cmpContent").innerHTML =
        '<div class="state err">データの取得に失敗しました（' + e.message + '）。<br>' +
        '<span style="color:var(--dim)">フォルダ内で <code>python -m http.server</code> を起動し ' +
        '<b>http://localhost:8000/compare.html</b> からアクセスしてください。</span></div>';
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
