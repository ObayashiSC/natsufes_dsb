/* =========================================================================
 *  filter-defs.js — フィルター定義の共通モジュール（新規）
 *  ------------------------------------------------------------------------
 *  これまで global-filters.js / geo-section.js に重複していた
 *  「フィールド名・グループマッピング・年代/徒歩圏の導出・並び順」を1箇所に集約。
 *
 *  ★今回の追加:
 *    ① walk       : 徒歩圏 / 徒歩圏外
 *    ② wrkDetail  : 勤務地（詳細）＝ビル単位のフィルター（従来のサマリと併存）
 *
 *  これを index.html（通常画面）と compare.html（A/B比較画面）の両方が利用する。
 *  依存なし（単体で読み込み可能）。global-filters.js より前に読み込むこと。
 * ======================================================================= */
window.FilterDefs = (function () {
  "use strict";

  /* ---- 実データのフィールド名（config.js と一致）---- */
  var FLD = {
    gender: "Q1_単一選択",
    birth:  "Q2_年月日入力",
    wrk:    "Q3_単一選択",
    wrkG:   "Q3_単一選択_グループ",
    res:    "Q4_単一選択",
    resG:   "Q4_単一選択_グループ",
    added:  "friend_added_at",
    blocked:"blocked",
    source: "source",
    heard:  "Q5_複数選択",
    sent:   "Q6_複数選択",
    rich:   "richmenu",
  };

  /* ---- 表記ゆれ吸収（「エリアのビル」↔「エリアビル」）---- */
  function normB(s) { return String(s || "").replace(/エリアのビル/g, "エリアビル").trim(); }

  /* ===================== 並び順 ===================== */
  var ORDER = {
    gender: ["男性", "女性", "回答しない"],
    age:    ["〜19歳", "20代", "30代", "40代", "50代", "60代〜"],
    res:    ["東京23区", "東京都23区外", "神奈川県", "千葉県", "埼玉県", "上記以外の都道府県"],
    walk:   ["徒歩圏", "徒歩圏外"],
    wrk:    ["品川IC", "品川GC", "ICGC以外の品川所在ビル", "その他"],
    /* ★追加: 勤務地（詳細）— ビル単位。データ表記（「の」無し）に合わせる */
    wrkDetail: [
      "品川インターシティA棟", "品川インターシティB棟", "品川インターシティC棟",
      "品川グランドセントラルタワー", "NBF品川タワー", "キヤノンSタワー",
      "太陽生命品川ビル", "京王品川ビル", "品川イーストワンタワー",
      "品川シーズンテラス", "品川港南エリアビル", "天王洲エリアビル",
      "北品川エリアビル", "品川高輪エリアビル", "上記以外の東京都内ビル", "その他",
    ],
    resDetail: [
      "東京都港区(徒歩圏)", "東京都港区(徒歩圏外)",
      "東京都品川区（徒歩圏）", "東京都品川区（徒歩圏外）",
      "東京都大田区・目黒区", "東京都千代田区・中央区",
      "東京都渋谷区・新宿区・豊島区・文京区",
      "東京都墨田区・台東区・葛飾区・江戸川区・江東区",
      "東京都世田谷区・中野区・杉並区・練馬区",
      "東京都荒川区・板橋区・足立区・北区",
      "東京都その他",
      "神奈川県横浜市", "神奈川県川崎市", "神奈川県その他",
      "千葉県", "埼玉県", "上記以外の都道府県",
    ],
  };

  /* ---- 居住エリア(Q4) → グループ ---- */
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

  function resGroupOf(r) {
    return (r[FLD.resG] && String(r[FLD.resG]).trim()) || RES_GROUP_MAP[r[FLD.res]] || "";
  }
  function resDetailOf(r) { return String(r[FLD.res] || "").trim(); }

  function wrkGroupOf(r) {
    return (r[FLD.wrkG] && String(r[FLD.wrkG]).trim()) || WRK_GROUP_MAP[normB(r[FLD.wrk])] || "";
  }
  /* ★追加: 勤務地（詳細）＝ビル名そのもの（表記ゆれは normB で吸収） */
  function wrkDetailOf(r) { return normB(r[FLD.wrk]); }

  /* ★追加: 徒歩圏判定（「徒歩圏」を含み「徒歩圏外」でない回答を徒歩圏に）*/
  function walkBand(r) {
    var v = r[FLD.res];
    if (!v) return "";                       // 未回答は判定対象外
    return (String(v).indexOf("徒歩圏") >= 0 && String(v).indexOf("徒歩圏外") < 0)
      ? "徒歩圏" : "徒歩圏外";
  }

  /* ===================== フィルター項目の定義 =====================
   *  ここに並べた順で、サイドバー／比較画面のプルダウンが生成される。
   * ============================================================== */
  var KEYS = [
    { k: "gender",    label: "性別",         order: ORDER.gender,    of: function (r) { return r[FLD.gender]; } },
    { k: "age",       label: "年代",         order: ORDER.age,       of: function (r) { return ageBand(r[FLD.birth]); } },
    { k: "res",       label: "居住地",       order: ORDER.res,       of: resGroupOf },
    { k: "walk",      label: "徒歩圏",       order: ORDER.walk,      of: walkBand },      /* ← ① */
    { k: "wrk",       label: "勤務地",       order: ORDER.wrk,       of: wrkGroupOf },
    { k: "wrkDetail", label: "勤務地(詳細)", order: ORDER.wrkDetail, of: wrkDetailOf },   /* ← ② */
  ];

  /* ===================== 状態ユーティリティ ===================== */
  function newState() {
    var st = {};
    KEYS.forEach(function (g) { st[g.k] = new Set(); });
    return st;
  }
  function activeCount(st) {
    return KEYS.reduce(function (n, g) { return n + (st[g.k] ? st[g.k].size : 0); }, 0);
  }
  function matches(st, r) {
    for (var i = 0; i < KEYS.length; i++) {
      var g = KEYS[i], set = st[g.k];
      if (set && set.size && !set.has(g.of(r))) return false;
    }
    return true;
  }
  function filter(st, rows) {
    rows = rows || [];
    return activeCount(st) ? rows.filter(function (r) { return matches(st, r); }) : rows;
  }
  /* 実データに存在する選択肢だけを、定義順で返す */
  function optionsFor(g, rows) {
    var present = new Set();
    (rows || []).forEach(function (r) { var v = g.of(r); if (v) present.add(v); });
    var out = g.order.filter(function (v) { return present.has(v); });
    present.forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); });
    return out;
  }
  /* 選択中フィルターの短い説明文 */
  function describe(st) {
    var parts = [];
    KEYS.forEach(function (g) {
      var s = st[g.k];
      if (s && s.size) parts.push(g.label + ": " + Array.from(s).join("・"));
    });
    return parts.length ? parts.join(" ／ ") : "条件なし（全件）";
  }

  return {
    FLD: FLD, ORDER: ORDER, KEYS: KEYS,
    RES_GROUP_MAP: RES_GROUP_MAP, WRK_GROUP_MAP: WRK_GROUP_MAP,
    normB: normB, ageBand: ageBand,
    resGroupOf: resGroupOf, resDetailOf: resDetailOf,
    wrkGroupOf: wrkGroupOf, wrkDetailOf: wrkDetailOf, walkBand: walkBand,
    newState: newState, activeCount: activeCount, matches: matches,
    filter: filter, optionsFor: optionsFor, describe: describe,
  };
})();
