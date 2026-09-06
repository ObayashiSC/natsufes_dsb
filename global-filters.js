/* =========================================================================
 *  global-filters.js — グローバルフィルター（性別 / 年代 / 居住地 / 勤務地）
 *  ------------------------------------------------------------------------
 *  ★仕様変更（今回）:
 *    ・フィルターUIを「左サイドバー」（Analyticsメニューの下・Data sourceの上）へ
 *      まとめて配置する。
 *    ・期間フィルター（.slider-panel）もサイドバー内へ物理移動する。
 *    ・日付以外（性別 / 年代 / 居住地 / 勤務地）は「複数選択できるプルダウン」に
 *      変更（従来のチップ式は廃止）。
 *
 *  ・状態は window.GFilter に集約。app.js（KPI/折れ線/属性/流入/行動）と
 *    geo-section.js（居住地・勤務地）の両方が、この単一の状態で絞り込む。
 *
 *  依存: window.DashCore（state.RAW を参照）
 *  通知: 変更時に (1) 購読コールバック (2) window 'globalfilters:change' を発火
 * ======================================================================= */
window.GFilter = (function () {
  "use strict";

  /* ---- 実データのフィールド名（config.js と一致）---- */
  var FLD = {
    gender: "Q1_単一選択",
    birth:  "Q2_年月日入力",
    wrk:    "Q3_単一選択",
    res:    "Q4_単一選択",
  };

  /* ---- 表記ゆれ吸収（「エリアのビル」↔「エリアビル」）---- */
  function normB(s) { return String(s || "").replace(/エリアのビル/g, "エリアビル").trim(); }

  /* ---- 選択肢の並び順（存在するものだけ選択肢化する）---- */
  var ORDER = {
    gender: ["男性", "女性", "回答しない"],
    age:    ["〜19歳", "20代", "30代", "40代", "50代", "60代〜"],
    res:    ["東京23区", "東京都23区外", "神奈川県", "千葉県", "埼玉県", "上記以外の都道府県"],
    wrk:    ["品川IC", "品川GC", "ICGC以外の品川所在ビル", "その他"],
  };

  /* ---- 居住エリア(Q4) → グループ（geo-section.js と同一定義）---- */
  var RES_GROUP_MAP = {
    "東京都港区(徒歩圏)": "東京23区",
    "東京都港区(徒歩圏外)": "東京23区",
    "東京都品川区（徒歩圏）": "東京23区",
    "東京都品川区（徒歩圏外）": "東京23区",
    "東京都大田区・目黒区": "東京23区",
    "東京都千代田区・中央区": "東京23区",
    "東京都渋谷区・新宿区・豊島区・文京区": "東京23区",
    "東京都墨田区・台東区・葛飾区・江戸川区・江東区": "東京23区",
    "東京都世田谷区・中野区・杉並区・練馬区": "東京23区",
    "東京都荒川区・板橋区・足立区・北区": "東京23区",
    "東京都その他": "東京都23区外",
    "神奈川県横浜市": "神奈川県",
    "神奈川県川崎市": "神奈川県",
    "神奈川県その他": "神奈川県",
    "千葉県": "千葉県",
    "埼玉県": "埼玉県",
    "上記以外の都道府県": "上記以外の都道府県",
  };

  /* ---- 所属ビル(Q3) → グループ（normB 正規化キー）---- */
  var WRK_GROUP_MAP = {
    "品川インターシティA棟": "品川IC",
    "品川インターシティB棟": "品川IC",
    "品川インターシティC棟": "品川IC",
    "品川イーストワンタワー": "品川GC",
    "太陽生命品川ビル": "品川GC",
    "品川グランドセントラルタワー": "品川GC",
    "NBF品川タワー": "品川GC",
    "キヤノンSタワー": "品川GC",
    "京王品川ビル": "品川GC",
    "品川シーズンテラス": "ICGC以外の品川所在ビル",
    "品川港南エリアビル": "ICGC以外の品川所在ビル",
    "品川高輪エリアビル": "ICGC以外の品川所在ビル",
    "北品川エリアビル": "ICGC以外の品川所在ビル",
    "天王洲エリアビル": "ICGC以外の品川所在ビル",
    "上記以外の東京都内ビル": "その他",
    "その他": "その他",
  };

  /* ===================== 導出関数 ===================== */
  function ageBand(birth) {
    if (!birth) return "";
    var bd = new Date(String(birth).replace(/\//g, "-"));
    if (isNaN(bd) || bd.getFullYear() < 1900) return "";
    var t = new Date();
    var age = t.getFullYear() - bd.getFullYear();
    if (t < new Date(t.getFullYear(), bd.getMonth(), bd.getDate())) age--;
    if (age <= 0 || age > 120) return "";
    if (age < 20) return "〜19歳";
    if (age < 30) return "20代";
    if (age < 40) return "30代";
    if (age < 50) return "40代";
    if (age < 60) return "50代";
    return "60代〜";
  }
  function resGroupOf(r) { return RES_GROUP_MAP[r[FLD.res]] || ""; }
  function wrkGroupOf(r) { return WRK_GROUP_MAP[normB(r[FLD.wrk])] || ""; }

  /* ===================== 状態 ===================== */
  var STATE = { gender: new Set(), age: new Set(), res: new Set(), wrk: new Set() };
  var subscribers = [];

  function active() {
    return STATE.gender.size + STATE.age.size + STATE.res.size + STATE.wrk.size > 0;
  }
  function matches(r) {
    if (STATE.gender.size && !STATE.gender.has(r[FLD.gender])) return false;
    if (STATE.age.size    && !STATE.age.has(ageBand(r[FLD.birth]))) return false;
    if (STATE.res.size    && !STATE.res.has(resGroupOf(r))) return false;
    if (STATE.wrk.size    && !STATE.wrk.has(wrkGroupOf(r))) return false;
    return true;
  }
  function filter(rows) { return active() ? (rows || []).filter(matches) : (rows || []); }

  function notify() {
    renderSelected();
    subscribers.forEach(function (cb) { try { cb(); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent("globalfilters:change")); } catch (e) {}
  }
  function subscribe(cb) { if (typeof cb === "function") subscribers.push(cb); }

  /* ===================== UI 定義 ===================== */
  var KEYS = [
    { k: "gender", label: "性別",   order: ORDER.gender, of: function (r) { return r[FLD.gender]; } },
    { k: "age",    label: "年代",   order: ORDER.age,    of: function (r) { return ageBand(r[FLD.birth]); } },
    { k: "res",    label: "居住地", order: ORDER.res,    of: resGroupOf },
    { k: "wrk",    label: "勤務地", order: ORDER.wrk,    of: wrkGroupOf },
  ];

  /* ---- サイドバーへフィルターパネルを注入し、期間フィルターを内部へ移動 ---- */
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
      '<div class="gf-selected" id="gfSelected">選択中のフィルタはありません（全件表示）。</div>';

    // Data source フッターの直前に差し込む（無ければ末尾）
    var foot = sidebar.querySelector(".side-foot");
    if (foot) sidebar.insertBefore(bar, foot);
    else sidebar.appendChild(bar);

    // 既存の期間フィルター（.slider-panel）をパネル先頭へ物理移動する。
    // ノードごと動かすため noUiSlider の実体や dashboard-core.js のイベントはそのまま生きる。
    var period = document.getElementById("gfPeriod");
    var slider = document.querySelector(".slider-panel");
    if (period && slider && slider.parentNode !== period) {
      slider.classList.add("gf-period-panel");
      period.appendChild(slider);
    }

    var clr = document.getElementById("gfClear");
    if (clr) clr.onclick = clearAll;

    // 外側クリックで開いているプルダウンを閉じる
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".gf-dd")) closeAllPops();
    });

    return true;
  }

  function distinct(fn, order) {
    var raw = (window.DashCore && DashCore.state && DashCore.state.RAW) || [];
    var present = new Set();
    raw.forEach(function (r) { var v = fn(r); if (v) present.add(v); });
    var out = order.filter(function (v) { return present.has(v); });
    present.forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); });
    return out;
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
    KEYS.forEach(function (g) {
      var pop = document.getElementById("gfpop_" + g.k);
      var btn = document.getElementById("gfbtn_" + g.k);
      if (!pop || !btn) return;

      // トグル
      btn.onclick = function (e) { e.stopPropagation(); togglePop(g.k); };

      // オプション（0件の選択肢は出さない：実データに存在するものだけ）
      pop.innerHTML = "";
      distinct(g.of, g.order).forEach(function (v) {
        var lab = document.createElement("label");
        lab.className = "gf-dd-opt";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = v;
        cb.checked = STATE[g.k].has(v);
        cb.onchange = function () {
          var set = STATE[g.k];
          if (cb.checked) set.add(v); else set.delete(v);
          updateSummary(g);
          notify();
        };
        var span = document.createElement("span");
        span.textContent = v;
        lab.appendChild(cb);
        lab.appendChild(span);
        pop.appendChild(lab);
      });

      updateSummary(g);
    });
    renderSelected();
  }

  /* ---- 各プルダウンのボタン表示（選択サマリ）を更新 ---- */
  function updateSummary(g) {
    var el = document.getElementById("gfsum_" + g.k);
    var dd = document.getElementById("gfdd_" + g.k);
    if (!el) return;
    var set = STATE[g.k];
    if (!set.size) {
      el.textContent = "すべて";
      if (dd) dd.classList.remove("has");
    } else if (set.size === 1) {
      el.textContent = Array.from(set)[0];
      if (dd) dd.classList.add("has");
    } else {
      el.textContent = set.size + "件選択";
      if (dd) dd.classList.add("has");
    }
  }

  /* ---- 選択中サマリ（全体）---- */
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
    // チェックを外す
    document.querySelectorAll("#gfilterBar .gf-dd-opt input:checked").forEach(function (cb) { cb.checked = false; });
    KEYS.forEach(function (g) { updateSummary(g); });
    notify();
  }

  /* 実際に描画された件数を受け取ってカウンタ表示（app.js から呼ばれる）*/
  function report(shown, total) {
    var el = document.getElementById("gfCount");
    if (!el) return;
    el.textContent = active() ? ("該当 " + shown + " / " + total + " 名") : "全件表示";
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

  /* ===================== 公開 API ===================== */
  return {
    filter: filter,
    matches: matches,
    active: active,
    subscribe: subscribe,
    report: report,
    clear: clearAll,
    state: STATE,
  };
})();
