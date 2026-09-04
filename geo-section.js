/* =========================================================================
 *  geo-section.js — 居住地・勤務地 属性セクション（LINE ダッシュボード追加分）
 *  ------------------------------------------------------------------------
 *  既存の config.js / dashboard-core.js / app.js を一切変更せずに、
 *  index.html に <script> を1行足すだけで動く自己完結モジュール。
 *
 *  依存: window.DashCore（drawBarH / state / currentRows / safe / $ 等）
 *
 *  【機能】
 *   - 居住地サマリ（Q4グループ）／居住地詳細（23区は件数降順→以降固定順）
 *   - 徒歩圏 or 徒歩圏外（「徒歩圏」を含み「徒歩圏外」でない回答を徒歩圏に）
 *   - 勤務地サマリ（Q3グループ）／勤務地詳細（指定の固定順・0件も表示）
 *   - フィルタ（性別 / 年代 / 居住地グループ / 勤務地グループ）複数選択・選択状態表示
 *   - 期間スライダー（既存）にも連動（DashCore.state.slider を購読）
 *
 *  ★追加: window.GFilter（グローバルフィルター）に対応。存在する場合は
 *    このセクションも GFilter で絞り込み、変更時に自動再描画する。
 *
 *  ※ line_datamart.json にグループ列が無くても、下記マッピングで解決する。
 *    グループ列（Q3_単一選択_グループ / Q4_単一選択_グループ）があればそれを優先。
 * ======================================================================= */
