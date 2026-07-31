/* ==========================================================================
   app.js — 私銀資產活化平台
   --------------------------------------------------------------------------
   響應式相關的兩個約定，改動時務必遵守：

   1. 表格列的每個 <td> 都要帶 data-label。CSS 在 < 48rem 把表格轉成卡片，
      欄名是靠 td[data-label]::before 產生的；沒有 data-label 的格子會被當成
      「卡片標題」獨佔一行。忘記加 → 手機上該欄變成沒有名字的裸數字。

   2. 漏斗圖同時產出寬版與窄版兩份 SVG，由 CSS 的 .funnel--wide /
      .funnel--narrow 切換，不用 JS 監聽 resize。這樣匯出的單檔 HTML 在
      收件人的任何裝置上都是可讀的。
   ========================================================================== */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const fmt = n => { const r = Math.round(n); return (r < 0 ? "-" : "") + Math.abs(r).toLocaleString("en-US"); };
  const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  const pct = (n, d = 1) => n.toFixed(d);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let cols = [], uses = [];
  let cfg = { loans: [{ ccy: "CHF", amt: 0, rate: 1.35, fx: 0.895 }], custodyRate: 0.15, custodyBase: 0, ownFunds: null };
  // fx: 1 單位外幣 = 多少 USD（CHF 0.895 ⇔ USD/CHF 1.118）
  const CCY_DEFAULTS = { CHF: { rate: 1.35, fx: 0.895 }, USD: { rate: 4.5, fx: 1 }, EUR: { rate: 3.0, fx: 1.08 }, JPY: { rate: 0.1, fx: 0.0067 }, HKD: { rate: 4.5, fx: 0.128 }, SGD: { rate: 3.5, fx: 0.74 } };
  const CCYS = ["CHF", "USD", "EUR", "JPY", "HKD", "SGD"];
  const TYPES = ["現金", "股票/ETF", "投資等級債券", "結構性票據", "基金", "保單現金值", "其他"];
  const DEP_COLORS = ["#2e3a4d", "#b08833", "#3a6e8a", "#8a6e34", "#2e6b5e", "#5a7a9a"];

  let stress = { fx: 0 };
  let RES = {};

  const BLANK_CFG = () => ({ loans: [{ ccy: "CHF", amt: 0, rate: 1.35, fx: 0.895 }], custodyRate: 0.15, custodyBase: 0, ownFunds: null });
  const PRESET_HUGH = { cols: [], uses: [], cfg: BLANK_CFG() };
  const PRESET_PDF = { cols: [], uses: [], cfg: BLANK_CFG() };

  /* ==========================================================================
     壓力測試的抵押品集合 = 抵押品池 + 有回押的動用
     ========================================================================== */
  function pledged() {
    const arr = [];
    cols.forEach((r, i) => arr.push({ key: "c" + i, name: r.name || "(資產)", mv: r.mv, ltv: r.ltv, row: r }));
    uses.forEach((r, i) => { if (r.pb) arr.push({ key: "u" + i, name: r.name || "(投資)", mv: r.amt, ltv: r.ltv, row: r }); });
    return arr;
  }
  const loanTotal = () => uses.reduce((s, r) => s + r.amt, 0);
  const tlvNow = () => pledged().reduce((s, a) => s + a.mv * a.ltv / 100, 0);

  /* ==========================================================================
     可編輯表格的列
     ========================================================================== */
  function colRow(r, i) {
    return `<tr data-i="${i}">
      <td data-label="資產 / 標的"><input data-f="name" value="${esc(r.name)}" placeholder="標的"></td>
      <td data-label="類別"><select data-f="type">${TYPES.map(t => `<option ${t === r.type ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td class="num" data-label="市值 (USD)"><input class="t-num" data-f="mv" inputmode="decimal" value="${r.mv ? r.mv.toLocaleString("en-US") : ""}" placeholder="0"></td>
      <td class="num" data-label="LTV %"><input class="t-pct" data-f="ltv" inputmode="decimal" value="${r.ltv}"></td>
      <td class="num" data-label="配息/收益率 %"><input class="t-pct" data-f="yld" inputmode="decimal" value="${r.yld}"></td>
      <td class="num out" data-label="釋放額度">${fmt(r.mv * r.ltv / 100)}</td>
      <td class="center cell-toggle" data-label="保管費"><label class="sw"><input type="checkbox" data-f="cust" ${r.cust ? "checked" : ""}><span class="track"></span><span class="knob"></span></label></td>
      <td class="cell-action"><button type="button" class="del" data-del="col" aria-label="刪除此列">×</button></td>
    </tr>`;
  }

  function useRow(r, i) {
    const occ = r.pb ? r.amt * (1 - r.ltv / 100) : r.amt;
    const rem = r.amt - occ;
    return `<tr data-i="${i}">
      <td data-label="用途 / 標的"><input data-f="name" value="${esc(r.name)}" placeholder="用途"></td>
      <td class="num" data-label="金額 (USD)"><input class="t-num" data-f="amt" inputmode="decimal" value="${r.amt ? r.amt.toLocaleString("en-US") : ""}" placeholder="0"></td>
      <td class="center" data-label="回押 &amp; LTV%"><div class="pb-wrap"><label class="sw"><input type="checkbox" data-f="pb" ${r.pb ? "checked" : ""}><span class="track"></span><span class="knob"></span></label><input class="t-pct" data-f="ltv" inputmode="decimal" value="${r.ltv}" ${r.pb ? "" : "disabled"}></div></td>
      <td class="num" data-label="配息/收益率 %"><input class="t-pct" data-f="yld" inputmode="decimal" value="${r.yld}"></td>
      <td class="num out occ" data-label="佔用額度">${fmt(occ)}</td>
      <td class="num rem cell-rem" data-label="剩餘金額">${fmt(rem)}</td>
      <td class="center cell-toggle" data-label="保管費"><label class="sw"><input type="checkbox" data-f="cust" ${r.cust ? "checked" : ""}><span class="track"></span><span class="knob"></span></label></td>
      <td class="cell-action"><button type="button" class="del" data-del="use" aria-label="刪除此列">×</button></td>
    </tr>`;
  }

  function stressRow(a) {
    const sv = a.mv * (1 - (a.row.dcl || 0) / 100);
    const slv = sv * a.ltv / 100;
    return `<tr data-key="${a.key}">
      <td>${esc(a.name)}</td>
      <td class="num" data-label="現值 (USD)">${fmt(a.mv)}</td>
      <td class="num" data-label="LTV%">${a.ltv}</td>
      <td class="center" data-label="模擬跌幅"><div class="srange"><input type="range" min="0" max="60" step="0.5" value="${a.row.dcl || 0}" data-dcl="${a.key}" aria-label="${esc(a.name)} 模擬跌幅"><span class="pv" data-pv="${a.key}">${pct(a.row.dcl || 0, 1)}%</span></div></td>
      <td class="num" data-label="壓力後抵押值">${fmt(slv)}</td>
      <td class="num" data-label="單獨觸發門檻"><span class="thr" data-thr="${a.key}"></span></td>
    </tr>`;
  }

  function render() {
    $("#tblCol tbody").innerHTML = cols.map(colRow).join("");
    $("#tblUse tbody").innerHTML = uses.map(useRow).join("");
    $("#custodyRate").value = cfg.custodyRate;
    $("#ownFunds").value = cfg.ownFunds != null ? cfg.ownFunds.toLocaleString("en-US") : "";
    renderLoanRows();
    $("#tblStress tbody").innerHTML = pledged().map(stressRow).join("");
    calc();
  }

  /* ==========================================================================
     主計算
     ========================================================================== */
  function calc() {
    // ---- 額度總覽 ----
    const colMv = cols.reduce((s, r) => s + r.mv, 0);
    const capacity = cols.reduce((s, r) => s + r.mv * r.ltv / 100, 0);
    const useAmt = uses.reduce((s, r) => s + r.amt, 0);
    const occupied = uses.reduce((s, r) => s + (r.pb ? r.amt * (1 - r.ltv / 100) : r.amt), 0);
    const free = capacity - occupied;
    const util = capacity > 0 ? occupied / capacity * 100 : 0;

    $("#colMv").textContent = fmt(colMv);
    $("#colCap").textContent = fmt(capacity);
    $("#useAmt").textContent = fmt(useAmt);
    $("#useOcc").textContent = fmt(occupied);
    $("#useRem").textContent = fmt(useAmt - occupied);
    $("#kCap").textContent = fmt(colMv);
    $("#kUsed").textContent = fmt(colMv);
    $("#kFree").textContent = fmt(free);
    $("#kUtil").textContent = pct(util, 1);

    const fk = $(".kpi.k-free");
    fk.classList.toggle("neg", free < 0);
    fk.classList.toggle("pos", free >= 0);
    $("#kFreeSub").textContent = free < 0 ? "超額動用！" : "尚可動用";
    $("#kUtilSub").textContent = util > 100 ? "已超限！" : util > 85 ? "接近上限" : "建議 ≤ 85%";
    drawWaterfall();

    // ---- 損益 ----
    cfg.custodyRate = num($("#custodyRate").value);
    const ofRaw = $("#ownFunds").value.trim();
    cfg.ownFunds = ofRaw === "" ? null : num(ofRaw);

    const income = cols.reduce((s, r) => s + r.mv * r.yld / 100, 0)
                 + uses.reduce((s, r) => s + r.amt * r.yld / 100, 0);

    const loans = cfg.loans || [];
    // 單筆借貸預設同步「動用合計」，使用者手動改過就固定 (auto:false)
    if (loans.length === 1 && loans[0].auto !== false) {
      loans[0].amt = useAmt;
      const inp = document.querySelector('#loanRows input[data-lf="amt"]');
      if (inp && document.activeElement !== inp) {
        inp.value = useAmt ? useAmt.toLocaleString("en-US") : "";
        const cell = inp.closest("tr") && inp.closest("tr").querySelector(".lint");
        if (cell) cell.textContent = "$" + fmt(loans[0].amt * loans[0].rate / 100);
      }
    }

    const loan = loans.reduce((s, l) => s + l.amt, 0);            // 一律以 USD 輸入
    const interest = loans.reduce((s, l) => s + l.amt * l.rate / 100, 0);
    const borrowRate = loan > 0 ? interest / loan * 100 : 0;       // 加權平均融資利率
    $("#kUsed").textContent = fmt(colMv + loan);
    const ltEl = $("#loanTotalUsd");
    if (ltEl) ltEl.textContent = "$" + fmt(loan);

    const custodyBase = cols.filter(r => r.cust).reduce((s, r) => s + r.mv, 0)
                      + uses.filter(r => r.cust).reduce((s, r) => s + r.amt, 0);
    const custody = custodyBase * cfg.custodyRate / 100;
    cfg.custodyBase = custodyBase;
    const custEl = $("#custodyBase");
    if (custEl) custEl.value = custodyBase ? custodyBase.toLocaleString("en-US") : "";

    const cost = interest + custody;
    const net = income - cost;

    // 自備金 = 客戶本來帶入私銀的資產（抵押品總市值），與回押、融資購入無關
    const ownFunds = cfg.ownFunds != null ? cfg.ownFunds : colMv;
    const ofEl = $("#ownFunds");
    if (ofEl && cfg.ownFunds == null && document.activeElement !== ofEl) {
      ofEl.placeholder = colMv ? ("自動 = " + colMv.toLocaleString("en-US")) : "自動 = 抵押品總市值";
    }

    const yieldBase = cols.filter(r => r.yld > 0).reduce((s, r) => s + r.mv, 0)
                    + uses.filter(r => r.yld > 0).reduce((s, r) => s + r.amt, 0);
    const wYield = yieldBase > 0 ? income / yieldBase * 100 : 0;
    const spread = wYield - borrowRate;
    const roe = ownFunds > 0 ? net / ownFunds * 100 : 0;

    // ---- 損益明細表 ----
    const pnlRow = (name, base, rate, amt, cls) =>
      `<tr><td>${esc(name)}</td>` +
      `<td class="num" data-label="金額 (USD)">${base}</td>` +
      `<td class="num" data-label="年化率 %">${rate}</td>` +
      `<td class="num out ${cls}" data-label="年度金額">${amt}</td></tr>`;

    let pr = "";
    cols.filter(r => r.yld > 0).forEach(r => pr += pnlRow("收益 · " + (r.name || "資產"), fmt(r.mv), pct(r.yld, 2), fmt(r.mv * r.yld / 100), "inc"));
    uses.filter(r => r.yld > 0).forEach(r => pr += pnlRow("收益 · " + (r.name || "投資"), fmt(r.amt), pct(r.yld, 2), fmt(r.amt * r.yld / 100), "inc"));
    pr += pnlRow(`融資成本 (${loans.map(l => l.ccy).join("+") || "—"})`, "(" + fmt(loan) + ")", pct(borrowRate, 2), "(" + fmt(interest) + ")", "cost");
    pr += pnlRow("保管費", fmt(custodyBase), pct(cfg.custodyRate, 2), "(" + fmt(custody) + ")", "cost");
    pr += `<tr class="row-total"><td>淨年度回報</td>` +
          `<td class="num" data-label="金額 (USD)">—</td>` +
          `<td class="num" data-label="年化率 %">—</td>` +
          `<td class="num num-strong" data-label="年度金額">${fmt(net)}</td></tr>`;
    $("#tblPnl tbody").innerHTML = pr;

    $("#pIncome").textContent = "$" + fmt(income);
    $("#pCost").textContent = "$" + fmt(cost);
    $("#pNet").textContent = "$" + fmt(net);
    $("#pNet").className = "v " + (net >= 0 ? "m" : "r");
    $("#pRoE").innerHTML = pct(roe, 2) + "%<small>淨回報 / 自備金 " + fmt(ownFunds) + "</small>";

    const nonUsdLoans = loans.filter(l => l.ccy !== "USD");
    $("#fxNote").innerHTML = nonUsdLoans.length
      ? `<b>幣別風險：</b>融資含 ${nonUsdLoans.map(l => l.ccy).join("、")} 等非美元幣別，若該幣別兌 USD 升值，借款美元等值與利息同步上升，將侵蝕利差與抵押緩衝。建議設匯率對沖門檻。`
      : `融資與資產同為 USD，無跨幣別匯率風險。`;

    // ---- 快照資料束 ----
    RES = {
      cap: capacity, occ: occupied, free: free, util: util, totalMV: colMv,
      deploys: uses.map(r => ({ name: r.name || "動用", occ: (r.pb ? r.amt * (1 - r.ltv / 100) : r.amt), pb: r.pb, ltv: r.ltv })),
      sources: cols.map(r => ({ name: r.name || "資產", ltv: r.ltv, lv: r.mv * r.ltv / 100 })).filter(s => s.lv > 0),
      income, cost, net, spread, wYield, roe, ownFunds,
      loan, interest, custody, custodyBase, borrowRate,
      fundCcy: (loans[0] && loans[0].ccy) || "USD",
      custodyRate: cfg.custodyRate,
      uses: JSON.parse(JSON.stringify(uses)),
      incRows: cols.filter(r => r.yld > 0).map(r => ({ name: r.name || "資產", base: r.mv, rate: r.yld, amt: r.mv * r.yld / 100 }))
        .concat(uses.filter(r => r.yld > 0).map(r => ({ name: r.name || "投資", base: r.amt, rate: r.yld, amt: r.amt * r.yld / 100 }))),
      positions: cols.map(r => ({ name: r.name || "資產", amt: r.mv }))
        .concat(uses.map(r => ({ name: r.name || "商品", amt: r.amt })))
        .filter(p => p.amt > 0).sort((a, b) => b.amt - a.amt),
      colYield: cols.reduce((s, r) => s + r.mv * r.yld / 100, 0),
      tlv: tlvNow()
    };
    RES.totalInvest = RES.positions.reduce((s, p) => s + p.amt, 0);
    RES.tol = RES.tlv > 0 ? Math.max(0, (1 - RES.loan / RES.tlv) * 100) : 0;
    if (document.body.classList.contains("snap")) renderSnapshot();

    calcStress();
  }

  function calcStress() {
    stress.fx = num($("#fxShock").value);
    const nonUsd = (cfg.loans || []).filter(l => l.ccy !== "USD").map(l => l.ccy).join("/");
    $("#fxLabel").textContent = nonUsd ? nonUsd + " 兌 USD 升值" : "融資幣別升值 (USD 無)";
    $("#fxOut").textContent = pct(stress.fx, 1) + "%";
    $("#masterOut").textContent = pct(num($("#masterDcl").value), 1) + "%";

    const set = pledged();
    const loan = loanTotal();
    const hasNonUsd = (cfg.loans || []).some(l => l.ccy !== "USD");
    const loanFx = loan * (1 + (hasNonUsd ? stress.fx / 100 : 0));
    const tlv0 = tlvNow();
    const bufNow = tlv0 - loan;   // 目前緩衝（未壓力、未 FX），用來算單獨觸發門檻

    let sMv = 0, sTlv = 0;
    set.forEach(a => {
      const sv = a.mv * (1 - (a.row.dcl || 0) / 100);
      sMv += sv;
      sTlv += sv * a.ltv / 100;

      const slvCell = $(`#tblStress tbody tr[data-key="${a.key}"] td:nth-child(5)`);
      if (slvCell) slvCell.textContent = fmt(sv * a.ltv / 100);

      // 只有這個標的下跌 d 時觸發補倉：bufNow − mv·d·ltv < 0
      const denom = a.mv * a.ltv / 100;
      const dstar = denom > 0 ? bufNow / denom * 100 : Infinity;
      const thrEl = $(`#tblStress tbody tr[data-key="${a.key}"] [data-thr="${a.key}"]`);
      if (thrEl) {
        if (bufNow <= 0) { thrEl.textContent = "已補倉"; thrEl.className = "thr tight"; }
        else if (dstar >= 100) { thrEl.textContent = "跌 100%+"; thrEl.className = "thr ok"; }
        else { thrEl.textContent = "跌 " + pct(dstar, 1) + "%"; thrEl.className = "thr " + (dstar < 15 ? "tight" : dstar < 30 ? "mid" : "ok"); }
      }
    });
    $("#sMv").textContent = fmt(sMv);
    $("#sTlv").textContent = fmt(sTlv);

    const buffer = sTlv - loanFx;
    const util = sTlv > 0 ? loanFx / sTlv * 100 : 0;
    $("#rTlv").textContent = "$" + fmt(sTlv);
    $("#rLoan").textContent = "$" + fmt(loanFx);
    $("#rBuffer").textContent = "$" + fmt(buffer);
    $("#rBuffer").className = "v " + (buffer < 0 ? "r" : buffer < tlv0 * 0.05 ? "a" : "g");
    $("#rUtil").textContent = pct(util, 1) + "%";
    $("#rUtil").className = "v " + (util >= 100 ? "r" : util >= 90 ? "a" : "g");

    let badge, topup = "";
    if (util >= 100 || buffer < 0) { badge = '<span class="badge call">補倉 Margin Call</span>'; topup = " · 需補 $" + fmt(loanFx - sTlv); }
    else if (util >= 90) { badge = '<span class="badge warn">警戒</span>'; }
    else { badge = '<span class="badge safe">安全</span>'; }
    $("#rStatus").innerHTML = badge + `<span class="badge-note">${topup}</span>`;

    // 同步可承受跌幅：(1−d)·tlv0 = loanFx  →  d = 1 − loanFx/tlv0
    let tol = tlv0 > 0 ? (1 - loanFx / tlv0) * 100 : 0;
    if (tol < 0) tol = 0;
    const tolEl = $("#tolPct");
    tolEl.textContent = pct(tol, 2);
    tolEl.style.color = tol < 5 ? "var(--red)" : tol < 12 ? "var(--amber)" : "var(--green)";
    $("#tolNote").innerHTML = (loanFx > tlv0)
      ? `目前已處於 <b style="color:var(--red)">補倉狀態</b>（借款 &gt; 抵押值）。`
      : `總抵押值 $${fmt(tlv0)}、借款 $${fmt(loanFx)}。全組合同步再跌約 <b>${pct(tol, 2)}%</b> 即觸發 Margin Call。利用率越高，這條防線越薄。`;
  }

  /* ==========================================================================
     資金結構圖 (Chart.js)
     高度由 CSS 的 .chart-box 控制，這裡只要 maintainAspectRatio:false
     ========================================================================== */
  function deployDatasets(totalMV, usesArr) {
    return [
      { label: "客戶總資產", data: [totalMV, totalMV], backgroundColor: "#2e3a4d", borderRadius: 4, borderSkipped: false },
      ...usesArr.map((r, i) => ({
        label: r.name || `商品 ${i + 1}`,
        data: [0, r.pb ? r.amt * (1 - r.ltv / 100) : r.amt],
        backgroundColor: DEP_COLORS[i % DEP_COLORS.length],
        borderRadius: 4, borderSkipped: false
      }))
    ];
  }

  function legendHtml(datasets) {
    return datasets.map(d =>
      `<span><i style="background:${d.backgroundColor}"></i>${esc(d.label)}</span>`
    ).join("");
  }

  const CHART_OPTS = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: c => c.raw > 0 ? " " + c.dataset.label + "：$" + c.raw.toLocaleString("en-US") : null } }
    },
    scales: {
      x: {
        stacked: true,
        ticks: { callback: v => "$" + (v / 1000000).toFixed(1) + "M", font: { size: 11 }, color: "#7a6f63", maxTicksLimit: 6 },
        grid: { color: "rgba(46,58,77,0.10)" },
        border: { display: false }
      },
      y: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 13 }, color: "#4a3f33", padding: 6 },
        border: { display: false }
      }
    },
    layout: { padding: { right: 12 } }
  };

  function drawWaterfall() {
    const totalMV = cols.reduce((s, r) => s + r.mv, 0);
    const datasets = deployDatasets(totalMV, uses.filter(r => r.amt > 0));

    const leg = $("#deployLegendEdit");
    if (leg) leg.innerHTML = legendHtml(datasets);

    const canv = $("#waterfallChart");
    if (!canv || typeof Chart === "undefined") return;
    if (window._wfChart) window._wfChart.destroy();
    window._wfChart = new Chart(canv, { type: "bar", data: { labels: ["操作前", "操作後"], datasets }, options: CHART_OPTS });
  }

  /* ==========================================================================
     多幣別借貸列
     ========================================================================== */
  function renderLoanRows() {
    const tbody = $("#loanRows");
    if (!tbody) return;

    tbody.innerHTML = (cfg.loans || []).map((l, i) => `
      <tr data-li="${i}">
        <td data-label="幣別"><select data-lf="ccy">${CCYS.map(c => `<option ${c === l.ccy ? "selected" : ""}>${c}</option>`).join("")}</select></td>
        <td class="num" data-label="借款金額 (USD)"><input class="t-num" data-lf="amt" inputmode="decimal" value="${l.amt ? l.amt.toLocaleString("en-US") : ""}" placeholder="0"></td>
        <td class="num" data-label="利率 % (年)"><input class="t-num" data-lf="rate" inputmode="decimal" value="${l.rate}" placeholder="0.00"></td>
        <td class="num" data-label="兌 USD 匯率"><input class="t-num" data-lf="fx" inputmode="decimal" value="${l.fx}" placeholder="1.00"></td>
        <td class="num lint cell-int" data-label="利息 (USD)">$${fmt(l.amt * l.rate / 100)}</td>
        <td class="cell-action"><button type="button" class="del" data-ldel="${i}" aria-label="刪除此筆借貸">×</button></td>
      </tr>`).join("");

    tbody.querySelectorAll("select[data-lf]").forEach(el => el.addEventListener("change", e => {
      const i = +e.target.closest("tr").dataset.li;
      cfg.loans[i].ccy = e.target.value;
      const def = CCY_DEFAULTS[e.target.value] || { rate: 1, fx: 1 };
      cfg.loans[i].rate = def.rate;
      cfg.loans[i].fx = def.fx;
      renderLoanRows();
      calc();
    }));

    tbody.querySelectorAll("input[data-lf]").forEach(el => el.addEventListener("input", e => {
      const tr = e.target.closest("tr");
      const i = +tr.dataset.li, f = e.target.dataset.lf;
      cfg.loans[i][f] = num(e.target.value);
      if (f === "amt") cfg.loans[i].auto = false;   // 手動覆寫後停止自動同步
      const cell = tr.querySelector(".lint");
      if (cell) cell.textContent = "$" + fmt(cfg.loans[i].amt * cfg.loans[i].rate / 100);
      calc();
    }));

    tbody.querySelectorAll('input[data-lf="amt"]').forEach(el => el.addEventListener("focusout", e => {
      const v = num(e.target.value);
      e.target.value = v ? v.toLocaleString("en-US") : "";
    }));

    tbody.querySelectorAll("[data-ldel]").forEach(btn => btn.addEventListener("click", e => {
      cfg.loans.splice(+e.currentTarget.dataset.ldel, 1);
      renderLoanRows();
      calc();
    }));
  }

  /* ==========================================================================
     表格事件綁定
     ========================================================================== */
  function bindTable(sel, getArr) {
    const root = $(sel);

    root.addEventListener("input", e => {
      const arr = getArr(), tr = e.target.closest("tr");
      if (!tr) return;
      const i = +tr.dataset.i, f = e.target.dataset.f;
      if (f == null) return;
      const r = arr[i];
      if (!r) return;

      if (f === "name") { r.name = e.target.value; return; }
      if (f === "pb") { r.pb = e.target.checked; render(); return; }
      if (f === "cust") { r.cust = e.target.checked; calc(); return; }
      if (f === "mv" || f === "amt") r[f] = num(e.target.value);
      else if (f === "ltv") r.ltv = num(e.target.value);
      else if (f === "yld") r.yld = num(e.target.value);

      if (f === "mv" || f === "amt" || f === "ltv") {
        const cell = tr.querySelector(".out");
        if (cell) cell.textContent = sel.includes("Col")
          ? fmt(r.mv * r.ltv / 100)
          : fmt(r.pb ? r.amt * (1 - r.ltv / 100) : r.amt);
        if (!sel.includes("Col")) {
          const remCell = tr.querySelector(".rem");
          if (remCell) {
            const occ = r.pb ? r.amt * (1 - r.ltv / 100) : r.amt;
            remCell.textContent = fmt(r.amt - occ);
          }
        }
      }
      calc();
    });

    root.addEventListener("focusout", e => {
      const f = e.target.dataset.f;
      if (!f) return;
      if (f === "mv" || f === "amt" || f === "ltv" || f === "yld") {
        setTimeout(() => {
          const active = document.activeElement;
          if (active && (active.closest("#cmOverlay") || active.closest(".case-bar"))) return;
          render();
        }, 0);
      }
    });

    root.addEventListener("change", e => {
      if (e.target.dataset.f === "type") {
        getArr()[+e.target.closest("tr").dataset.i].type = e.target.value;
        calc();
      }
    });

    root.addEventListener("click", e => {
      const btn = e.target.closest("[data-del]");
      if (!btn) return;
      getArr().splice(+btn.closest("tr").dataset.i, 1);
      render();
    });
  }

  document.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.add === "col") cols.push({ name: "", type: "股票/ETF", mv: 0, ltv: 60, yld: 0, dcl: 0 });
    else uses.push({ name: "", amt: 0, pb: false, ltv: 75, yld: 0, dcl: 0 });
    render();
  }));

  ["custodyRate", "ownFunds"].forEach(id => {
    $("#" + id).addEventListener("input", calc);
    $("#" + id).addEventListener("change", calc);
  });

  $("#btnAddLoan").addEventListener("click", () => {
    cfg.loans.push({ ccy: "CHF", amt: 0, rate: 1.35, fx: 0.895 });
    renderLoanRows();
    calc();
  });

  // 壓力測試滑桿（事件委派）
  $("#tblStress").addEventListener("input", e => {
    const key = e.target.dataset.dcl;
    if (!key) return;
    const a = pledged().find(x => x.key === key);
    if (!a) return;
    a.row.dcl = num(e.target.value);
    const pv = $(`#tblStress [data-pv="${key}"]`);
    if (pv) pv.textContent = pct(a.row.dcl, 1) + "%";
    calcStress();
  });

  $("#masterDcl").addEventListener("input", e => {
    const d = num(e.target.value);
    pledged().forEach(a => a.row.dcl = d);
    document.querySelectorAll("#tblStress input[type=range][data-dcl]").forEach(s => s.value = d);
    document.querySelectorAll("#tblStress [data-pv]").forEach(p => p.textContent = pct(d, 1) + "%");
    calcStress();
  });

  $("#fxShock").addEventListener("input", calcStress);

  document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
    const p = b.dataset.preset;
    const src = p === "hugh" ? PRESET_HUGH : p === "pdf" ? PRESET_PDF : null;
    if (src) {
      cols = JSON.parse(JSON.stringify(src.cols));
      uses = JSON.parse(JSON.stringify(src.uses));
      cfg = JSON.parse(JSON.stringify(src.cfg));
    } else {
      cols = []; uses = []; cfg = BLANK_CFG();
    }
    $("#masterDcl").value = 0;
    $("#fxShock").value = 0;
    render();
  }));

  // 任何帶 data-print 的按鈕都觸發列印（取代 inline onclick）
  document.addEventListener("click", e => {
    if (e.target.closest("[data-print]")) window.print();
  });

  /* ==========================================================================
     漏斗圖：同一份資料 → 寬版 / 窄版兩份 SVG
     寬版把註解排在右側（桌機、列印）；窄版只留色塊內的標題與金額，註解移到
     SVG 外面用 HTML 列出，因為 SVG 文字不會自動換行，在手機上必定爆版。
     ========================================================================== */
  function funnelLayers(R) {
    const totalMV = R.totalMV || 0;
    const usesData = (R.uses || []).filter(r => r.amt > 0);

    const layers = [{ label: "資產總市值", sub: "Total Asset Value", amt: totalMV, color: "#2e3a4d" }]
      .concat(usesData.map((r, i) => ({
        label: r.name || `商品 ${i + 1}`,
        sub: null,
        amt: r.amt,
        color: DEP_COLORS[i % DEP_COLORS.length]
      })));

    const annots = layers.map((layer, i) => {
      if (i === 0) return {
        line1: `總資產 $${fmt(totalMV)}`,
        line2: `可抵押額度 $${fmt(R.cap || 0)}`,
        line3: (R.colYield || 0) > 0 ? `年化收益 $${fmt(R.colYield)}` : null
      };
      const r = usesData[i - 1];
      if (!r) return { line1: "", line2: null, line3: null };
      const ownPart = r.pb ? r.amt * (1 - r.ltv / 100) : r.amt;
      const loanPart = r.pb ? r.amt * r.ltv / 100 : 0;
      return {
        line1: `買入金額 $${fmt(r.amt)}`,
        line2: r.pb ? `自備 $${fmt(ownPart)}　借入 $${fmt(loanPart)}` : `現金支出 $${fmt(ownPart)}`,
        line3: r.yld > 0 ? `年化收益 $${fmt(r.amt * r.yld / 100)}　(${pct(r.yld, 2)}%)` : null
      };
    });

    return { layers, annots };
  }

  function funnelWide(layers, annots) {
    const svgW = 1280, cx = 620, topW = 700, tipW = 120, bandH = 100, gap = 10, topY0 = 36;
    const nL = layers.length;
    const svgH = topY0 + nL * (bandH + gap) + 20;
    let bands = "", annLines = "";

    layers.forEach((layer, i) => {
      const wTop = topW - (topW - tipW) * (i / nL);
      const wBot = topW - (topW - tipW) * ((i + 1) / nL);
      const topY = topY0 + i * (bandH + gap);
      const botY = topY + bandH;
      const midY = topY + bandH / 2;
      const midW = (wTop + wBot) / 2;

      if (i > 0) bands += `<line x1="${cx - wTop / 2}" y1="${topY}" x2="${cx + wTop / 2}" y2="${topY}" stroke="#fbf8f2" stroke-width="7"/>`;
      bands += `<polygon points="${cx - wTop / 2},${topY} ${cx + wTop / 2},${topY} ${cx + wBot / 2},${botY} ${cx - wBot / 2},${botY}" fill="${layer.color}"/>`;

      if (midW >= 80) {
        bands += `<text x="${cx}" y="${midY - 16}" text-anchor="middle" fill="#fff" font-family="'Libre Franklin','Noto Sans TC',sans-serif" font-weight="700" font-size="26">${esc(layer.label)}</text>`;
        bands += `<text x="${cx}" y="${midY + 10}" text-anchor="middle" fill="rgba(255,255,255,.9)" font-family="'Source Serif 4','Noto Serif TC',serif" font-size="31" font-weight="600">$${fmt(layer.amt)}</text>`;
        if (layer.sub && midW > 180) bands += `<text x="${cx}" y="${midY + 34}" text-anchor="middle" fill="rgba(255,255,255,.65)" font-family="'Libre Franklin','Noto Sans TC',sans-serif" font-size="19">${esc(layer.sub)}</text>`;
      } else {
        const lx = cx + wTop / 2 + 16;
        bands += `<line x1="${cx + wTop / 2}" y1="${midY}" x2="${lx + 6}" y2="${midY}" stroke="#cdbfa8" stroke-width="1" stroke-dasharray="3 3"/>`;
        bands += `<text x="${lx + 10}" y="${midY - 5}" font-size="16" font-weight="700" fill="#222a36" font-family="'Libre Franklin','Noto Sans TC',sans-serif">${esc(layer.label)}　$${fmt(layer.amt)}</text>`;
      }

      const ann = annots[i];
      const rightX = cx + wTop / 2 + 2;
      const annX = cx + topW / 2 + 30;
      const hasThree = !!ann.line3;
      const y1 = hasThree ? midY - 22 : midY - 10;
      const y2 = hasThree ? midY + 2 : midY + 10;
      annLines += `<line x1="${rightX}" y1="${midY}" x2="${annX}" y2="${midY}" stroke="#cdbfa8" stroke-width="0.8" stroke-dasharray="3 2"/>`;
      if (ann.line1) annLines += `<text x="${annX + 6}" y="${y1}" font-size="23" font-weight="700" fill="#222a36" font-family="'Libre Franklin','Noto Sans TC',sans-serif">${esc(ann.line1)}</text>`;
      if (ann.line2) annLines += `<text x="${annX + 6}" y="${y2}" font-size="19" fill="#7a6f63" font-family="'Libre Franklin','Noto Sans TC',sans-serif">${esc(ann.line2)}</text>`;
      if (ann.line3) annLines += `<text x="${annX + 6}" y="${midY + 24}" font-size="19" fill="#3f7a57" font-family="'Libre Franklin','Noto Sans TC',sans-serif">${esc(ann.line3)}</text>`;
    });

    return `<svg class="funnel-svg" viewBox="0 0 ${svgW} ${Math.round(svgH)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="資產放大結構漏斗圖" xmlns="http://www.w3.org/2000/svg">${bands}${annLines}</svg>`;
  }

  function funnelNarrow(layers) {
    const svgW = 720, cx = 360, topW = 660, tipW = 220, bandH = 112, gap = 8, topY0 = 16;
    const nL = layers.length;
    const svgH = topY0 + nL * (bandH + gap) + 12;
    let bands = "";

    layers.forEach((layer, i) => {
      const wTop = topW - (topW - tipW) * (i / nL);
      const wBot = topW - (topW - tipW) * ((i + 1) / nL);
      const topY = topY0 + i * (bandH + gap);
      const botY = topY + bandH;
      const midY = topY + bandH / 2;

      bands += `<polygon points="${cx - wTop / 2},${topY} ${cx + wTop / 2},${topY} ${cx + wBot / 2},${botY} ${cx - wBot / 2},${botY}" fill="${layer.color}"/>`;
      // 窄版色塊只放「名稱 + 金額」；長名稱截斷，其餘資訊移到 SVG 外的列表
      const label = layer.label.length > 14 ? layer.label.slice(0, 13) + "…" : layer.label;
      bands += `<text x="${cx}" y="${midY - 10}" text-anchor="middle" fill="#fff" font-family="'Libre Franklin','Noto Sans TC',sans-serif" font-weight="700" font-size="28">${esc(label)}</text>`;
      bands += `<text x="${cx}" y="${midY + 26}" text-anchor="middle" fill="rgba(255,255,255,.92)" font-family="'Source Serif 4','Noto Serif TC',serif" font-size="34" font-weight="600">$${fmt(layer.amt)}</text>`;
    });

    return `<svg class="funnel-svg" viewBox="0 0 ${svgW} ${Math.round(svgH)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="資產放大結構漏斗圖" xmlns="http://www.w3.org/2000/svg">${bands}</svg>`;
  }

  function funnelNotes(layers, annots) {
    const items = layers.map((layer, i) => {
      const a = annots[i];
      const lines = [a.line1, a.line2].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join("");
      const yield3 = a.line3 ? `<span class="fn-yield">${esc(a.line3)}</span>` : "";
      return `<li><i style="background:${layer.color}"></i><b>${esc(layer.label)}</b>${lines}${yield3}</li>`;
    }).join("");
    return `<ul class="funnel-notes">${items}</ul>`;
  }

  /* 回傳 .funnel-wrap 的完整內容：兩份 SVG + 窄版註解 + 圖說 */
  function funnelBlock(R) {
    const { layers, annots } = funnelLayers(R);
    return `<div class="funnel-wrap">
      <div class="funnel--wide">${funnelWide(layers, annots)}</div>
      <div class="funnel--narrow">${funnelNarrow(layers)}${funnelNotes(layers, annots)}</div>
      <p class="fcaption">資產總市值為基礎，透過私行融資逐層放大，展示每項商品的買入金額</p>
    </div>`;
  }

  /* ==========================================================================
     損益分類帳（快照與匯出共用）
     ========================================================================== */
  function ledgerHtml(R) {
    let inc = (R.incRows || []).map(r =>
      `<tr class="inc"><td>${esc(r.name)} <span class="meta">$${fmt(r.base)}</span></td><td class="num">${pct(r.rate, 2)}%</td><td class="num">+${fmt(r.amt)}</td></tr>`
    ).join("");
    if (!inc) inc = `<tr class="inc"><td colspan="3" style="color:var(--ink-soft)">尚無收益項目（填入收益率）</td></tr>`;

    return `<table>
      <thead><tr><th>項目 Item</th><th class="num">率</th><th class="num">年度金額 (USD)</th></tr></thead>
      <tbody>
        <tr class="grp"><td colspan="3">資產收益 Income</td></tr>${inc}
        <tr class="sub"><td>年度總收益</td><td class="num"></td><td class="num">${fmt(R.income)}</td></tr>
        <tr class="grp"><td colspan="3">融資成本與費用 Cost</td></tr>
        <tr class="cost"><td>${esc(R.fundCcy)} 借款利息 <span class="meta">$${fmt(R.loan)}</span></td><td class="num">${pct(R.borrowRate, 2)}%</td><td class="num">(${fmt(R.interest)})</td></tr>
        <tr class="cost"><td>保管費 <span class="meta">計費基礎 $${fmt(R.custodyBase)}</span></td><td class="num">${pct(R.custodyRate || 0, 2)}%</td><td class="num">(${fmt(R.custody)})</td></tr>
        <tr class="sub"><td>成本與費用合計</td><td class="num"></td><td class="num">(${fmt(R.cost)})</td></tr>
        <tr class="net"><td>淨年度回報 Net Return</td><td class="num"></td><td class="num">${fmt(R.net)}</td></tr>
      </tbody></table>`;
  }

  /* ==========================================================================
     簡報快照檢視
     ========================================================================== */
  function renderSnapshot() {
    const R = RES;
    if (R.cap == null) return;

    const funnel = funnelBlock(R);
    const ledger = ledgerHtml(R);
    const negBuf = R.free < 0;
    const totalBuy = (R.totalMV || 0) + (R.loan || 0);

    $("#snapView").innerHTML = `
      <div class="snap-actions">
        <button type="button" class="btn" data-print>列印 / 存 PDF</button>
        <button type="button" class="btn" id="btnExportClient">⬇ 匯出客戶快照 HTML</button>
      </div>

      <div class="snap-head">
        <h1>私銀資產活化總覽</h1>
        <div class="sub">各商品投入分布 · 損益層 ｜ 與計算頁即時連動</div>
        <div class="tag">幣別 <b>USD</b><br>融資 <b>${esc(R.fundCcy)}</b> @ ${pct(R.borrowRate, 2)}%<br>${new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })}</div>
      </div>

      <div class="snap-sec">
        <div class="snap-sectitle"><span class="n">I</span><h2>資產放大結構</h2><span class="en">Asset Leverage Structure</span></div>
        <div class="snap-rule"></div>
        ${funnel}
        <div class="snap-chips">
          <div><div class="l">總買入金額</div><div class="v m">$${fmt(totalBuy)}</div></div>
          <div><div class="l">淨年度回報</div><div class="v gr">$${fmt(R.net || 0)}</div></div>
          <div><div class="l">自備金年化報酬率</div><div class="v g">${pct(R.roe || 0, 2)}%</div></div>
        </div>
        <div class="snap-explain">
          <p>客戶以市值合計 <b>$${fmt(R.totalMV || 0)}</b> 的資產組合押入私人銀行，透過融資額度取得 <b>$${fmt(R.loan || 0)}</b> 的借入資金，總買入規模擴大至 <b>$${fmt(totalBuy)}</b>，資金放大倍數約 <b>${pct((R.totalMV || 0) > 0 ? totalBuy / R.totalMV * 100 : 100, 1)}%</b>。</p>
          <p>借入資金依序配置於各商品，利用各資產的收益率覆蓋融資成本（${pct(R.borrowRate || 0, 2)}%），形成正向利差 <b>${pct(R.spread || 0, 2)}%</b>，年化淨回報 <b>$${fmt(R.net || 0)}</b>。</p>
          <p>自備金年化報酬率 <b>${pct(R.roe || 0, 2)}%</b>，遠高於單純持有資產的配息收益，體現私行融資的槓桿增值效果。${negBuf ? '<span style="color:var(--red)"> ⚠ 目前已超出核貸額度，請留意補倉風險。</span>' : R.free < R.cap * 0.15 ? '<span style="color:var(--gold)"> 緩衝偏低，建議保留至少 15% 額度以應對資產波動。</span>' : ''}</p>
        </div>
      </div>

      <div class="snap-sec">
        <div class="snap-sectitle"><span class="n">II</span><h2>資金結構</h2><span class="en">Capital Structure</span></div>
        <div class="snap-rule"></div>
        <div class="soft-box">
          <div class="chart-legend" id="deployLegend"></div>
          <div class="chart-box chart-box--lg"><canvas id="deployChart"></canvas></div>
        </div>
      </div>

      <div class="snap-sec">
        <div class="snap-sectitle"><span class="n">III</span><h2>損益試算</h2><span class="en">P&amp;L</span></div>
        <div class="snap-rule"></div>
        <div class="pnl-grid">
          <div class="ledger">${ledger}</div>
          <div class="snap-stats">
            <div class="snap-stat s1"><div class="l">淨年度回報</div><div class="v"><span class="u">$</span>${fmt(R.net)}</div><div class="s">收益 ${fmt(R.income)} − 成本費用 ${fmt(R.cost)}</div></div>
            <div class="snap-stat s3"><div class="l">自備金年化報酬率</div><div class="v">${pct(R.roe, 2)}<span class="u">%</span></div><div class="s">淨回報 ${fmt(R.net)} / 自備金 $${fmt(R.ownFunds)}</div></div>
          </div>
        </div>
        <div class="snap-foot">
          <b>風險提示：</b>額度利用率 ${pct(R.util, 1)}%，${negBuf ? '已超出抵押額度' : '緩衝僅 $' + fmt(R.free)}；全組合同步下跌約 <b>${pct(R.tol, 2)}%</b> 即觸發 Margin Call。${R.fundCcy !== "USD" ? '融資為 ' + esc(R.fundCcy) + '、資產多為 USD，' + esc(R.fundCcy) + ' 升值將同步推升借款美元等值與利息。' : ''}實際 LTV、利率與補倉規則以銀行最終核准為準。
        </div>
      </div>`;

    const ec = $("#btnExportClient");
    if (ec) ec.onclick = () => exportClientHTML(R, funnel, ledger, negBuf);

    // 資金部署圖
    const canv = $("#deployChart");
    if (canv && typeof Chart !== "undefined") {
      const datasets = deployDatasets(R.totalMV || 0, (R.uses || []).filter(r => r.amt > 0));
      const leg = $("#deployLegend");
      if (leg) leg.innerHTML = legendHtml(datasets);
      if (window._deployChart) window._deployChart.destroy();
      window._deployChart = new Chart(canv, { type: "bar", data: { labels: ["操作前", "操作後"], datasets }, options: CHART_OPTS });
    }
  }

  /* ==========================================================================
     匯出單檔客戶快照 HTML
     樣式來自 assets/js/client-snapshot-css.js（單檔必須自帶 CSS，不能 <link>）
     ========================================================================== */
  function exportClientHTML(R, funnel, ledger, negBuf) {
    const db = cmLoad();
    const cur = currentCaseId && db[currentCaseId];
    const caseName = cur ? cur.name : "快照";
    const caseNote = cur ? (cur.note || "") : "";
    const dateStr = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
    const totalBuy = (R.totalMV || 0) + (R.loan || 0);

    const clientHTML = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>資產活化快照 · ${esc(caseName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@500;600;700&display=swap" rel="stylesheet">
<style>${window.CLIENT_SNAPSHOT_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="print-btn"><button type="button" onclick="window.print()">列印 / 儲存 PDF</button></div>

  <div class="snap-head">
    <h1>${esc(caseName)}</h1>
    <div class="sub">${caseNote ? esc(caseNote) + ' ｜ ' : ''}私銀資產活化總覽 · 各商品投入分布 · 損益層</div>
    <div class="tag">幣別 <b>USD</b><br>融資 <b>${esc(R.fundCcy)}</b> @ ${pct(R.borrowRate, 2)}%<br>${dateStr}</div>
  </div>

  <div class="snap-sec">
    <div class="snap-sectitle"><span class="n">I</span><h2>資產放大結構</h2><span class="en">Asset Leverage Structure</span></div>
    <div class="snap-rule"></div>
    ${funnel}
    <div class="snap-chips">
      <div><div class="l">總買入金額</div><div class="v m">$${fmt(totalBuy)}</div></div>
      <div><div class="l">淨年度回報</div><div class="v gr">$${fmt(R.net || 0)}</div></div>
      <div><div class="l">自備金年化報酬率</div><div class="v g">${pct(R.roe || 0, 2)}%</div></div>
    </div>
  </div>

  <div class="snap-sec">
    <div class="snap-sectitle"><span class="n">II</span><h2>損益試算</h2><span class="en">P&amp;L</span></div>
    <div class="snap-rule"></div>
    <div class="pnl-grid">
      <div class="ledger">${ledger}</div>
      <div class="snap-stats">
        <div class="snap-stat s1"><div class="l">淨年度回報</div><div class="v"><span class="u">$</span>${fmt(R.net)}</div><div class="s">收益 ${fmt(R.income)} − 成本費用 ${fmt(R.cost)}</div></div>
        <div class="snap-stat s3"><div class="l">自備金年化報酬率</div><div class="v">${pct(R.roe, 2)}<span class="u">%</span></div><div class="s">淨回報 ${fmt(R.net)} / 自備金 $${fmt(R.ownFunds)}</div></div>
      </div>
    </div>
    <div class="snap-foot">
      <b>風險提示：</b>額度利用率 ${pct(R.util, 1)}%，${negBuf ? '已超出抵押額度' : '緩衝僅 $' + fmt(R.free)}；全組合同步下跌約 <b>${pct(R.tol, 2)}%</b> 即觸發 Margin Call。${R.fundCcy !== "USD" ? '融資為 ' + esc(R.fundCcy) + '、資產多為 USD，' + esc(R.fundCcy) + ' 升值將同步推升借款美元等值與利息。' : ''}實際 LTV、利率與補倉規則以銀行最終核准為準。
    </div>
  </div>

  <footer>本文件為內部試算演示，不構成任何投資建議或承諾</footer>
</div>
</body>
</html>`;

    const blob = new Blob([clientHTML], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    const safeName = caseName.replace(/[\s\/\\:*?"<>|]/g, "_");
    a.href = URL.createObjectURL(blob);
    a.download = `私銀資產活化_${safeName}_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    cmToast("⬇ 客戶快照已下載：" + a.download);
  }

  /* ==========================================================================
     檢視切換
     ========================================================================== */
  $("#tabEdit").addEventListener("click", () => {
    document.body.classList.remove("snap");
    $("#tabEdit").classList.add("active");
    $("#tabSnap").classList.remove("active");
  });

  $("#tabSnap").addEventListener("click", () => {
    document.body.classList.add("snap");
    $("#tabSnap").classList.add("active");
    $("#tabEdit").classList.remove("active");
    renderSnapshot();
    window.scrollTo(0, 0);
  });

  /* ==========================================================================
     個案管理
     ========================================================================== */
  const CM_KEY = "worldsun_cases_v1";
  let currentCaseId = null;

  function cmToast(msg) {
    const t = $("#cmToast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function cmLoad() {
    try { return JSON.parse(localStorage.getItem(CM_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function cmSave(db) { localStorage.setItem(CM_KEY, JSON.stringify(db)); }

  function cmSnapshot() {
    return {
      cols: JSON.parse(JSON.stringify(cols)),
      uses: JSON.parse(JSON.stringify(uses)),
      cfg: JSON.parse(JSON.stringify(cfg))
    };
  }

  function cmApply(snap) {
    cols = JSON.parse(JSON.stringify(snap.cols || []));
    uses = JSON.parse(JSON.stringify(snap.uses || []));
    cfg = JSON.parse(JSON.stringify(snap.cfg || BLANK_CFG()));
    render();
  }

  function cmRename(id) {
    const db = cmLoad();
    if (!db[id]) return;
    const nm = prompt("修改個案名稱：", db[id].name);
    if (nm === null) return;
    const name = nm.trim();
    if (!name) { alert("名稱不可空白"); return; }
    db[id].name = name;
    cmSave(db);
    cmRenderBar();
    cmToast("✓ 已改名為：" + name);
  }

  function cmRenderBar() {
    const db = cmLoad();
    const ids = Object.keys(db).sort((a, b) => (db[b].savedAt || 0) - (db[a].savedAt || 0));
    const list = $("#caseList");
    const lbl = $("#caseCurrentLabel");

    if (!ids.length) {
      list.innerHTML = '<span class="case-empty">尚無儲存個案</span>';
      lbl.textContent = "目前未載入任何個案 · 所有變更不會自動儲存";
      return;
    }

    list.innerHTML = ids.map(id => {
      const c = db[id];
      const active = id === currentCaseId ? "active" : "";
      return `<span class="case-chip ${active}" data-cid="${id}" title="點兩下可改名 · ${esc(c.note || c.name)}"><span class="cname">${esc(c.name)}</span><span class="cedit" data-edit="${id}" title="改名">✎</span><span class="cdel" data-del="${id}" title="刪除">×</span></span>`;
    }).join("");

    if (currentCaseId && db[currentCaseId]) {
      const c = db[currentCaseId];
      const d = new Date(c.savedAt);
      lbl.textContent = `目前個案：${c.name}${c.note ? " · " + c.note : ""} ｜ 儲存於 ${d.toLocaleDateString("zh-TW")} ${d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`;
    } else {
      lbl.textContent = "目前未載入任何個案 · 點「儲存」即可建立新個案";
    }

    list.querySelectorAll(".case-chip").forEach(chip => {
      chip.addEventListener("click", e => {
        if (e.target.classList.contains("cdel") || e.target.classList.contains("cedit")) return;
        const db2 = cmLoad();
        const id = chip.dataset.cid;
        if (!db2[id]) return;
        cmApply(db2[id].snap);
        currentCaseId = id;
        cmRenderBar();
        cmToast("已載入：" + db2[id].name);
      });
      chip.addEventListener("dblclick", e => { e.preventDefault(); cmRename(chip.dataset.cid); });
    });

    list.querySelectorAll(".cedit").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      cmRename(btn.dataset.edit);
    }));

    list.querySelectorAll(".cdel").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.dataset.del;
      const db2 = cmLoad();
      if (!db2[id]) return;
      if (!confirm(`確定刪除個案「${db2[id].name}」？`)) return;
      delete db2[id];
      cmSave(db2);
      if (currentCaseId === id) currentCaseId = null;
      cmRenderBar();
      cmToast("已刪除個案");
    }));
  }

  // 手機上使用者常直接按「儲存」而沒讓輸入框失焦，先把 DOM 的值收回模型
  function cmFlushInputs() {
    document.querySelectorAll("#tblCol input[data-f], #tblUse input[data-f]").forEach(inp => {
      const f = inp.dataset.f;
      if (!f) return;
      const tr = inp.closest("tr");
      if (!tr) return;
      const i = +tr.dataset.i;
      const arr = tr.closest("#tblCol") ? cols : uses;
      if (!arr[i]) return;
      if (f === "mv" || f === "amt") arr[i][f] = num(inp.value);
      else if (f === "ltv") arr[i].ltv = num(inp.value);
      else if (f === "yld") arr[i].yld = num(inp.value);
      else if (f === "name") arr[i].name = inp.value;
    });
  }

  function cmOpenModal(mode) {
    $("#cmMode").value = mode;
    const db = cmLoad();
    if (mode === "update" && currentCaseId && db[currentCaseId]) {
      $("#cmTitle").textContent = "更新個案";
      $("#cmName").value = db[currentCaseId].name;
      $("#cmNote").value = db[currentCaseId].note || "";
    } else {
      $("#cmTitle").textContent = "儲存新個案";
      $("#cmName").value = "";
      $("#cmNote").value = "";
    }
    $("#cmOverlay").removeAttribute("hidden");
    setTimeout(() => $("#cmName").focus(), 80);
  }

  const cmCloseModal = () => $("#cmOverlay").setAttribute("hidden", "");

  $("#btnSaveCase").addEventListener("click", () => {
    cmFlushInputs();
    const db = cmLoad();
    if (currentCaseId && db[currentCaseId]) {
      db[currentCaseId] = {
        name: db[currentCaseId].name,
        note: db[currentCaseId].note || "",
        savedAt: Date.now(),
        snap: cmSnapshot()
      };
      cmSave(db);
      cmRenderBar();
      cmToast("✓ 已儲存：" + db[currentCaseId].name);
    } else {
      cmOpenModal("new");
    }
  });

  $("#btnNewCase").addEventListener("click", () => {
    if (currentCaseId || cols.some(c => c.mv > 0) || uses.some(u => u.amt > 0)) {
      if (!confirm("開新個案會清空目前畫面的資料（未儲存的變更將遺失）。確定繼續？")) return;
    }
    cols = []; uses = []; cfg = BLANK_CFG();
    currentCaseId = null;
    render();
    cmRenderBar();
    cmToast("已開啟新個案，填好後點「儲存」");
  });

  $("#cmCancel").addEventListener("click", cmCloseModal);
  $("#cmOverlay").addEventListener("input", e => e.stopPropagation());
  $("#cmOverlay").addEventListener("keydown", e => {
    if (e.key === "Escape") cmCloseModal();
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") $("#cmConfirm").click();
  });
  $("#cmOverlay").addEventListener("click", e => { if (e.target === $("#cmOverlay")) cmCloseModal(); });

  $("#cmConfirm").addEventListener("click", () => {
    const name = $("#cmName").value.trim();
    if (!name) { $("#cmName").focus(); return; }
    cmFlushInputs();
    const db = cmLoad();
    const mode = $("#cmMode").value;
    const id = (mode === "update" && currentCaseId) ? currentCaseId : ("c_" + Date.now());
    db[id] = { name, note: $("#cmNote").value.trim(), savedAt: Date.now(), snap: cmSnapshot() };
    cmSave(db);
    currentCaseId = id;
    cmCloseModal();
    cmRenderBar();
    cmToast("✓ 個案已儲存：" + name);
  });

  $("#btnExportCase").addEventListener("click", () => {
    const db = cmLoad();
    let data, filename;
    if (currentCaseId && db[currentCaseId]) {
      data = { version: 1, cases: { [currentCaseId]: db[currentCaseId] } };
      filename = `worldsun_${db[currentCaseId].name.replace(/\s+/g, "_")}.json`;
    } else {
      data = { version: 1, cases: db };
      filename = `worldsun_all_cases_${new Date().toISOString().slice(0, 10)}.json`;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    cmToast("⬇ 已匯出：" + filename);
  });

  $("#btnImportCase").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        const incoming = data.cases || data;
        const db = cmLoad();
        let count = 0;
        Object.entries(incoming).forEach(([id, c]) => {
          if (c.snap && c.name) { db[id] = c; count++; }
        });
        cmSave(db);
        cmRenderBar();
        cmToast(`✓ 已匯入 ${count} 個個案`);
      } catch (err) { alert("JSON 格式錯誤，無法匯入"); }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  /* ==========================================================================
     啟動
     ========================================================================== */
  $("#stamp").textContent = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  cols = JSON.parse(JSON.stringify(PRESET_HUGH.cols));
  uses = JSON.parse(JSON.stringify(PRESET_HUGH.uses));
  cfg = JSON.parse(JSON.stringify(PRESET_HUGH.cfg));
  bindTable("#tblCol", () => cols);
  bindTable("#tblUse", () => uses);
  cmRenderBar();
  render();
})();
