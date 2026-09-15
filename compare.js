/* =========================================================================
 *  compare.js — 比較モード（Aフィルター vs Bフィルター）
 *  ------------------------------------------------------------------------
 *  2つのフィルター条件（A / B）を独立に設定し、同じ指標を左右2系列の
 *  グラフで比較する専用画面。
 *
 *  ・フィルター項目の定義は filter-defs.js（window.FilterDefs）を共用。
 *  ・データ取得は config.js の DATA_SOURCE を参照（dashboard-core.js は不使用）。
 *  ・表示は「件数」と「構成比(%)」をトグルで切替できる。
 *
 *  ★レイアウト（2列固定）
 *      性別 ｜ 年代／居住地(サマリ) ｜ 居住地(詳細)／徒歩圏(単独)／
 *      勤務地(サマリ) ｜ 勤務地(詳細)／流入経路 ｜ 認知経路／リッチメニュー ｜ まちへの愛着
 *
 *  ★A/Bフィルターバーは Excel の「ウィンドウ枠の固定」と同様、
 *    スクロールしても画面上部に固定表示される（initSticky）。
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
  /* ★期間は A / B それぞれ独立に保持する（従来の A/B 共通から変更） */
  var PERIOD = { A: { from: null, to: null }, B: { from: null, to: null } };
  var DOMAIN = { from: null, to: null };   /* データ全体の日付範囲（軸・入力の min/max 用） */

  var $ = function (s) { return document.querySelector(s); };

  /* ===================== 値の取り出し ===================== */
  function tokens(v) {
    if (v === undefined || v === null) return [];
    var s = String(v).trim();
    if (!s) return [];
    return s.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
  }

  /* ---- 比較するグラフ一覧（この配列の並び順＝画面の並び順）----
   *  solo: true … その行は左列のみに表示し、次の項目は次行の左から始める
   * ------------------------------------------------------------ */
  var CHARTS = [
    { key: "gender",    title: "性別",                 order: FD.ORDER.gender,    get: function (r) { return tokens(r[FLD.gender]); } },
    { key: "age",       title: "年代",                 order: FD.ORDER.age,       get: function (r) { var v = FD.ageBand(r[FLD.birth]); return v ? [v] : []; } },
    { key: "res",       title: "居住地（サマリ）",      order: FD.ORDER.res,       get: function (r) { var v = FD.resGroupOf(r); return v ? [v] : []; } },
    { key: "resDetail", title: "居住地（詳細）",        order: FD.ORDER.resDetail, get: function (r) { var v = FD.resDetailOf(r); return v ? [v] : []; } },
    { key: "walk",      title: "徒歩圏・徒歩圏外",      order: FD.ORDER.walk,      get: function (r) { var v = FD.walkBand(r); return v ? [v] : []; }, solo: true },
    { key: "wrk",       title: "勤務地（サマリ）",      order: FD.ORDER.wrk,       get: function (r) { var v = FD.wrkGroupOf(r); return v ? [v] : []; } },
    { key: "wrkDetail", title: "勤務地（詳細）",        order: FD.ORDER.wrkDetail, get: function (r) { var v = FD.wrkDetailOf(r); return v ? [v] : []; } },
    { key: "source",    title: "流入経路",             order: null,               get: function (r) { return tokens(r[FLD.source]); } },
    { key: "heard",     title: "認知経路",             order: null,               get: function (r) { return tokens(r[FLD.heard]); } },
    { key: "rich",      title: "リッチメニュークリック", order: null,               get: function (r) { return tokens(r[FLD.rich]); } },
    { key: "sent",      title: "まちへの愛着",          order: (CFG.sentimentOrder || null), get: function (r) { return tokens(r[FLD.sent]); } },
  ];

  /* ===================== 期間 ===================== */
  function toDate(s) { return s ? new Date(String(s).replace(" ", "T").replace(/\//g, "-")) : null; }
  function dayKey(d) {
    var x = new Date(d);
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  function inPeriod(r, side) {
    var p = PERIOD[side];
    var d = toDate(r[FLD.added]);
    if (!d) return false;
    if (p.from && dayKey(d) < p.from) return false;
    if (p.to   && dayKey(d) > p.to)   return false;
    return true;
  }
  /* 期間だけを適用した行（side ごと） */
  function baseRows(side) { return RAW.filter(function (r) { return inPeriod(r, side); }); }
  /* 期間 + 属性フィルターを適用した行（side ごと） */
  function rowsOf(side) { return FD.filter(ST[side], baseRows(side)); }

  /* =========================================================================
   *  ウィンドウ枠の固定（sticky）
   *  ------------------------------------------------------------------------
   *  ・position: sticky は「スクロールする祖先」が overflow:hidden だと効かない。
   *    このダッシュボードは .main（または body）がスクロール領域のため、
   *    途中の祖先に overflow:hidden があれば visible に緩和して sticky を有効化する。
   *  ・センチネル要素が画面外へ出たタイミングで .stuck を付け、影＋コンパクト表示。
   *  ・「固定」ボタンでON/OFF、「隠す」ボタンで追従中の折りたたみが可能。
   * ======================================================================= */
  function initSticky() {
    var bar = $(".cmp-filters");
    if (!bar) return;

    /* --- 1) sticky を妨げる overflow:hidden を解除 --- */
    var node = bar.parentElement;
    while (node && node !== document.body) {
      var st = getComputedStyle(node);
      if (st.overflowY === "hidden" || st.overflow === "hidden") node.style.overflow = "visible";
      if (st.overflowX === "hidden" && st.overflowY === "visible") node.style.overflowX = "clip";
      node = node.parentElement;
    }

    /* --- 2) 操作バー（固定ON/OFF・折りたたみ）--- */
    var pin = document.createElement("div");
    pin.className = "cmp-pinbar";
    pin.innerHTML =
      '<span id="pinHint">スクロールしてもフィルターは画面上部に固定されます</span>' +
      '<span class="spacer"></span>' +
      '<button type="button" id="btnCollapse">隠す</button>' +
      '<button type="button" id="btnPin" class="on">📌 固定中</button>';
    bar.appendChild(pin);

    var btnPin = pin.querySelector("#btnPin");
    var btnCol = pin.querySelector("#btnCollapse");

    btnPin.onclick = function () {
      var off = bar.classList.toggle("unpinned");
      btnPin.classList.toggle("on", !off);
      btnPin.textContent = off ? "固定OFF" : "📌 固定中";
      $("#pinHint").textContent = off
        ? "固定を解除しました（通常スクロール）"
        : "スクロールしてもフィルターは画面上部に固定されます";
      if (off) bar.classList.remove("stuck", "collapsed");
      try { localStorage.setItem("cmp:pin", off ? "0" : "1"); } catch (e) {}
    };

    btnCol.onclick = function () {
      var col = bar.classList.toggle("collapsed");
      btnCol.textContent = col ? "表示" : "隠す";
    };

    /* 前回の固定ON/OFF設定を復元 */
    try {
      if (localStorage.getItem("cmp:pin") === "0") btnPin.click();
    } catch (e) {}

    /* --- 3) 追従開始の検知（センチネル）--- */
    var sent = document.createElement("div");
    sent.className = "cmp-sticky-sentinel";
    bar.parentNode.insertBefore(sent, bar);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (bar.classList.contains("unpinned")) return;
          bar.classList.toggle("stuck", !e.isIntersecting);
        });
      }, { threshold: [1] }).observe(sent);
    } else {
      /* フォールバック（IE系など）: スクロール量で判定 */
      var base = sent.offsetTop;
      var sc = bar.closest(".main") || window;
      (sc.addEventListener ? sc : window).addEventListener("scroll", function () {
        if (bar.classList.contains("unpinned")) return;
        var y = (sc === window) ? window.pageYOffset : sc.scrollTop;
        bar.classList.toggle("stuck", y > base);
      });
    }
  }

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

  /* 選択中の期間を説明文用に整形 */
  function periodText(side) {
    var p = PERIOD[side];
    return "期間: " + (p.from || "—") + " 〜 " + (p.to || "—");
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
    $("#descA").textContent = periodText("A") + " ／ " + FD.describe(ST.A);
    $("#descB").textContent = periodText("B") + " ／ " + FD.describe(ST.B);
  }

  function clearSide(side) {
    FD.KEYS.forEach(function (g) { ST[side][g.k].clear(); });
    document.querySelectorAll("#flt" + side + " .gf-dd-opt input:checked").forEach(function (cb) { cb.checked = false; });
    resetPeriod(side);                 /* 期間も全期間へ戻す */
    updateSum(); render();
  }

  function swapSides() {
    var tmp = ST.A; ST.A = ST.B; ST.B = tmp;
    var tp = PERIOD.A; PERIOD.A = PERIOD.B; PERIOD.B = tp;   /* 期間も一緒に入れ替える */
    ["A", "B"].forEach(function (side) {
      var f = $("#pFrom" + side), t = $("#pTo" + side);
      if (f) f.value = PERIOD[side].from || "";
      if (t) t.value = PERIOD[side].to || "";
    });
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
    /* A と B で期間が異なるため、日付軸は両期間の和集合（最小〜最大）で作る */
    var ds = baseRows("A").concat(baseRows("B"))
      .map(function (r) { return toDate(r[FLD.added]); }).filter(Boolean)
      .sort(function (x, y) { return x - y; });
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
      /* solo 指定の項目は左列のみに単独表示（CSS 側で次項目を次行へ送る） */
      host.insertAdjacentHTML("beforeend",
        '<div class="panel cmp-panel' + (c.solo ? ' solo' : '') + '">' +
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
    /* 分母は「その側の期間内の全件」＝期間も A/B で独立しているため側ごとに算出 */
    $("#cntA").textContent = rowsA.length + " / " + baseRows("A").length + " 名";
    $("#cntB").textContent = rowsB.length + " / " + baseRows("B").length + " 名";
    renderKPI(rowsA, rowsB);
    renderLine(rowsA, rowsB);
    renderCharts(rowsA, rowsB);
  }

  /* ===================== 起動 ===================== */
  function initPeriod() {
    var ds = RAW.map(function (r) { return toDate(r[FLD.added]); }).filter(Boolean).sort(function (a, b) { return a - b; });
    if (!ds.length) return;
    DOMAIN.from = dayKey(ds[0]);
    DOMAIN.to   = dayKey(ds[ds.length - 1]);
    ["A", "B"].forEach(function (side) {
      PERIOD[side].from = DOMAIN.from;
      PERIOD[side].to   = DOMAIN.to;
      var f = $("#pFrom" + side), t = $("#pTo" + side);
      if (!f || !t) return;
      f.value = DOMAIN.from; t.value = DOMAIN.to;
      f.min = t.min = DOMAIN.from; f.max = t.max = DOMAIN.to;
      f.onchange = function () { PERIOD[side].from = f.value; updateSum(); render(); };
      t.onchange = function () { PERIOD[side].to   = t.value; updateSum(); render(); };
    });
  }
  /* 期間を A / B 個別にデータ全体の範囲へ戻す */
  function resetPeriod(side) {
    PERIOD[side].from = DOMAIN.from;
    PERIOD[side].to   = DOMAIN.to;
    var f = $("#pFrom" + side), t = $("#pTo" + side);
    if (f) f.value = DOMAIN.from;
    if (t) t.value = DOMAIN.to;
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
      initSticky();          /* ← ウィンドウ枠の固定 */
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
