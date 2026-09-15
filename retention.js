/* =========================================================================
 *  retention.js — リテンション施策ダッシュボード（ページ固有ロジック）
 *  ------------------------------------------------------------------------
 *  retention_report.py が出力する retention_result_YYYYMMDD.json の
 *  summary ブロック（label → channel → method の3階層）を描画する。
 *
 *  ・サイドバーの「リテンションフィルタ」で label を切り替える。
 *  ・KPI は 全体 → channel 全体 の順に段組みで表示。
 *  ・ファネルは method ごとに 棒(件数) + 折れ線(構成比%) の複合グラフ。
 *  ・open_count が無いチャネル（DROP 等）は開封段を自動で省略する。
 *
 *  カラー: LINE=緑(acq) / DROP=青(attr) / 全体=グレー(gray)
 *  依存: Chart.js / config-retention.js
 * ======================================================================= */
(function () {
  "use strict";

  var CFG = window.RETENTION_CONFIG || {};

  /* ---- 共通パレット（styles.css の CSS変数に対応・dashboard-core.js と同値）---- */
  var C = {
    attr: "#3f66b3", acq: "#2f8f66", gray: "#64748b",
    ratio: "#c2643c",                       /* 構成比の折れ線 = compare.css の B色 */
    grid: "rgba(16,24,40,.08)", tick: "#5b636c",
  };

  var DATA = null;
  var loadedFrom = null;   /* 実際に読み込めたJSONのパス */
  var charts = {};
  var currentLabel = null;

  /* ========================= DOM / 汎用ヘルパー ========================= */
  var $ = function (s) { return document.querySelector(s); };

  function setText(sel, txt) {
    var el = $(sel);
    if (!el) { console.warn("[retention] 要素が見つかりません: " + sel); return false; }
    el.textContent = txt;
    return true;
  }
  function setHTML(sel, html) {
    var el = $(sel);
    if (!el) { console.warn("[retention] 要素が見つかりません: " + sel); return false; }
    el.innerHTML = html;
    return true;
  }
  /* 1 箇所の失敗で画面全体を止めないための安全実行（dashboard-core.js と同方針）*/
  function safe(label, fn) {
    try { fn(); } catch (e) { console.error("[retention] " + label + " でエラー:", e); }
  }

  var fmtN = function (v) {
    return (v === null || v === undefined) ? "–" : Number(v).toLocaleString("ja-JP");
  };
  var fmtP = function (v) {
    return (v === null || v === undefined) ? "–" : (v * 100).toFixed(1) + " %";
  };
  /* "20260911" → "9/11"（KPIキャプションの可読性向上）*/
  var fmtDate = function (s) {
    var m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || ""));
    return m ? Number(m[2]) + "/" + Number(m[3]) : (s || "");
  };

  /* チャネル → アクセント名（acq / attr / gray）*/
  function accentOf(ch) {
    return (CFG.channelAccent && CFG.channelAccent[ch]) || "gray";
  }
  function colorOf(ch) { return C[accentOf(ch)] || C.gray; }

  /* config の channelOrder 順に並べ、未定義チャネルは末尾へ */
  function sortChannels(names) {
    var order = CFG.channelOrder || [];
    return names.slice().sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia < 0) ia = 999;
      if (ib < 0) ib = 999;
      return ia - ib || a.localeCompare(b);
    });
  }

  /* ========================= KPI ========================= */
  /* ShopDrop 版 renderKPIs と同じ組み立て（.kpi / .k-label / .k-val / .k-cap）*/
  function kpiTiles(metrics, accent) {
    return (CFG.kpis || []).map(function (k) {
      var v = metrics[k.key];
      var na = (v === null || v === undefined);
      var cls = "kpi " + (accent || "") + (na ? " na" : "");
      var val = na ? CFG.emptyLabel : (k.pct ? fmtP(v) : fmtN(v));
      return '' +
        '<div class="' + cls + '">' +
          '<div class="k-label">' + k.label + '</div>' +
          '<div class="k-val">' + val + '</div>' +
          '<div class="k-cap">' + k.caption + '</div>' +
        '</div>';
    }).join("");
  }

  /* ブロック増加数タイル（LINEのみ）。block_trend は label ではなく
     LINE友だち一覧の記録期間に紐づく指標のため、値は全 label 共通。*/
  function blockTile(accent) {
    var bt = DATA && DATA.block_trend;
    var cfg = CFG.blockKpi || {};
    if (!bt || bt.block_increase === null || bt.block_increase === undefined) {
      return '<div class="kpi ' + accent + ' na">' +
        '<div class="k-label">' + (cfg.label || "ブロック増加数") + '</div>' +
        '<div class="k-val">' + CFG.emptyLabel + '</div>' +
        '<div class="k-cap">' + (cfg.caption || "") + '</div></div>';
    }
    var inc = bt.block_increase;
    var sign = inc > 0 ? "+" : "";
    /* 増加は好ましくないため注意色(attr)ではなくwarnクラスで表現 */
    var rate = (bt.block_rate_increase === null || bt.block_rate_increase === undefined)
      ? "" : "（率 " + (bt.block_rate_increase > 0 ? "+" : "") +
             (bt.block_rate_increase * 100).toFixed(1) + "pt）";
    var span = (bt.first && bt.latest)
      ? fmtDate(bt.first.record_date) + " → " + fmtDate(bt.latest.record_date) : "";
    return '' +
      '<div class="kpi ' + accent + (inc > 0 ? " blk-up" : "") + '">' +
        '<div class="k-label">' + (cfg.label || "ブロック増加数") + '</div>' +
        '<div class="k-val">' + sign + fmtN(inc) + '</div>' +
        '<div class="k-cap">' + span + " " + rate + '</div>' +
      '</div>';
  }

  function tierLabel(name, accent, countText) {
    var cls = accent === "acq" ? "t-acq" : accent === "attr" ? "t-attr" : "t-all";
    return '' +
      '<div class="ret-tier ' + cls + '">' +
        '<span class="tier-name">' + name + '</span>' +
        '<span class="tier-count">' + countText + '</span>' +
      '</div>';
  }

  /* ========================= ファネル図 ========================= */
  /* 段の構成を metrics から組み立てる。optional かつ値なしの段は省く。*/
  function stepsOf(metrics) {
    var out = [];
    (CFG.funnelSteps || []).forEach(function (s) {
      var v = metrics[s.key];
      if (s.optional && (v === null || v === undefined)) return;
      out.push({ label: s.label, value: v === null || v === undefined ? 0 : v });
    });
    return out;
  }

  function drawFunnel(canvasId, metrics, ch) {
    if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
    var el = document.getElementById(canvasId);
    if (!el) { console.warn("[retention] canvas #" + canvasId + " が見つかりません"); return; }

    var steps = stepsOf(metrics);
    var denom = CFG.ratioBase === "base"
      ? (metrics.base_count || steps[0].value || 1)
      : (steps[0].value || 1);
    var color = colorOf(ch);

    charts[canvasId] = new Chart(el.getContext("2d"), {
      data: {
        labels: steps.map(function (s) { return s.label; }),
        datasets: [
          {
            type: "bar", label: "件数", order: 2, yAxisID: "y",
            data: steps.map(function (s) { return s.value; }),
            backgroundColor: color, borderRadius: 0,
            barThickness: 26, maxBarThickness: 34,
          },
          {
            type: "line", label: "構成比", order: 1, yAxisID: "y1",
            data: steps.map(function (s) { return Math.round(s.value / denom * 1000) / 10; }),
            borderColor: C.ratio, backgroundColor: C.ratio,
            borderWidth: 2.4, tension: .3,
            pointRadius: 4, pointBackgroundColor: C.ratio,
            pointBorderColor: "#ffffff", pointBorderWidth: 2, fill: false,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 500, easing: "easeOutQuart" },
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            backgroundColor: "#1b1f24", borderColor: "#2a3038", borderWidth: 1,
            titleColor: "#e8ecef", bodyColor: "#c9d1d9",
            padding: 10, cornerRadius: 8, displayColors: false,
            callbacks: {
              label: function (cx) {
                return cx.dataset.yAxisID === "y1"
                  ? "構成比: " + cx.parsed.y.toFixed(1) + " %"
                  : "件数: " + fmtN(cx.parsed.y);
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: C.tick, font: { size: 11 }, autoSkip: false } },
          y: {
            beginAtZero: true, position: "left",
            grid: { color: C.grid, drawBorder: false },
            ticks: { color: C.tick, font: { size: 11 }, precision: 0 },
            title: { display: true, text: "件数", color: C.tick, font: { size: 10 } },
          },
          y1: {
            beginAtZero: true, max: 100, position: "right",
            grid: { drawOnChartArea: false },
            ticks: { color: C.tick, font: { size: 11 }, callback: function (v) { return v + "%"; } },
            title: { display: true, text: "構成比(%)", color: C.tick, font: { size: 10 } },
          },
        },
      },
    });
  }

  /* パネル枠（dashboard-core.js の panelCanvas と同じ構造）*/
  function panelCanvas(title, id, sub, solo) {
    return '' +
      '<div class="panel' + (solo ? " solo" : "") + '">' +
        '<div class="panel-head"><h3>' + title + '</h3><span class="sub">' + sub + '</span></div>' +
        '<div class="ret-box"><canvas id="' + id + '"></canvas></div>' +
      '</div>';
  }

  /* ========================= 明細テーブル ========================= */
  function renderTable(channels, data) {
    var rows = "";
    channels.forEach(function (ch) {
      var acc = accentOf(ch);
      var methods = data.channels[ch].methods;
      Object.keys(methods).forEach(function (mn) {
        var m = methods[mn];
        rows += '<tr>' +
          '<td class="ch-' + acc + '">' + ch + '</td>' +
          '<td>' + mn + '</td>' +
          '<td>' + fmtN(m.base_count) + '</td>' +
          '<td>' + fmtN(m.message_delivery_count) + '</td>' +
          '<td' + (m.open_count === null ? ' class="na"' : '') + '>' +
            (m.open_count === null ? CFG.emptyLabel : fmtN(m.open_count)) + '</td>' +
          '<td' + (m.open_rate === null ? ' class="na"' : '') + '>' + fmtP(m.open_rate) + '</td>' +
          '<td>' + fmtN(m.transition_users) + '</td>' +
          '<td>' + fmtP(m.transition_rate) + '</td>' +
          '<td>' + fmtN(m.reservation_users) + '</td>' +
          '<td>' + fmtP(m.reservation_rate) + '</td>' +
        '</tr>';
      });
    });

    setHTML("#retTable",
      '<table class="ret-table"><thead><tr>' +
        '<th>channel</th><th>method</th><th>リテンション数</th><th>送信数</th>' +
        '<th>開封数</th><th>開封率</th><th>遷移数</th><th>遷移率</th>' +
        '<th>予約数</th><th>予約率</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>');
  }

  /* ========================= 全体描画 ========================= */
  function render(label) {
    currentLabel = label;
    Object.keys(charts).forEach(function (k) { charts[k].destroy(); delete charts[k]; });

    var d = DATA.summary.by_label[label];
    var channels = sortChannels(Object.keys(d.channels));

    /* --- 1) 全体 KPI --- */
    setHTML("#kpisAll", kpiTiles(d.overall, "gray"));
    setText("#kpiMeta", "全体 " + fmtN(d.overall.base_count) + "名 / " + channels.length + " チャネル");

    /* --- 2) チャネルごとの KPI + method 別ファネル --- */
    var host = $("#retChannels");
    host.innerHTML = "";

    channels.forEach(function (ch) {
      var cd = d.channels[ch];
      var acc = accentOf(ch);
      var methods = Object.keys(cd.methods);

      host.insertAdjacentHTML("beforeend",
        tierLabel(ch + " 全体", acc, fmtN(cd.total.base_count) + "名"));
      /* LINE 段だけブロック増加数を加えて 5 タイルにする */
      var isBlockCh = (ch === (CFG.blockKpiChannel || "LINE"));
      var tiles = kpiTiles(cd.total, acc) + (isBlockCh ? blockTile(acc) : "");
      host.insertAdjacentHTML("beforeend",
        '<section class="kpis' + (isBlockCh ? " kpis-5" : "") + '">' + tiles + '</section>');

      var cls = acc === "acq" ? "t-acq" : acc === "attr" ? "t-attr" : "t-all";
      var panels = methods.map(function (mn, i) {
        var m = cd.methods[mn];
        var sub = (m.open_count === null)
          ? "送信 → 遷移 → 予約（開封数は" + CFG.emptyLabel + "）"
          : "送信 → 開封 → 遷移 → 予約";
        return panelCanvas(ch + "：" + mn, "ret_" + ch + "_" + i, sub, methods.length === 1);
      }).join("");
      host.insertAdjacentHTML("beforeend", '<section class="ret-grid ' + cls + '">' + panels + '</section>');

      methods.forEach(function (mn, i) {
        drawFunnel("ret_" + ch + "_" + i, cd.methods[mn], ch);
      });
    });

    /* --- 3) 明細テーブル --- */
    safe("明細テーブル", function () { renderTable(channels, d); });
  }

  /* ========================= サイドバーのフィルター ========================= */
  /*  filters.css の .side-filter / .gf-dd（単一選択版）を流用して構築する。 */
  function injectFilter(labels) {
    var sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    var bar = document.createElement("section");
    bar.className = "side-filter";
    bar.id = "retFilterBar";
    bar.innerHTML =
      '<div class="gf-head">' +
        '<span class="gf-title">🔎 リテンションフィルタ</span>' +
      '</div>' +
      '<div class="gf-count" id="retCount">–</div>' +
      '<div class="gf-dds">' +
        '<div class="gf-dd has" id="retDd">' +
          '<button type="button" class="gf-dd-btn" id="retBtn" aria-expanded="false">' +
            '<span class="gf-dd-cap">label</span>' +
            '<span class="gf-dd-sum" id="retSum">–</span>' +
            '<span class="gf-dd-arrow" aria-hidden="true">▾</span>' +
          '</button>' +
          '<div class="gf-dd-pop" id="retPop" hidden></div>' +
        '</div>' +
      '</div>' +
      '<div class="gf-note">label を切り替えると、全体・チャネル別の指標と' +
      'ファネルがすべて連動して再描画されます。</div>';

    var foot = sidebar.querySelector(".side-foot");
    if (foot) sidebar.insertBefore(bar, foot);
    else sidebar.appendChild(bar);

    var pop = $("#retPop"), btn = $("#retBtn"), dd = $("#retDd");

    btn.onclick = function (e) {
      e.stopPropagation();
      var willOpen = pop.hidden;
      pop.hidden = true; dd.classList.remove("open"); btn.setAttribute("aria-expanded", "false");
      if (willOpen) { pop.hidden = false; dd.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
    };
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".gf-dd")) { pop.hidden = true; dd.classList.remove("open"); }
    });

    labels.forEach(function (v) {
      var lab = document.createElement("label");
      lab.className = "gf-dd-opt";
      var cb = document.createElement("input");
      cb.type = "radio"; cb.name = "retLabel"; cb.value = v;
      cb.checked = (v === labels[0]);
      cb.onchange = function () {
        setText("#retSum", v);
        pop.hidden = true; dd.classList.remove("open");
        safe("再描画(label切替)", function () { render(v); });
        setText("#retCount", "対象 " + v);
      };
      var sp = document.createElement("span"); sp.textContent = v;
      lab.appendChild(cb); lab.appendChild(sp);
      pop.appendChild(lab);
    });

    setText("#retSum", labels[0]);
    setText("#retCount", "対象 " + labels[0]);
  }

  /* ========================= boot ========================= */
  async function boot() {
    if (typeof Chart === "undefined") {
      setHTML("#content",
        '<div class="state err">Chart.js の読み込みに失敗しました。<br>' +
        '<span style="color:var(--dim)">ネットワーク/CDN到達（インターネット接続）をご確認ください。</span></div>');
      return;
    }
    try {
      /* DATA_SOURCE を第一候補とし、旧仕様の日付付きファイルも順に試す。
         （config-retention.js がブラウザキャッシュに古いまま残っていても復旧できるようにする）*/
      var candidates = [CFG.DATA_SOURCE, "retention_result.json"].filter(Boolean);
      var res = null, tried = [];
      for (var i = 0; i < candidates.length; i++) {
        if (tried.indexOf(candidates[i]) >= 0) continue;
        tried.push(candidates[i]);
        var r = await fetch(candidates[i] + "?_=" + Date.now());
        if (r.ok) { res = r; loadedFrom = candidates[i]; break; }
      }
      if (!res) throw new Error("HTTP 404 / 試行したパス: " + tried.join(" , "));
      DATA = await res.json();

      if (!DATA.summary || !DATA.summary.labels || !DATA.summary.labels.length) {
        throw new Error("summary が見つかりません。retention_report.py を更新して再生成してください");
      }

      setText("#srcName", loadedFrom || CFG.DATA_SOURCE);
      setText("#genAt", (DATA.run_date || "–"));
      setText("#recCount", DATA.summary.labels.length.toLocaleString());
      setText("#gaSrc", DATA.ga_source_file || "–");

      injectFilter(DATA.summary.labels);
      render(DATA.summary.labels[0]);
    } catch (e) {
      console.error(e);
      /* fetch 失敗（file:// 直開き等）と描画エラーを切り分けて案内（dashboard-core.js と同方針）*/
      var is404 = /404/.test(e.message || "");
      var isFetch = (e instanceof TypeError) || /fetch|HTTP|Failed/.test(e.message || "");
      var msg = is404
        /* 404 = サーバは応答している＝file://問題ではない。パス不一致が原因。*/
        ? 'JSON が見つかりません（' + e.message + '）。<br>' +
          '<span style="color:var(--dim)">' +
          'HTML/CSS/JS は読めているので、サーバ自体は動いています。' +
          '<b>JSON のファイル名がこの場所と一致していない</b>ことが原因です。<br>' +
          '① リポジトリ直下の JSON 名が <code>' + CFG.DATA_SOURCE + '</code> と完全一致しているか（大文字小文字も区別されます）<br>' +
          '② <code>config-retention.js</code> が古いままキャッシュされていないか → ' +
          '<b>Ctrl+Shift+R</b> でスーパーリロード<br>' +
          '現在の設定値: <code>' + CFG.DATA_SOURCE + '</code></span>'
        : isFetch
        ? 'データの取得に失敗しました（' + e.message + '）。<br>' +
          '<span style="color:var(--dim)">HTML を直接ダブルクリックで開くとブラウザ制約で JSON を読めません。' +
          'フォルダ内で <code>python -m http.server</code> を起動し <b>http://localhost:8000/retention.html</b> ' +
          'からアクセスしてください。</span>'
        : '描画中にエラーが発生しました（' + e.message + '）。<br>' +
          '<span style="color:var(--dim)">ブラウザのキャッシュに古い HTML が残っている可能性があります。' +
          '<b>Ctrl+Shift+R（Mac は ⌘+Shift+R）でスーパーリロード</b>してください。</span>';
      setHTML("#content", '<div class="state err">' + msg + '</div>');
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
