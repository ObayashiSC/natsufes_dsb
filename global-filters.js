/* =========================================================================
 *  global-filters.js — グローバルフィルター（左サイドバー配置）
 *  ------------------------------------------------------------------------
 *  ★今回の変更:
 *    ① フィルター項目に「徒歩圏 / 徒歩圏外」を追加
 *    ② 「勤務地」（サマリ）に加えて「勤務地(詳細)」（ビル単位）を追加
 *    ③ 比較モード（compare.html）への導線ボタンを追加
 *    ・項目定義・マッピング類は filter-defs.js（window.FilterDefs）に集約。
 *      → 本ファイルは UI と状態管理のみを担当する。
 *
 *  ・状態は window.GFilter に集約。app.js（KPI/折れ線/属性/流入/行動）と
 *    geo-section.js（居住地・勤務地）の両方が、この単一の状態で絞り込む。
 *
 *  依存: window.FilterDefs（本ファイルより前に読み込むこと）/ window.DashCore
 *  通知: 変更時に (1) 購読コールバック (2) window 'globalfilters:change' を発火
 * ======================================================================= */
window.GFilter = (function () {
  "use strict";

  var FD = window.FilterDefs;
  if (!FD) { console.error("[gfilter] filter-defs.js が読み込まれていません"); return {}; }

  var KEYS  = FD.KEYS;
  var STATE = FD.newState();
  var subscribers = [];

  /* ===================== 判定 / 絞り込み ===================== */
  function active()        { return FD.activeCount(STATE) > 0; }
  function matches(r)      { return FD.matches(STATE, r); }
  function filter(rows)    { return FD.filter(STATE, rows); }

  function notify() {
    renderSelected();
    subscribers.forEach(function (cb) { try { cb(); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent("globalfilters:change")); } catch (e) {}
  }
  function subscribe(cb) { if (typeof cb === "function") subscribers.push(cb); }

  /* ===================== UI 注入 ===================== */
  function injectBar() {
    if (document.getElementById("gfilterBar")) return true;
    var sidebar = document.querySelector(".sidebar");
    if (!sidebar) return false;

    var bar = document.createElement("section");
    bar.className = "side-filter";
    bar.id = "gfilterBar";

    var dds = KEYS.map(function (g) {
      return (
        '<div class="gf-dd" id="gfdd_' + g.k + '" data-key="' + g.k + '">' +
          '<button type="button" class="gf-dd-btn" id="gfbtn_' + g.k + '" aria-expanded="false">' +
            '<span class="gf-dd-cap">' + g.label + '</span>' +
            '<span class="gf-dd-sum" id="gfsum_' + g.k + '">すべて</span>' +
            '<span class="gf-dd-arrow" aria-hidden="true">▾</span>' +
          '</button>' +
          '<div class="gf-dd-pop" id="gfpop_' + g.k + '" hidden></div>' +
        '</div>'
      );
    }).join("");

    bar.innerHTML =
      '<div class="gf-head">' +
        '<span class="gf-title">🔎 フィルター</span>' +
        '<button type="button" class="gf-clear" id="gfClear">クリア</button>' +
      '</div>' +
      '<div class="gf-count" id="gfCount">全件表示</div>' +
      '<div class="gf-period" id="gfPeriod"></div>' +   /* ← 期間フィルターをここへ移動 */
      '<div class="gf-dds">' + dds + '</div>' +
      '<a class="gf-compare" id="gfCompare" href="compare.html">⇄ 比較モードを開く</a>' +
      '<div class="gf-selected" id="gfSelected">選択中のフィルタはありません（全件表示）。</div>';

    var foot = sidebar.querySelector(".side-foot");
    if (foot) sidebar.insertBefore(bar, foot);
    else sidebar.appendChild(bar);

    // 既存の期間フィルター（.slider-panel）をパネル先頭へ物理移動する。
    var period = document.getElementById("gfPeriod");
    var slider = document.querySelector(".slider-panel");
    if (period && slider && slider.parentNode !== period) {
      slider.classList.add("gf-period-panel");
      period.appendChild(slider);
    }

    var clr = document.getElementById("gfClear");
    if (clr) clr.onclick = clearAll;

    // 比較モードへは現在の絞り込みを A フィルターの初期値として引き継ぐ
    var cmp = document.getElementById("gfCompare");
    if (cmp) cmp.onclick = function () {
      try { sessionStorage.setItem("gfilter:A", JSON.stringify(serialize())); } catch (e) {}
    };

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".gf-dd")) closeAllPops();
    });
    return true;
  }

  function closeAllPops() {
    KEYS.forEach(function (g) {
      var pop = document.getElementById("gfpop_" + g.k);
      var dd  = document.getElementById("gfdd_" + g.k);
      var btn = document.getElementById("gfbtn_" + g.k);
      if (pop) pop.hidden = true;
      if (dd) dd.classList.remove("open");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function togglePop(k) {
    var pop = document.getElementById("gfpop_" + k);
    var dd  = document.getElementById("gfdd_" + k);
    var btn = document.getElementById("gfbtn_" + k);
    if (!pop) return;
    var willOpen = pop.hidden;
    closeAllPops();
    if (willOpen) {
      pop.hidden = false;
      if (dd) dd.classList.add("open");
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
  }

  /* ---- プルダウン（複数選択チェックボックス）を構築 ---- */
  function buildDropdowns() {
    var raw = (window.DashCore && DashCore.state && DashCore.state.RAW) || [];
    KEYS.forEach(function (g) {
      var pop = document.getElementById("gfpop_" + g.k);
      var btn = document.getElementById("gfbtn_" + g.k);
      if (!pop || !btn) return;

      btn.onclick = function (e) { e.stopPropagation(); togglePop(g.k); };

      pop.innerHTML = "";
      FD.optionsFor(g, raw).forEach(function (v) {
        var lab = document.createElement("label");
        lab.className = "gf-dd-opt";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = v;
        cb.checked = STATE[g.k].has(v);
        cb.onchange = function () {
          if (cb.checked) STATE[g.k].add(v); else STATE[g.k].delete(v);
          updateSummary(g);
          notify();
        };
        var span = document.createElement("span");
        span.textContent = v;
        lab.appendChild(cb); lab.appendChild(span);
        pop.appendChild(lab);
      });
      updateSummary(g);
    });
    renderSelected();
  }

  function updateSummary(g) {
    var el = document.getElementById("gfsum_" + g.k);
    var dd = document.getElementById("gfdd_" + g.k);
    if (!el) return;
    var set = STATE[g.k];
    if (!set.size)            { el.textContent = "すべて";               if (dd) dd.classList.remove("has"); }
    else if (set.size === 1)  { el.textContent = Array.from(set)[0];     if (dd) dd.classList.add("has"); }
    else                      { el.textContent = set.size + "件選択";     if (dd) dd.classList.add("has"); }
  }

  function renderSelected() {
    var el = document.getElementById("gfSelected");
    if (!el) return;
    var parts = [];
    KEYS.forEach(function (g) {
      var set = STATE[g.k];
      if (set.size) {
        parts.push('<b>' + g.label + ':</b> ' +
          Array.from(set).map(function (v) { return '<span class="gf-seltag">' + v + '</span>'; }).join(""));
      }
    });
    el.innerHTML = parts.length ? parts.join('<span class="gf-sep">／</span>')
                                : "選択中のフィルタはありません（全件表示）。";
  }

  function clearAll() {
    KEYS.forEach(function (g) { STATE[g.k].clear(); });
    document.querySelectorAll("#gfilterBar .gf-dd-opt input:checked").forEach(function (cb) { cb.checked = false; });
    KEYS.forEach(function (g) { updateSummary(g); });
    notify();
  }

  function report(shown, total) {
    var el = document.getElementById("gfCount");
    if (!el) return;
    el.textContent = active() ? ("該当 " + shown + " / " + total + " 名") : "全件表示";
  }

  /* 比較モードへの受け渡し用（Set → 配列） */
  function serialize() {
    var o = {};
    KEYS.forEach(function (g) { o[g.k] = Array.from(STATE[g.k]); });
    return o;
  }

  /* ===================== 起動 ===================== */
  function boot() {
    injectBar();
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var ready = window.DashCore && window.DashCore.state && Array.isArray(window.DashCore.state.RAW) && window.DashCore.state.RAW.length;
      if (injectBar() && ready) { clearInterval(timer); buildDropdowns(); }
      else if (tries > 100) { clearInterval(timer); }
    }, 120);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  return {
    filter: filter, matches: matches, active: active,
    subscribe: subscribe, report: report, clear: clearAll,
    serialize: serialize, state: STATE,
  };
})();
