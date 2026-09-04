/* =========================================================================
 *  global-filters.js — グローバルフィルター（性別 / 年代 / 居住地 / 勤務地）
 *  ------------------------------------------------------------------------
 *  ・期間フィルター（.slider-panel）の直下に、スクロール追従（sticky）の
 *    フィルターバーを自動挿入する。
 *  ・複数選択（チップ式）。選択中の内容を確認する枠を内蔵。
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

  /* ---- 選択肢の並び順（存在するものだけチップ化する）---- */
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

  /* ===================== UI 構築 ===================== */
  var KEYS = [
    { k: "gender", label: "性別",   order: ORDER.gender, of: function (r) { return r[FLD.gender]; } },
    { k: "age",    label: "年代",   order: ORDER.age,    of: function (r) { return ageBand(r[FLD.birth]); } },
    { k: "res",    label: "居住地", order: ORDER.res,    of: resGroupOf },
    { k: "wrk",    label: "勤務地", order: ORDER.wrk,    of: wrkGroupOf },
  ];

  function injectBar() {
    if (document.getElementById("gfilterBar")) return true;
    var anchor = document.querySelector(".slider-panel");
    if (!anchor) return false;
    var bar = document.createElement("section");
    bar.className = "panel gfilter-bar";
    bar.id = "gfilterBar";
    var groups = KEYS.map(function (g) {
      return (
        '<div class="gf-group">' +
          '<div class="gf-label">' + g.label +
            ' <span class="gf-badge" id="gfb_' + g.k + '" style="display:none"></span>' +
          '</div>' +
          '<div class="gf-chips" id="gf_' + g.k + '"></div>' +
        '</div>'
      );
    }).join("");
    bar.innerHTML =
      '<div class="gf-head">' +
        '<span class="gf-title">🔎 フィルター</span>' +
        '<span class="gf-count" id="gfCount">全件表示</span>' +
        '<button type="button" class="gf-clear" id="gfClear">クリア</button>' +
      '</div>' +
      '<div class="gf-grid">' + groups + '</div>' +
      '<div class="gf-selected" id="gfSelected">選択中のフィルタはありません（全件表示）。</div>';
    anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    var clr = document.getElementById("gfClear");
    if (clr) clr.onclick = clearAll;
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

  function buildChips() {
    KEYS.forEach(function (g) {
      var host = document.getElementById("gf_" + g.k);
      if (!host) return;
      host.innerHTML = "";
      distinct(g.of, g.order).forEach(function (v) {
        var c = document.createElement("span");
        c.className = "gf-chip";
        c.textContent = v;
        c.onclick = function () {
          var set = STATE[g.k];
          if (set.has(v)) { set.delete(v); c.classList.remove("on"); }
          else { set.add(v); c.classList.add("on"); }
          updateBadges();
          notify();
        };
        host.appendChild(c);
      });
    });
    updateBadges();
    renderSelected();
  }

  function updateBadges() {
    KEYS.forEach(function (g) {
      var b = document.getElementById("gfb_" + g.k);
      if (!b) return;
      var n = STATE[g.k].size;
      if (n) { b.style.display = ""; b.textContent = n; } else { b.style.display = "none"; }
    });
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
    document.querySelectorAll("#gfilterBar .gf-chip.on").forEach(function (c) { c.classList.remove("on"); });
    updateBadges();
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
      if (injectBar() && ready) { clearInterval(timer); buildChips(); }
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