window.GEO = (function () {
  "use strict";

  const D = window.DashCore;
  if (!D) { console.error("[geo] DashCore が見つかりません（読み込み順を確認）"); return {}; }

  /* ---- 実データのフィールド名 ---- */
  const FLD = {
    gender: "Q1_単一選択",
    birth:  "Q2_年月日入力",
    wrk:    "Q3_単一選択",
    wrkG:   "Q3_単一選択_グループ",   // 無ければマッピングで補完
    res:    "Q4_単一選択",
    resG:   "Q4_単一選択_グループ",
  };

  /* ---- 青系パレット（既存 属性=青 に合わせる）---- */
  const PAL = ["#3f66b3", "#5b86d6", "#6fa0ea", "#2f4f8f", "#89b0f0",
               "#4573c4", "#3559a0", "#7aa0e6", "#26467e", "#9ab8f2"];

  /* ---- 表記正規化: マスタ「エリアのビル」↔ データ「エリアビル」を吸収 ---- */
  const normB = (s) => String(s || "").replace(/エリアのビル/g, "エリアビル").trim();

  /* ===================== 並び順・マッピング定義 ===================== */
  const ORDER = {
    /* 居住地サマリ（グループ）*/
    resGroup: ["東京23区", "東京都23区外", "神奈川県", "千葉県", "埼玉県", "上記以外の都道府県"],
    /* 勤務地サマリ（グループ）*/
    wrkGroup: ["品川IC", "品川GC", "ICGC以外の品川所在ビル", "その他"],
    /* 居住地詳細の「23区より後」固定順（23区分は件数降順で前に付く）*/
    resTail: [
      "東京都その他",
      "神奈川県横浜市", "神奈川県川崎市", "神奈川県その他",
      "千葉県", "埼玉県", "上記以外の都道府県",
    ],
    /* 勤務地詳細の固定順（データ表記＝「の」無しに合わせる。0件も表示）*/
    wrkDetail: [
      "品川インターシティA棟", "品川インターシティB棟", "品川インターシティC棟",
      "品川グランドセントラルタワー", "NBF品川タワー", "キヤノンSタワー",
      "太陽生命品川ビル", "京王品川ビル", "品川イーストワンタワー",
      "品川シーズンテラス", "品川港南エリアビル", "天王洲エリアビル",
      "北品川エリアビル", "品川高輪エリアビル", "上記以外の東京都内ビル", "その他",
    ],
    /* 年代（既存 app.js の ageBand と同じ区切り）*/
    age: ["〜19歳", "20代", "30代", "40代", "50代", "60代〜"],
    /* 性別 */
    gender: ["男性", "女性", "回答しない"],
  };

  /* 居住エリア(Q4) → グループ（master_survey option_group 準拠）*/
  const RES_GROUP_MAP = {
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

  /* 所属ビル(Q3) → グループ（キーは normB で正規化した表記）*/
  const WRK_GROUP_MAP = {
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
    const bd = new Date(String(birth).replace(/\//g, "-"));
    if (isNaN(bd) || bd.getFullYear() < 1900) return "";
    const t = new Date();
    let age = t.getFullYear() - bd.getFullYear();
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
    return (r[FLD.resG] && String(r[FLD.resG]).trim())
        || RES_GROUP_MAP[r[FLD.res]] || "";
  }
  function wrkGroupOf(r) {
    return (r[FLD.wrkG] && String(r[FLD.wrkG]).trim())
        || WRK_GROUP_MAP[normB(r[FLD.wrk])] || "";
  }
  function walkBand(r) {
    const v = r[FLD.res];
    if (!v) return ""; // 未回答は徒歩圏判定から除外
    return (v.indexOf("徒歩圏") >= 0 && v.indexOf("徒歩圏外") < 0) ? "徒歩圏" : "徒歩圏外";
  }

  /* ===================== 状態（ローカルUIは未使用時のフォールバック）===================== */
  const STATE = { gender: new Set(), age: new Set(), res: new Set(), wrk: new Set() };

  function baseRows() {
    // 期間スライダーで絞られた行（無ければ全件）
    try { return (typeof D.currentRows === "function") ? D.currentRows() : (D.state.RAW || []); }
    catch (e) { return D.state.RAW || []; }
  }
  function applyFilters(rows) {
    return rows.filter((r) => {
      if (STATE.gender.size && !STATE.gender.has(r[FLD.gender])) return false;
      if (STATE.age.size && !STATE.age.has(ageBand(r[FLD.birth]))) return false;
      if (STATE.res.size && !STATE.res.has(resGroupOf(r))) return false;
      if (STATE.wrk.size && !STATE.wrk.has(wrkGroupOf(r))) return false;
      return true;
    });
  }
  /* ★グローバルフィルター優先: window.GFilter があればそれを使う */
  function filteredRows() {
    const base = baseRows();
    return (window.GFilter && window.GFilter.filter) ? window.GFilter.filter(base) : applyFilters(base);
  }

  /* ===================== 集計ヘルパ ===================== */
  function tally(rows, keyFn) {
    const m = new Map();
    rows.forEach((r) => { const k = keyFn(r); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }
  function orderFixed(map, order) {
    // order の順に必ず全項目（0件含む）
    return { labels: order.slice(), values: order.map((k) => map.get(k) || 0) };
  }
  function residenceDetail(rows) {
    const map = tally(rows, (r) => r[FLD.res]);
    // 23区（グループ==東京23区）に属する詳細値を件数降順
    const t23 = [...map.keys()]
      .filter((k) => resGroupOf({ [FLD.res]: k }) === "東京23区")
      .sort((a, b) => map.get(b) - map.get(a));
    const labels = [...t23], values = t23.map((k) => map.get(k));
    ORDER.resTail.forEach((k) => { labels.push(k); values.push(map.get(k) || 0); });
    return { labels, values };
  }
  function workDetail(rows) {
    // 正規化キーで集計してから、固定順（表示は固定順の表記）で 0件も表示
    const map = new Map();
    rows.forEach((r) => { const k = normB(r[FLD.wrk]); if (k) map.set(k, (map.get(k) || 0) + 1); });
    return { labels: ORDER.wrkDetail.slice(), values: ORDER.wrkDetail.map((k) => map.get(k) || 0) };
  }

  /* ===================== 描画 ===================== */
  const $ = (s) => document.querySelector(s);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  function setSub(sel, n) { const el = $(sel); if (el) el.textContent = `対象 ${n} 名`; }

  function render() {
    const rows = filteredRows();           // ★グローバルフィルター適用後
    const cnt = $("#geoCount");
    if (cnt) cnt.textContent = `該当 ${rows.length} / ${(D.state.RAW || []).length} 名`;

    // 居住地サマリ
    const resSum = orderFixed(tally(rows, resGroupOf), ORDER.resGroup);
    D.drawBarH("geo_resSum", resSum, PAL, 0); setSub("#geo_s_resSum", sum(resSum.values));
    // 居住地詳細
    const resDet = residenceDetail(rows);
    D.drawBarH("geo_resDetail", resDet, PAL, 0); setSub("#geo_s_resDetail", sum(resDet.values));
    // 徒歩圏
    const walk = orderFixed(tally(rows, walkBand), ["徒歩圏", "徒歩圏外"]);
    D.drawBarH("geo_walk", walk, PAL, 0); setSub("#geo_s_walk", sum(walk.values));
    // 勤務地サマリ
    const wrkSum = orderFixed(tally(rows, wrkGroupOf), ORDER.wrkGroup);
    D.drawBarH("geo_wrkSum", wrkSum, PAL, 0); setSub("#geo_s_wrkSum", sum(wrkSum.values));
    // 勤務地詳細
    const wrkDet = workDetail(rows);
    D.drawBarH("geo_wrkDetail", wrkDet, PAL, 0); setSub("#geo_s_wrkDetail", sum(wrkDet.values));

    renderSelected();
  }

  /* ---- 選択中サマリ & バッジ（ローカルUIがある場合のみ）---- */
  function renderSelected() {
    const parts = [];
    const add = (label, set) => {
      if (set.size) parts.push(`<b>${label}:</b> ` +
        [...set].map((v) => `<span class="geo-seltag">${v}</span>`).join(""));
    };
    add("性別", STATE.gender); add("年代", STATE.age);
    add("居住地", STATE.res); add("勤務地", STATE.wrk);
    const el = $("#geoSelected");
    if (el) el.innerHTML = parts.length ? parts.join("<br>") : "選択中のフィルタはありません（全件表示）。";
    const badge = (id, set) => {
      const b = $(id); if (!b) return;
      if (set.size) { b.style.display = ""; b.textContent = set.size; } else b.style.display = "none";
    };
    badge("#geo_b_gender", STATE.gender); badge("#geo_b_age", STATE.age);
    badge("#geo_b_res", STATE.res); badge("#geo_b_wrk", STATE.wrk);
  }

  /* ===================== フィルタUI（ローカル・後方互換）===================== */
  function distinct(fn, order) {
    const present = new Set((D.state.RAW || []).map(fn).filter(Boolean));
    const out = order.filter((v) => present.has(v));
    [...present].forEach((v) => { if (!out.includes(v)) out.push(v); });
    return out;
  }
  function buildChips(hostSel, values, set) {
    const host = $(hostSel); if (!host) return;
    host.innerHTML = "";
    values.forEach((v) => {
      const c = document.createElement("span");
      c.className = "geo-chip"; c.textContent = v;
      c.onclick = () => {
        if (set.has(v)) { set.delete(v); c.classList.remove("on"); }
        else { set.add(v); c.classList.add("on"); }
        render();
      };
      host.appendChild(c);
    });
  }
  function initFilters() {
    // フィルタUIが無い構成（属性直後に埋め込み等）ではスキップ
    if (!document.getElementById("geo_f_gender")) return;
    buildChips("#geo_f_gender", distinct((r) => r[FLD.gender], ORDER.gender), STATE.gender);
    buildChips("#geo_f_age", distinct((r) => ageBand(r[FLD.birth]), ORDER.age), STATE.age);
    buildChips("#geo_f_res", distinct(resGroupOf, ORDER.resGroup), STATE.res);
    buildChips("#geo_f_wrk", distinct(wrkGroupOf, ORDER.wrkGroup), STATE.wrk);
    const clr = $("#geoClear");
    if (clr) clr.onclick = () => {
      [STATE.gender, STATE.age, STATE.res, STATE.wrk].forEach((s) => s.clear());
      document.querySelectorAll(".geo-chip.on").forEach((c) => c.classList.remove("on"));
      render();
    };
  }

  /* ===================== 起動（DashCore の準備を待つ）===================== */
  function boot() {
    if (!document.getElementById("geoSection")) return; // セクション未設置なら何もしない
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (D.state && Array.isArray(D.state.RAW) && D.state.RAW.length) {
        clearInterval(timer);
        initFilters();
        // 期間スライダーに連動（確定時に再描画）
        if (D.state.slider && D.state.slider.on) {
          try { D.state.slider.on("change", () => D.safe("居住勤務", render)); } catch (e) {}
        }
        // ★グローバルフィルターに連動（変更時に再描画）
        if (window.GFilter && window.GFilter.subscribe) {
          window.GFilter.subscribe(() => D.safe("居住勤務", render));
        }
        D.safe("居住勤務", render);
      } else if (tries > 80) {
        clearInterval(timer); // 約10秒でタイムアウト
        console.warn("[geo] データ待機がタイムアウトしました");
      }
    }, 120);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }

  return { update: () => D.safe("居住勤務", render), render };
})();
