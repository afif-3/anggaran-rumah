/* Anggaran Rumah — client app.
   Single-file, no dependencies, no network. All data lives in localStorage;
   first load seeds realistic Indonesian household sample data (injected by
   main.ts at build time). */

(function () {
  "use strict";

  var LS_KEY = "anggaran-rumah-v1";
  var SEED = __SEED_JSON__;

  /* ---------------- state ---------------- */

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.categories)) return parsed;
      }
    } catch (e) { /* corrupted storage: fall through to seed */ }
    var fresh = clone(SEED);
    saveState(fresh);
    return fresh;
  }

  function saveState(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  }

  var state = loadState();
  var months = state.months.slice().sort();
  var currentMonth = months[months.length - 1];
  var txFilter = { q: "", cat: "all" };
  var txType = "expense"; // modal type toggle

  /* ---------------- helpers ---------------- */

  function $(id) { return document.getElementById(id); }

  function fmtRp(n) {
    var neg = n < 0;
    var abs = Math.abs(Math.round(n));
    var s = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-Rp " : "Rp ") + s;
  }

  function fmtShort(n) {
    if (Math.abs(n) >= 1000000) return "Rp " + (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1).replace(".", ",") + " jt";
    if (Math.abs(n) >= 1000) return "Rp " + Math.round(n / 1000) + " rb";
    return fmtRp(n);
  }

  function monthLabel(m) {
    var names = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    var parts = m.split("-");
    return names[parseInt(parts[1], 10) - 1] + " " + parts[0];
  }

  function shortMonth(m) {
    return monthLabel(m).slice(0, 3) + " " + m.slice(2, 4);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function catById(id) {
    for (var i = 0; i < state.categories.length; i++) {
      if (state.categories[i].id === id) return state.categories[i];
    }
    return { id: id, name: "Other", icon: "📦", color: "#64748b" };
  }

  function monthTx(month) {
    return state.transactions.filter(function (t) { return t.month === month; });
  }

  function monthIncome(month) {
    return state.income.filter(function (x) { return x.month === month; })
      .reduce(function (a, x) { return a + x.amount; }, 0);
  }

  function monthSpent(month) {
    return monthTx(month).filter(function (t) { return t.type === "expense"; })
      .reduce(function (a, t) { return a + t.amount; }, 0);
  }

  function catSpent(month, catId) {
    return monthTx(month).filter(function (t) { return t.type === "expense" && t.category === catId; })
      .reduce(function (a, t) { return a + t.amount; }, 0);
  }

  function pct(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 100);
  }

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  /* ---------------- summary ---------------- */

  function renderSummary() {
    var income = monthIncome(currentMonth);
    var spent = monthSpent(currentMonth);
    var left = income - spent;
    var rate = income > 0 ? Math.round(((income - spent) / income) * 100) : 0;

    $("stat-income").textContent = fmtRp(income);
    $("stat-spent").textContent = fmtRp(spent);
    $("stat-left").textContent = fmtRp(left);
    $("stat-left").parentElement.classList.toggle("left", true);
    $("stat-rate").textContent = rate + "%";
    var rateNote = rate >= 20 ? "Excellent — above the 20% rule of thumb."
      : rate >= 10 ? "Good — on track. Aim for 20% if you can."
      : rate >= 0 ? "Tight month — review the biggest categories below."
      : "Overspent this month — see the insights below.";
    $("stat-rate-sub").textContent = rateNote;
    $("stat-spent-sub").textContent = "Across " + monthTx(currentMonth).filter(function (t) { return t.type === "expense"; }).length + " expenses";
    $("stat-income-sub").textContent = state.income.filter(function (x) { return x.month === currentMonth; }).length + " income source(s)";
    $("month-label").textContent = monthLabel(currentMonth);

    var idx = months.indexOf(currentMonth);
    $("btn-prev").disabled = idx <= 0;
    $("btn-next").disabled = idx >= months.length - 1;

    var pill = $("month-pill");
    if (left >= 0) {
      pill.textContent = "✓ Within budget";
      pill.className = "pill good";
    } else {
      pill.textContent = "⚠ Over by " + fmtRp(-left);
      pill.className = "pill over";
    }
  }

  /* ---------------- budgets ---------------- */

  function renderBudgets() {
    var spent = monthSpent(currentMonth);
    var host = $("budget-list");
    var rows = state.categories.map(function (c) {
      var s = catSpent(currentMonth, c.id);
      var p = c.budget > 0 ? Math.round((s / c.budget) * 100) : 0;
      var over = s > c.budget;
      var near = !over && p >= 85;
      var cls = over ? "over" : near ? "near" : "";
      var note = over
        ? "Over budget by " + fmtRp(s - c.budget) + " — consider shifting from a category with room."
        : p >= 85
          ? "Almost at the limit — " + fmtRp(c.budget - s) + " left."
          : fmtRp(c.budget - s) + " left of " + fmtRp(c.budget) + " budget.";
      return { c: c, s: s, p: p, cls: cls, note: note, over: over };
    });
    rows.sort(function (a, b) { return b.p - a.p; });
    var totalBudget = state.categories.reduce(function (a, c) { return a + c.budget; }, 0);

    host.innerHTML = rows.map(function (r) {
      return '<div class="budget-row">' +
        '<div class="budget-top"><span class="budget-name"><span class="dot" style="background:' + r.c.color + '"></span>' + esc(r.c.name) + '</span>' +
        '<span class="budget-amounts"><b>' + fmtRp(r.s) + '</b> / ' + fmtRp(r.c.budget) + ' · ' + r.p + '%</span></div>' +
        '<div class="bar ' + r.cls + '" role="progressbar" aria-valuenow="' + Math.min(r.p, 100) + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(r.c.name) + ' budget used ' + r.p + ' percent">' +
        '<i style="width:' + Math.min(r.p, 100) + '%;background:' + (r.over ? "" : r.c.color) + '"></i></div>' +
        '<div class="budget-note ' + (r.over ? "over" : "under") + '">' + esc(r.note) + '</div>' +
        '</div>';
    }).join("");

    $("budget-total").textContent = fmtRp(spent) + " of " + fmtRp(totalBudget) + " planned";
    var overCount = rows.filter(function (r) { return r.over; }).length;
    $("budget-hint").textContent = overCount
      ? overCount + " categor" + (overCount === 1 ? "y" : "ies") + " over budget this month."
      : "All categories within budget this month. Nice work.";
  }

  /* ---------------- donut chart (hand-rolled SVG) ---------------- */

  function donutSVG(data, total) {
    var size = 190, r = 78, cx = size / 2, cy = size / 2, stroke = 26;
    var C = 2 * Math.PI * r;
    var offset = 0;
    var parts = data.map(function (d) {
      var frac = total > 0 ? d.value / total : 0;
      var len = frac * C;
      var dash = len.toFixed(2) + " " + (C - len).toFixed(2);
      var dashoffset = (-offset).toFixed(2);
      offset += len;
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + d.color +
        '" stroke-width="' + stroke + '" stroke-dasharray="' + dash + '" stroke-dashoffset="' + dashoffset + '"/>';
    }).join("");
    var start = -Math.PI / 2;
    // rotate so first slice starts at top
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="Spending by category chart">' +
      '<g transform="rotate(-90 ' + cx + ' ' + cy + ')">' + parts + '</g>' +
      '<text x="' + cx + '" y="' + (cy - 2) + '" class="donut-total">' + fmtShort(total) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 18) + '" class="donut-center">spent in ' + esc(monthLabel(currentMonth)) + '</text>' +
      '</svg>';
  }

  function renderDonut() {
    var data = state.categories.map(function (c) {
      return { name: c.name, color: c.color, value: catSpent(currentMonth, c.id) };
    }).filter(function (d) { return d.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
    var total = monthSpent(currentMonth);
    $("donut").innerHTML = donutSVG(data, total);
    $("donut-legend").innerHTML = data.map(function (d) {
      return '<li><span class="lg-name"><span class="dot" style="background:' + d.color + '"></span>' + esc(d.name) + '</span>' +
        '<span class="lg-val">' + fmtRp(d.value) + ' · ' + pct(d.value, total) + '%</span></li>';
    }).join("") || '<li class="empty">No spending recorded this month yet.</li>';
  }

  /* ---------------- trend bars ---------------- */

  function renderTrend() {
    var maxV = 0;
    months.forEach(function (m) {
      maxV = Math.max(maxV, monthIncome(m), monthSpent(m));
    });
    var host = $("trend");
    host.innerHTML = months.map(function (m) {
      var inc = monthIncome(m), exp = monthSpent(m);
      var ih = maxV ? Math.round((inc / maxV) * 120) : 0;
      var eh = maxV ? Math.round((exp / maxV) * 120) : 0;
      var active = m === currentMonth ? ' style="outline:2px solid var(--accent);outline-offset:3px;border-radius:6px"' : "";
      return '<div class="trend-col"' + active + '>' +
        '<span class="trend-val">' + fmtShort(exp) + '</span>' +
        '<div class="trend-bars"><i class="inc" style="height:' + Math.max(ih, 2) + 'px" title="Income ' + fmtRp(inc) + '"></i>' +
        '<i class="exp" style="height:' + Math.max(eh, 2) + 'px" title="Spent ' + fmtRp(exp) + '"></i></div>' +
        '<span class="trend-label">' + shortMonth(m) + '</span></div>';
    }).join("");
  }

  /* ---------------- transactions ---------------- */

  function filteredTx() {
    var q = txFilter.q.trim().toLowerCase();
    return monthTx(currentMonth).slice().sort(function (a, b) {
      return b.date < a.date ? -1 : b.date > a.date ? 1 : 0;
    }).filter(function (t) {
      if (txFilter.cat !== "all" && t.category !== txFilter.cat) return false;
      if (q && (t.note || "").toLowerCase().indexOf(q) === -1 && catById(t.category).name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function renderTx() {
    var list = filteredTx();
    var host = $("tx-list");
    if (!list.length) {
      host.innerHTML = '<li class="empty">No transactions match. Try clearing the search or add one below.</li>';
      return;
    }
    host.innerHTML = list.map(function (t) {
      var c = catById(t.category);
      var sign = t.type === "expense" ? "−" : "+";
      return '<li class="tx">' +
        '<span class="tx-icon" aria-hidden="true">' + c.icon + '</span>' +
        '<div class="tx-main"><div class="tx-note">' + esc(t.note || c.name) + '</div>' +
        '<div class="tx-meta">' + esc(c.name) + ' · ' + esc(t.date) + '</div></div>' +
        '<span class="tx-amount ' + t.type + '">' + sign + fmtRp(t.amount) + '</span>' +
        '<span class="tx-actions">' +
        '<button class="icon-btn" data-edit="' + t.id + '" title="Edit" aria-label="Edit ' + esc(t.note || c.name) + '">✎</button>' +
        '<button class="icon-btn" data-del="' + t.id + '" title="Delete" aria-label="Delete ' + esc(t.note || c.name) + '">🗑</button>' +
        '</span></li>';
    }).join("");
    $("tx-count").textContent = list.length + " transaction" + (list.length === 1 ? "" : "s");
  }

  function fillCatOptions(selectEl) {
    selectEl.innerHTML = state.categories.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join("");
  }

  /* ---------------- goals ---------------- */

  function renderGoals() {
    var host = $("goal-list");
    host.innerHTML = state.goals.map(function (g) {
      var p = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0;
      var left = Math.max(g.target - g.saved, 0);
      return '<div class="goal" data-goal="' + g.id + '">' +
        '<div class="goal-top"><span class="goal-name">' + esc(g.icon || "🎯") + ' ' + esc(g.name) + '</span>' +
        '<span class="goal-amounts"><b>' + fmtRp(g.saved) + '</b> / ' + fmtRp(g.target) + '</span></div>' +
        '<div class="bar" role="progressbar" aria-valuenow="' + Math.min(p, 100) + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(g.name) + ' ' + p + ' percent funded">' +
        '<i style="width:' + Math.min(p, 100) + '%"></i></div>' +
        '<div class="goal-meta"><span>' + p + '% funded</span><span>' + (left ? fmtRp(left) + ' to go · due ' + esc(g.deadline || "—") : "🎉 Fully funded!") + '</span></div>' +
        '<div class="goal-add"><label class="sr-only" for="add-' + g.id + '">Add amount to ' + esc(g.name) + '</label>' +
        '<input id="add-' + g.id + '" type="number" min="1000" step="1000" placeholder="Add Rp…" inputmode="numeric">' +
        '<button class="btn small secondary" data-goal-add="' + g.id + '">Add to goal</button></div>' +
        '</div>';
    }).join("");
    var totalSaved = state.goals.reduce(function (a, g) { return a + g.saved; }, 0);
    var totalTarget = state.goals.reduce(function (a, g) { return a + g.target; }, 0);
    $("goals-total").textContent = fmtRp(totalSaved) + " saved of " + fmtRp(totalTarget) + " in goals";
  }

  /* ---------------- insights ---------------- */

  function renderInsights() {
    var items = [];
    var income = monthIncome(currentMonth);
    var spent = monthSpent(currentMonth);

    var over = state.categories.filter(function (c) { return catSpent(currentMonth, c.id) > c.budget; });
    if (over.length) {
      var worst = over.slice().sort(function (a, b) { return catSpent(currentMonth, b.id) - catSpent(currentMonth, a.id); })[0];
      items.push({ cls: "bad", mark: "!", html: "<b>" + esc(worst.name) + "</b> is over budget by <b>" + fmtRp(catSpent(currentMonth, worst.id) - worst.budget) + "</b>. " +
        "Check the recent " + esc(worst.name.toLowerCase()) + " entries — one or two big purchases are usually the cause." });
    }

    var top = state.categories.map(function (c) { return { c: c, s: catSpent(currentMonth, c.id) }; })
      .sort(function (a, b) { return b.s - a.s; })[0];
    if (top && top.s > 0) {
      items.push({ cls: "", mark: "◉", html: "Biggest spend this month is <b>" + esc(top.c.name) + "</b> at <b>" + fmtRp(top.s) + "</b> (" + pct(top.s, spent) + "% of all spending)." });
    }

    if (income > 0) {
      var rate = Math.round(((income - spent) / income) * 100);
      if (rate >= 20) items.push({ cls: "", mark: "✓", html: "Savings rate <b>" + rate + "%</b> — above the 20% rule of thumb. That pace funds the Emergency Fund in about <b>" + Math.max(1, Math.ceil((15000000 - 9200000) / Math.max(income - spent, 1))) + " months</b>." });
      else if (rate >= 0) items.push({ cls: "warn", mark: "◐", html: "Savings rate is <b>" + rate + "%</b>. Moving <b>" + fmtRp(Math.round(income * 0.05)) + "</b> from Eating Out &amp; Entertainment would lift it to " + (rate + 5) + "%." });
      else items.push({ cls: "bad", mark: "!", html: "You spent <b>" + fmtRp(spent - income) + "</b> more than you earned in " + esc(monthLabel(currentMonth)) + ". Pause non-essential spending until next payday." });
    }

    var prevIdx = months.indexOf(currentMonth) - 1;
    if (prevIdx >= 0) {
      var prevSpent = monthSpent(months[prevIdx]);
      var diff = spent - prevSpent;
      var dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
      items.push({ cls: "", mark: "↔", html: "Spending is <b>" + dir + " " + fmtRp(Math.abs(diff)) + "</b> vs " + esc(monthLabel(months[prevIdx])) + " (" + fmtRp(prevSpent) + ")." });
    }

    $("insights").innerHTML = items.map(function (it) {
      return '<div class="insight ' + it.cls + '"><span class="mark" aria-hidden="true">' + it.mark + '</span><div>' + it.html + '</div></div>';
    }).join("");
  }

  /* ---------------- render all ---------------- */

  function renderAll() {
    renderSummary();
    renderBudgets();
    renderDonut();
    renderTrend();
    renderTx();
    renderGoals();
    renderInsights();
    $("household-name").textContent = state.household.name + " · " + state.household.city;
  }

  /* ---------------- modal: add / edit transaction ---------------- */

  var editingId = null;

  function openModal(editTx) {
    var dlg = $("tx-modal");
    editingId = editTx ? editTx.id : null;
    $("modal-title").textContent = editTx ? "Edit transaction" : "Add transaction";
    $("f-date").value = editTx ? editTx.date : currentMonth + "-26";
    $("f-amount").value = editTx ? editTx.amount : "";
    $("f-note").value = editTx ? (editTx.note || "") : "";
    fillCatOptions($("f-category"));
    if (editTx) $("f-category").value = editTx.category;
    setType(editTx ? editTx.type : "expense");
    if (typeof dlg.showModal === "function") dlg.showModal();
  }

  function setType(t) {
    txType = t;
    $("type-expense").classList.toggle("on", t === "expense");
    $("type-income").classList.toggle("on", t === "income");
    $("f-category").disabled = t === "income";
  }

  function submitModal(e) {
    e.preventDefault();
    var amount = Math.round(parseFloat($("f-amount").value));
    var date = $("f-date").value;
    var note = $("f-note").value.trim();
    if (!amount || amount <= 0) { toast("Enter an amount greater than 0."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast("Pick a valid date."); return; }
    var month = date.slice(0, 7);
    if (txType === "income") {
      if (editingId) {
        var old = state.income.find(function (x) { return x.id === editingId; });
        if (old) { old.amount = amount; old.date = date; old.month = month; old.source = note || "Income"; }
      } else {
        state.income.push({ id: uid("i"), month: month, date: date, source: note || "Income", amount: amount });
      }
    } else {
      var cat = $("f-category").value;
      if (editingId) {
        var tx = state.transactions.find(function (x) { return x.id === editingId; });
        if (tx) { tx.amount = amount; tx.date = date; tx.month = month; tx.category = cat; tx.note = note; }
      } else {
        state.transactions.push({ id: uid("t"), month: month, date: date, type: "expense", category: cat, note: note || catById(cat).name, amount: amount });
      }
    }
    if (months.indexOf(month) === -1) { months.push(month); months.sort(); state.months = months.slice(); }
    saveState(state);
    currentMonth = month;
    $("tx-modal").close();
    renderAll();
    toast(editingId ? "Transaction updated." : "Transaction added.");
  }

  /* ---------------- data tools ---------------- */

  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "anggaran-rumah-" + currentMonth + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("Backup downloaded.");
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.categories) || !Array.isArray(parsed.income)) {
          throw new Error("bad shape");
        }
        state = parsed;
        state.months = state.months && state.months.length ? state.months.slice().sort()
          : Array.from(new Set(state.transactions.map(function (t) { return t.month; }).concat(state.income.map(function (x) { return x.month; })))).sort();
        months = state.months.slice().sort();
        currentMonth = months[months.length - 1];
        saveState(state);
        renderAll();
        toast("Backup imported.");
      } catch (err) {
        toast("That file is not a valid Anggaran Rumah backup.");
      }
    };
    reader.readAsText(file);
  }

  function resetData() {
    if (!window.confirm("Reset everything back to the sample household data? Your edits will be lost.")) return;
    state = clone(SEED);
    months = state.months.slice().sort();
    currentMonth = months[months.length - 1];
    saveState(state);
    renderAll();
    toast("Sample data restored.");
  }

  /* ---------------- wire up ---------------- */

  function init() {
    $("btn-prev").addEventListener("click", function () {
      var i = months.indexOf(currentMonth);
      if (i > 0) { currentMonth = months[i - 1]; renderAll(); }
    });
    $("btn-next").addEventListener("click", function () {
      var i = months.indexOf(currentMonth);
      if (i < months.length - 1) { currentMonth = months[i + 1]; renderAll(); }
    });

    $("btn-add").addEventListener("click", function () { openModal(null); });
    $("btn-add-2").addEventListener("click", function () { openModal(null); });
    $("tx-form").addEventListener("submit", submitModal);
    $("type-expense").addEventListener("click", function () { setType("expense"); });
    $("type-income").addEventListener("click", function () { setType("income"); });
    $("modal-cancel").addEventListener("click", function () { $("tx-modal").close(); });

    $("tx-search").addEventListener("input", function (e) { txFilter.q = e.target.value; renderTx(); });
    fillCatOptions($("tx-cat-filter"));
    var allOpt = document.createElement("option");
    allOpt.value = "all"; allOpt.textContent = "All categories";
    $("tx-cat-filter").insertBefore(allOpt, $("tx-cat-filter").firstChild);
    $("tx-cat-filter").addEventListener("change", function (e) { txFilter.cat = e.target.value; renderTx(); });

    $("tx-list").addEventListener("click", function (e) {
      var delBtn = e.target.closest("[data-del]");
      var editBtn = e.target.closest("[data-edit]");
      if (delBtn) {
        var id = delBtn.getAttribute("data-del");
        var tx = state.transactions.find(function (x) { return x.id === id; });
        if (tx && window.confirm("Delete \"" + (tx.note || "this transaction") + "\" (" + fmtRp(tx.amount) + ")?")) {
          state.transactions = state.transactions.filter(function (x) { return x.id !== id; });
          saveState(state);
          renderAll();
          toast("Transaction deleted.");
        }
      } else if (editBtn) {
        var tx2 = state.transactions.find(function (x) { return x.id === editBtn.getAttribute("data-edit"); });
        if (tx2) openModal(tx2);
      }
    });

    $("goal-list").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-goal-add]");
      if (!btn) return;
      var gid = btn.getAttribute("data-goal-add");
      var input = $("add-" + gid);
      var amt = Math.round(parseFloat(input.value));
      if (!amt || amt <= 0) { toast("Enter an amount to add."); return; }
      var g = state.goals.find(function (x) { return x.id === gid; });
      if (g) {
        g.saved += amt;
        saveState(state);
        renderGoals();
        toast(fmtRp(amt) + " added to " + g.name + ".");
      }
    });

    $("btn-export").addEventListener("click", exportData);
    $("btn-import").addEventListener("click", function () { $("file-import").click(); });
    $("file-import").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });
    $("btn-reset").addEventListener("click", resetData);

    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
