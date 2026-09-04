/* ZachGPT Support — visninger og logik.
   Datalaget ligger i store.js, indholdet i data.js. */
(function (ZG) {
  "use strict";

  /* ============ Tilstand ============ */

  var PRESETS = ZG.PRESETS, URGENCY = ZG.URGENCY, TIERS = ZG.TIERS;
  var STAGES = ZG.STAGES, REBOOTS = ZG.REBOOTS;

  var store = ZG.createStore();
  var connected = false, dbReady = false;
  var invoices = [], tickets = [], tips = {};
  var view = "queue", currentSlug = null, editing = null, draft = null;
  var lastTicket = null;
  var main = document.getElementById("main");

  function kr(n) {
    return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function slugify(s) {
    return String(s).toLowerCase()
      .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }
  function hashNo(s, span, base) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % span;
    return base + h;
  }
  function subtotal(inv) { return (inv.items || []).reduce(function (s, it) { return s + it.qty * it.unit; }, 0); }
  function grandTotal(inv) { return Math.max(0, subtotal(inv) - (inv.discount || 0)); }
  function tierFor(pct) {
    for (var i = 0; i < TIERS.length; i++) if (pct >= TIERS[i].min) return TIERS[i];
    return TIERS[TIERS.length - 1];
  }
  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }
  function urgencyById(id) {
    for (var i = 0; i < URGENCY.length; i++) if (URGENCY[i].id === id) return URGENCY[i];
    return URGENCY[0];
  }
  function whenText(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" }) + " kl. " +
           d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  }

  var openTickets = function () { return tickets.filter(function (t) { return t.status === "open"; }); };
  var doneTickets = function () { return tickets.filter(function (t) { return t.status === "done"; }); };

  /* ============ Store ============ */

  function connect() {
    store.init().then(function (kind) {
      connected = store.ok();
      dbReady = true;

      store.watch("invoices", function (docs) {
        invoices = docs.map(function (v) {
          return {
            slug: v.id, name: v.name || v.id, greeting: v.greeting || "",
            items: Array.isArray(v.items) ? v.items : [],
            discount: Number(v.discount) || 0, order: Number(v.order) || 0
          };
        }).sort(function (a, b) { return a.order - b.order || a.name.localeCompare(b.name, "da"); });
        render();
      });

      store.watch("tickets", function (docs) {
        tickets = docs.map(function (v) {
          return {
            id: v.id, name: v.name || "", slug: v.slug || slugify(v.name || ""),
            cat: v.cat || "support", desc: v.desc || "", urgency: v.urgency || "lav",
            status: v.status || "open", at: v.at || "", doneAt: v.doneAt || ""
          };
        }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
        render();
      });

      store.watch("tips", function (docs) {
        tips = {};
        docs.forEach(function (v) { tips[v.id] = v; });
        render();
      });

      render();
      if (kind === "local") console.info("[ZachGPT] Kører på localStorage — data deles ikke mellem browsere. Se README.");
    }, function () {
      dbReady = true;
      render();
    });
  }

  function saveInvoice(inv) {
    return store.set("invoices", inv.slug, {
      name: inv.name, greeting: inv.greeting, items: inv.items,
      discount: inv.discount, order: inv.order || Date.now()
    });
  }
  function saveTip(slug, body) {
    tips[slug] = body;
    store.set("tips", slug, body).catch(function () {});
  }
  function setTicketStatus(id, status) {
    var patch = { status: status };
    if (status === "done") patch.doneAt = new Date().toISOString();
    return store.update("tickets", id, patch);
  }

  /* ============ Navigation ============ */

  function go(v, slug) {
    view = v; currentSlug = slug || null;
    if (v !== "admin") editing = null;
    if (v !== "queue") lastTicket = null;
    render();
    window.scrollTo({ top: 0 });
  }
  document.getElementById("home").addEventListener("click", function () { go("queue"); });
  document.querySelectorAll("nav.tabs button").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.view); });
  });

  /* ============ Render ============ */

  function render() {
    document.querySelectorAll("nav.tabs button").forEach(function (b) {
      var active = b.dataset.view === view || (view === "invoice" && b.dataset.view === "reception");
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });

    if (!dbReady) { main.innerHTML = '<div class="hero"><p class="lede">Åbner sagsarkivet…</p></div>'; return; }

    if (view === "invoice" && currentSlug) renderInvoice();
    else if (view === "reception") renderReception();
    else if (view === "board") renderBoard();
    else if (view === "admin") renderAdmin();
    else renderQueue();
  }

  function statsBlock() {
    var paid = Object.keys(tips).filter(function (k) { return (tips[k].pct || 0) > 0; }).length;
    var total = Object.keys(tips).reduce(function (s, k) { return s + (Number(tips[k].tip) || 0); }, 0);
    return '' +
      '<dl class="stats">' +
        '<div class="stat"><dt>Sager i kø</dt><dd>' + openTickets().length + '<span class="fine">Behandles i tilfældig rækkefølge</span></dd></div>' +
        '<div class="stat"><dt>Gns. svartid</dt><dd>4 min<span class="fine">Uden for åbningstid: 6 min</span></dd></div>' +
        '<div class="stat"><dt>Betalte regninger</dt><dd>' + paid + '<span class="fine">Af ' + invoices.length + ' udsendte</span></dd></div>' +
        '<div class="stat"><dt>Tip i alt</dt><dd>' + kr(total) + '<span class="fine">Afregnet i social kapital</span></dd></div>' +
      '</dl>';
  }

  function dbWarning() {
    if (connected) return "";
    return '<div class="notice warn">Sagsarkivet kunne ikke åbnes. Intet bliver gemt lige nu.</div>';
  }

  /* ---- Køen ---- */

  function renderQueue() {
    var open = openTickets(), done = doneTickets();

    var ack = "";
    if (lastTicket) {
      var u = urgencyById(lastTicket.urgency);
      var pos = open.map(function (t) { return t.id; }).indexOf(lastTicket.id) + 1;
      ack = '<div class="receipt" data-mood="happy" style="margin-top:0;margin-bottom:28px" tabindex="-1" id="ack">' +
        '<div class="receipt-head">' +
          '<span class="badge">Sag oprettet</span>' +
          '<p class="msg">' + esc(u.ack) + '</p>' +
          '<p class="msg-sub">Din sag er nr. ' + (pos > 0 ? pos : open.length) + ' i køen. ' + esc(u.sla) + '</p>' +
        '</div>' +
        '<div class="receipt-body">' +
          '<p class="receipt-fine">Sagsnr. SAG-' + hashNo(lastTicket.id, 9000, 1000) + '<br>' +
          'Du modtager en opgørelse, når sagen er lukket.<br>' +
          'Ja. En opgørelse.</p>' +
        '</div>' +
      '</div>';
    }

    var openHtml = open.length ? open.map(function (t, i) { return ticketCard(t, i + 1); }).join("") :
      '<div class="empty"><p><strong>Køen er tom.</strong></p><p>Nyd det. Det varer ikke ved.</p></div>';

    var doneHtml = done.length ? done.map(function (t) { return ticketCard(t, null); }).join("") : "";

    main.innerHTML =
      '<section class="hero">' +
        '<p class="eyebrow">Supportkø · Opdateres live</p>' +
        '<h1>Opret en sag. Så tager vi den derfra.</h1>' +
        '<p class="lede">Beskriv hvad du har brug for hjælp til. Sagen lægger sig i køen, bliver løst, og bliver derefter gjort op.</p>' +
      '</section>' +
      dbWarning() + statsBlock() +
      '<h2>Ny sag</h2>' + ack + ticketForm() +
      '<h2>I kø (' + open.length + ')</h2>' + openHtml +
      (done.length ? '<h2>Løst, afventer opgørelse (' + done.length + ')</h2>' + doneHtml : "");

    wireTicketForm();
    wireTicketCards();
    var ackEl = document.getElementById("ack");
    if (ackEl) ackEl.focus();
  }

  function ticketCard(t, pos) {
    var p = presetById(t.cat);
    var u = urgencyById(t.urgency);
    var hot = t.urgency === "braen";
    var cls = "ticket" + (t.status === "done" ? " done" : (hot ? " hot" : ""));
    return '<div class="' + cls + '">' +
      '<span class="tno">SAG-' + hashNo(t.id, 9000, 1000) + ' · ' + esc(whenText(t.at)) + '</span>' +
      '<span class="ttl">' + esc(t.name) + ' — ' + esc(p ? p.desc : t.cat) + '</span>' +
      (t.desc ? '<span class="tdesc">' + esc(t.desc) + '</span>' : "") +
      '<span class="tmeta">' +
        '<span class="pill' + (hot ? " hot" : "") + '">' + esc(u.label) + '</span>' +
        (t.status === "done" ? '<span class="pill done">Løst</span>' : "") +
      '</span>' +
      '<span class="tact">' +
        (pos ? '<span class="queue-pos">Nr. ' + pos + ' i køen</span>' : '<span class="queue-pos">' + esc(u.sla) + '</span>') +
        (t.status === "open" ? '<button type="button" data-done="' + esc(t.id) + '">Marker som løst</button>' : "") +
        (t.status === "done" ? '<button type="button" data-reopen="' + esc(t.id) + '">Genåbn</button>' : "") +
        '<button type="button" class="del" data-drop="' + esc(t.id) + '">Slet</button>' +
      '</span>' +
    '</div>';
  }

  function ticketForm() {
    var cats = PRESETS.filter(function (p) { return p.id !== "navn"; }).map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.desc) + '</option>';
    }).join("");
    var urg = URGENCY.map(function (u, i) {
      return '<label class="urg">' +
        '<input type="radio" name="urg" value="' + u.id + '"' + (i === 0 ? " checked" : "") + '>' +
        '<span class="u-lbl">' + esc(u.label) + '</span>' +
        '<span class="u-sla">' + esc(u.sla) + '</span>' +
      '</label>';
    }).join("");

    return '<div class="formcard">' +
      '<div class="field"><label for="t-name">Dit navn</label>' +
        '<input type="text" id="t-name" placeholder="Fx Mette fra Kundeservice"></div>' +
      '<div class="field"><label for="t-cat">Hvad drejer det sig om?</label>' +
        '<select id="t-cat">' + cats + '</select></div>' +
      '<div class="field"><label for="t-desc">Kort beskrivelse</label>' +
        '<textarea id="t-desc" placeholder="Fx: Kunden kan ikke vælge pakkeshop i checkout. Igen."></textarea></div>' +
      '<div class="field"><label>Hastegrad</label><div class="urgency">' + urg + '</div>' +
        '<span class="hint">Hastegrad påvirker svartiden. Ikke nødvendigvis i den retning du håber.</span></div>' +
      '<div class="admin-actions">' +
        '<button class="btn-primary" type="button" id="t-send">Opret sag</button>' +
        '<span id="t-msg" aria-live="polite" style="font-size:14px;color:var(--muted)"></span>' +
      '</div>' +
    '</div>';
  }

  function wireTicketForm() {
    var btn = document.getElementById("t-send");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var msg = document.getElementById("t-msg");
      var name = document.getElementById("t-name").value.trim();
      if (!name) { msg.textContent = "Skriv dit navn først."; document.getElementById("t-name").focus(); return; }
      if (!connected) { msg.textContent = "Sagsarkivet er ikke tilgængeligt her."; return; }

      var body = {
        name: name, slug: slugify(name),
        cat: document.getElementById("t-cat").value,
        desc: document.getElementById("t-desc").value.trim(),
        urgency: (document.querySelector('input[name="urg"]:checked') || {}).value || "lav",
        status: "open", at: new Date().toISOString(), doneAt: ""
      };
      msg.textContent = "Opretter…";
      store.add("tickets", body).then(function (id) {
        lastTicket = { id: id, urgency: body.urgency };
        render();
      }).catch(function () { msg.textContent = "Kunne ikke oprette sagen. Prøv igen."; });
    });
  }

  function wireTicketCards() {
    main.querySelectorAll("[data-done]").forEach(function (b) {
      b.addEventListener("click", function () { setTicketStatus(b.dataset.done, "done").catch(function () {}); });
    });
    main.querySelectorAll("[data-reopen]").forEach(function (b) {
      b.addEventListener("click", function () { setTicketStatus(b.dataset.reopen, "open").catch(function () {}); });
    });
    main.querySelectorAll("[data-drop]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Slet denne sag?")) return;
        store.remove("tickets", b.dataset.drop).catch(function () {});
      });
    });
  }

  /* ---- Reception ---- */

  function renderReception() {
    var rows = invoices.map(function (inv) {
      var t = tips[inv.slug];
      var pill = '<span class="pill">Ubetalt</span>';
      var amt = kr(grandTotal(inv));
      if (t && (t.pct || 0) > 0) { pill = '<span class="pill paid">Betalt · ' + t.pct + ' %</span>'; amt = kr(Number(t.total) || 0); }
      else if (t) { pill = '<span class="pill none">Ingen tip</span>'; }
      return '<button class="person" type="button" data-slug="' + esc(inv.slug) + '">' +
        '<span class="nm">' + esc(inv.name) + '</span>' +
        '<span class="sub">Faktura #' + hashNo(inv.slug, 9000, 1000) + ' · ' + (inv.items || []).length + ' linjeposter</span>' +
        '<span class="right"><span class="amt">' + amt + '</span>' + pill + '</span>' +
      '</button>';
    }).join("");

    var body = invoices.length
      ? '<div class="people">' + rows + '</div>'
      : '<div class="empty"><p><strong>Ingen åbne regninger.</strong></p>' +
        '<p>Der er ikke gjort noget op endnu. Nyd det, mens det varer.</p></div>';

    main.innerHTML =
      '<section class="hero">' +
        '<p class="eyebrow">Reception · Åbne opgørelser</p>' +
        '<h1>Find dit navn. Du skylder sikkert noget.</h1>' +
        '<p class="lede">Løste sager bliver gjort op her. Vælg dig selv for at se din specifikation.</p>' +
        '<div class="hero-cta"><button class="btn-secondary" type="button" id="to-queue">Opret en ny sag</button></div>' +
      '</section>' +
      dbWarning() + statsBlock() +
      '<h2>Åbne regninger</h2>' + body;

    document.getElementById("to-queue").addEventListener("click", function () { go("queue"); });
    main.querySelectorAll(".person").forEach(function (b) {
      b.addEventListener("click", function () { go("invoice", b.dataset.slug); });
    });
  }

  /* ---- Faktura ---- */

  function findInvoice(slug) {
    for (var i = 0; i < invoices.length; i++) if (invoices[i].slug === slug) return invoices[i];
    return null;
  }

  function renderInvoice() {
    var inv = findInvoice(currentSlug);
    if (!inv) { go("reception"); return; }

    var base = grandTotal(inv), sub = subtotal(inv), t = tips[inv.slug];

    var lines = (inv.items || []).map(function (it) {
      return '<div class="line">' +
        '<span class="desc">' + esc(it.desc) + '</span>' +
        (it.note ? '<span class="note">' + esc(it.note) + '</span>' : "") +
        '<span class="qty">' + it.qty + ' × ' + kr(it.unit).replace(" kr", "") + '</span>' +
        '<span class="amt">' + kr(it.qty * it.unit).replace(" kr", "") + '</span>' +
      '</div>';
    }).join("");

    if (inv.discount) {
      lines += '<div class="line credit">' +
        '<span class="desc">Kollegarabat</span>' +
        '<span class="note">Fordi jeg faktisk godt kan lide dig</span>' +
        '<span class="qty">Anvendt automatisk</span>' +
        '<span class="amt">−' + kr(inv.discount).replace(" kr", "") + '</span>' +
      '</div>';
    }

    main.innerHTML =
      '<button class="backlink" id="back" type="button">← Tilbage til receptionen</button>' +
      '<section class="hero" style="padding-top:18px">' +
        '<p class="eyebrow">Serviceopgørelse · Faktura #' + hashNo(inv.slug, 9000, 1000) + '</p>' +
        '<h1>Tak fordi du brugte ZachGPT, ' + esc(inv.name.split(" ")[0]) + '.</h1>' +
        '<p class="lede">Dine sager er løst. Regningen er gjort op. Der er kun ét skridt tilbage, og det er frivilligt. Meget frivilligt.</p>' +
      '</section>' +
      (inv.greeting ? '<p class="greeting">' + esc(inv.greeting) + '</p>' : '<div style="height:24px"></div>') +
      '<div class="invoice">' +
        '<div class="invoice-head"><span class="who">Leveret af Zacharias</span>' +
        '<span class="ref">' + new Date().getFullYear() + '-' + hashNo(inv.slug, 9000, 1000) + '</span></div>' +
        '<div class="lines">' + lines + '</div>' +
        '<div class="totals">' +
          '<div class="trow"><span>Subtotal</span><span>' + kr(sub) + '</span></div>' +
          (inv.discount ? '<div class="trow"><span>Rabat</span><span>−' + kr(inv.discount) + '</span></div>' : "") +
          '<div class="trow grand"><span>At betale</span><span>' + kr(base) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div id="slot"></div>';

    document.getElementById("back").addEventListener("click", function () { go("reception"); });
    if (t) renderReceipt(inv, t, false); else renderTerminal(inv);
  }

  function tipBtn(pct, base, label) {
    return '<button class="tip-btn" data-pct="' + pct + '" type="button">' +
      '<span class="pct">' + pct + ' %</span>' +
      '<span class="kr">' + kr(base * pct / 100) + '</span>' +
      '<span class="label">' + label + '</span>' +
    '</button>';
  }

  function renderTerminal(inv) {
    var base = grandTotal(inv);
    var slot = document.getElementById("slot");
    slot.innerHTML =
      '<section class="terminal">' +
        '<p class="prompt">Vil du tilføje et drikkepenge?</p>' +
        '<p class="sub">100 % går til den medarbejder, der løste dine sager. Det er mig.</p>' +
        '<div class="tip-grid">' + tipBtn(15, base, "Høflig") + tipBtn(20, base, "Anbefalet") + tipBtn(25, base, "God kollega") + '</div>' +
        '<div class="custom-row">' +
          '<input id="custom" type="text" inputmode="numeric" placeholder="Andet beløb (min. 15 %)" aria-label="Andet beløb i kroner">' +
          '<button class="btn-secondary" id="custom-go" type="button">Tilføj</button>' +
        '</div>' +
        '<div class="notip-zone"><button class="notip" id="notip" type="button">Ingen tip</button></div>' +
        '<p class="sla-note">Tip påvirker ikke din placering i supportkøen.</p>' +
      '</section>';

    slot.querySelectorAll(".tip-btn").forEach(function (b) {
      b.addEventListener("click", function () { pay(inv, base * Number(b.dataset.pct) / 100, false); });
    });

    var input = document.getElementById("custom");
    function submitCustom() {
      var amount = Number(input.value.replace(/[^0-9]/g, ""));
      if (!amount) { input.focus(); return; }
      var min = base * 0.15;
      pay(inv, Math.max(amount, min), amount < min);
    }
    document.getElementById("custom-go").addEventListener("click", submitCustom);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submitCustom(); });

    var notip = document.getElementById("notip"), dodged = false;
    if (window.matchMedia("(pointer: fine)").matches) {
      notip.addEventListener("mouseenter", function () {
        if (dodged) return;
        dodged = true;
        notip.style.transform = "translateX(96px)";
        setTimeout(function () { notip.style.transform = "translateX(0)"; }, 900);
      });
    }
    notip.addEventListener("click", function () { openGuilt(inv, 0); });
  }

  function pay(inv, tip, wasBumped) {
    var base = grandTotal(inv);
    var pct = base ? Math.round(tip / base * 100) : 0;
    var rec = { name: inv.name, pct: pct, tip: tip, base: base, total: base + tip,
                bumped: !!wasBumped, at: new Date().toISOString() };
    saveTip(inv.slug, rec); tips[inv.slug] = rec;
    renderReceipt(inv, rec, true);
    confetti();
  }

  function payNothing(inv) {
    var base = grandTotal(inv);
    var rec = { name: inv.name, pct: 0, tip: 0, base: base, total: base, at: new Date().toISOString() };
    saveTip(inv.slug, rec); tips[inv.slug] = rec;
    renderReceipt(inv, rec, true);
  }

  function renderReceipt(inv, r, fresh) {
    var tier = tierFor(r.pct || 0);
    var happy = (r.pct || 0) > 0;
    var fine = happy
      ? (r.bumped
          ? "Beløbet er rundet op til minimumssatsen på 15 %. Systemet tillader ikke mindre. Det gør jeg heller ikke.\n"
          : "Beløbet er trukket fra din sociale kapital.\n") +
        "Status: " + tier.name + " · " + tier.perk + "\n" +
        "Kvittering sendt til dig selv, i tankerne."
      : "Din placering i supportkøen er blevet genberegnet.\n" +
        "Estimeret svartid ved næste henvendelse: 3–5 hverdage.\n" +
        "Denne beslutning kan omgøres med kage.";

    var slot = document.getElementById("slot");
    slot.innerHTML =
      '<section class="receipt" data-mood="' + (happy ? "happy" : "sad") + '" tabindex="-1">' +
        '<div class="receipt-head">' +
          '<span class="badge">' + (happy ? "Betalt" : "Ingen tip registreret") + '</span>' +
          '<p class="msg">' + (happy ? "Tak. Det betyder faktisk noget." : "Registreret. Det er helt i orden.") + '</p>' +
          '<p class="msg-sub">' + (happy ? esc(tier.perk) : "Vi er ikke vrede. Bare lidt skuffede.") + '</p>' +
        '</div>' +
        '<div class="receipt-body">' +
          '<div class="trow"><span>Serviceydelser</span><span>' + kr(r.base) + '</span></div>' +
          '<div class="trow"><span>Tip' + (happy ? " (" + r.pct + " %)" : "") + '</span><span>' + kr(r.tip) + '</span></div>' +
          '<div class="trow grand"><span>Total</span><span>' + kr(r.total) + '</span></div>' +
          '<p class="receipt-fine">' + esc(fine).replace(/\n/g, "<br>") + '</p>' +
          '<div class="receipt-actions">' +
            '<button class="btn-secondary" type="button" id="to-board">Se Ærestavlen</button>' +
            '<button class="btn-weak" type="button" id="redo">Fortryd og vælg igen</button>' +
          '</div>' +
        '</div>' +
      '</section>';

    if (fresh) slot.querySelector(".receipt").focus();
    document.getElementById("to-board").addEventListener("click", function () { go("board"); });
    document.getElementById("redo").addEventListener("click", function () {
      delete tips[inv.slug];
      store.remove("tips", inv.slug).catch(function () {});
      renderTerminal(inv);
    });
  }

  /* ---- Skyldsmodal ---- */

  var dlg = document.getElementById("guilt");
  var gFace = document.getElementById("g-face"), gTitle = document.getElementById("g-title");
  var gBody = document.getElementById("g-body"), gYes = document.getElementById("g-yes"), gNo = document.getElementById("g-no");
  var guiltStage = 0, guiltInv = null;

  function openGuilt(inv, i) {
    guiltInv = inv; guiltStage = i;
    var s = STAGES[i];
    gFace.textContent = s.face; gTitle.textContent = s.title; gBody.textContent = s.body;
    gYes.textContent = s.yes; gNo.textContent = s.no;
    if (!dlg.open) dlg.showModal();
    gYes.focus();
  }
  gYes.addEventListener("click", function () {
    dlg.close();
    if (guiltInv) pay(guiltInv, grandTotal(guiltInv) * 0.2, false);
  });
  gNo.addEventListener("click", function () {
    if (guiltStage < STAGES.length - 1) { openGuilt(guiltInv, guiltStage + 1); return; }
    dlg.close();
    if (guiltInv) payNothing(guiltInv);
  });

  /* ---- Ærestavlen ---- */

  function renderBoard() {
    var rows = Object.keys(tips).map(function (slug) {
      var t = tips[slug];
      return { slug: slug, name: t.name || slug, pct: Number(t.pct) || 0, tip: Number(t.tip) || 0 };
    }).sort(function (a, b) { return b.tip - a.tip || a.name.localeCompare(b.name, "da"); });

    var body = rows.length
      ? '<div class="board">' + rows.map(function (r, i) {
          var tier = tierFor(r.pct);
          var cls = r.tip === 0 ? "rank shame" : (i === 0 ? "rank top" : "rank");
          return '<div class="' + cls + '">' +
            '<span class="pos">' + (r.tip === 0 ? "—" : (i + 1)) + '</span>' +
            '<span class="nm">' + esc(r.name) + '</span>' +
            '<span class="tier">' + esc(tier.name) + ' · ' + esc(tier.perk) + '</span>' +
            '<span class="val">' + kr(r.tip) + '</span>' +
          '</div>';
        }).join("") + '</div>'
      : '<div class="empty"><p><strong>Tavlen er tom.</strong></p>' +
        '<p>Ingen har taget stilling endnu. Det er også en slags stillingtagen.</p></div>';

    main.innerHTML =
      '<section class="hero">' +
        '<p class="eyebrow">Ærestavlen · Opdateres live</p>' +
        '<h1>Hvem har gjort det godt.</h1>' +
        '<p class="lede">Rangeret efter tip. Tavlen opdaterer sig selv, så du kan følge med i realtid, hvis du er den type.</p>' +
      '</section>' + statsBlock() + '<h2>Stilling</h2>' + body;
  }

  /* ---- Admin ---- */

  function blankDraft() {
    return { slug: "", name: "", greeting: "", picked: {}, notes: {}, custom: [], discount: 0, fromTickets: [] };
  }
  function draftItems() {
    var items = [];
    PRESETS.forEach(function (p) {
      var qty = draft.picked[p.id];
      if (qty > 0) {
        var note = draft.notes[p.id];
        items.push({ desc: p.desc, note: (note === undefined ? p.note : note), qty: qty, unit: p.unit });
      }
    });
    draft.custom.forEach(function (c) {
      if (c.desc) items.push({ desc: c.desc, note: c.note || "", qty: Number(c.qty) || 1, unit: Number(c.unit) || 0 });
    });
    return items;
  }
  function draftTotal() {
    var s = draftItems().reduce(function (a, it) { return a + it.qty * it.unit; }, 0);
    return Math.max(0, s - (Number(draft.discount) || 0));
  }

  function unbilledByPerson() {
    var map = {};
    doneTickets().forEach(function (t) {
      var key = t.slug || slugify(t.name);
      if (!key) return;
      if (!map[key]) map[key] = { slug: key, name: t.name, tickets: [] };
      map[key].tickets.push(t);
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.tickets.length - a.tickets.length; });
  }

  function draftFromTickets(group) {
    draft = blankDraft();
    draft.name = group.name;
    draft.slug = group.slug;
    draft.fromTickets = group.tickets.map(function (t) { return t.id; });
    group.tickets.forEach(function (t) {
      var p = presetById(t.cat);
      if (!p) { draft.custom.push({ desc: t.cat, note: t.desc, qty: 1, unit: 250 }); return; }
      draft.picked[p.id] = (draft.picked[p.id] || 0) + 1;
      // Kollegaens egen beskrivelse foreslås som note — deres ord, din regning.
      if (t.desc && draft.notes[p.id] === undefined) {
        var own = t.desc.length > 90 ? t.desc.slice(0, 88).trim() + "…" : t.desc;
        draft.notes[p.id] = "Dine ord: “" + own + "”";
      }
    });
    var existing = findInvoice(group.slug);
    editing = existing ? group.slug : null;
    if (existing) draft.discount = existing.discount || 0;
    renderAdmin();
    window.scrollTo({ top: 0 });
  }

  function renderAdmin() {
    if (!draft) draft = blankDraft();

    var unbilled = unbilledByPerson();
    var unbilledHtml = unbilled.length ? unbilled.map(function (g) {
      return '<div class="unbilled">' +
        '<span><span class="u-name">' + esc(g.name) + '</span><br>' +
        '<span class="u-sub">' + g.tickets.length + ' løste sager afventer opgørelse</span></span>' +
        '<button class="btn-secondary" type="button" data-bill="' + esc(g.slug) + '">Lav regning af ' + g.tickets.length + ' sager</button>' +
      '</div>';
    }).join("") : '<div class="empty"><p>Ingen løste sager afventer opgørelse.</p>' +
      '<p>Marker sager som løst i Køen, så dukker de op her.</p></div>';

    var presetHtml = PRESETS.map(function (p) {
      var qty = draft.picked[p.id] || 0;
      return '<div class="preset" data-on="' + (qty > 0 ? 1 : 0) + '">' +
        '<input type="checkbox" id="p-' + p.id + '" data-pid="' + p.id + '"' + (qty > 0 ? " checked" : "") + '>' +
        '<label class="p-desc" for="p-' + p.id + '">' + esc(p.desc) + '</label>' +
        '<span class="p-note">' + esc(p.note) + ' · ' + kr(p.unit) + '</span>' +
        '<span class="p-qty">antal <input type="text" inputmode="numeric" data-qty="' + p.id + '" value="' + (qty || 1) + '" aria-label="Antal"></span>' +
        (qty > 0
          ? '<span class="p-noteedit"><input type="text" data-note="' + p.id + '" value="' +
            esc(draft.notes[p.id] === undefined ? p.note : draft.notes[p.id]) +
            '" placeholder="Note under linjen" aria-label="Note til ' + esc(p.desc) + '"></span>'
          : "") +
      '</div>';
    }).join("");

    var customHtml = draft.custom.map(function (c, i) {
      return '<div class="cline">' +
        '<input type="text" data-c="desc" data-i="' + i + '" placeholder="Beskrivelse" value="' + esc(c.desc) + '" aria-label="Beskrivelse">' +
        '<input class="num" type="text" inputmode="numeric" data-c="qty" data-i="' + i + '" value="' + esc(c.qty) + '" aria-label="Antal">' +
        '<input class="num" type="text" inputmode="numeric" data-c="unit" data-i="' + i + '" value="' + esc(c.unit) + '" aria-label="Pris">' +
        '<button type="button" data-rm="' + i + '" aria-label="Fjern linje">×</button>' +
        '<input class="c-note" type="text" data-c="note" data-i="' + i + '" value="' + esc(c.note) + '" placeholder="Note under linjen (valgfri)" aria-label="Note">' +
      '</div>';
    }).join("");

    var savedHtml = invoices.length ? invoices.map(function (inv) {
      return '<div class="saved"><span>' + esc(inv.name) + ' · ' + kr(grandTotal(inv)) + '</span>' +
        '<span class="acts">' +
          '<button type="button" data-edit="' + esc(inv.slug) + '">Rediger</button>' +
          '<button type="button" class="del" data-del="' + esc(inv.slug) + '">Slet</button>' +
        '</span></div>';
    }).join("") : '<p style="color:var(--muted);font-size:13px">Ingen gemte regninger endnu.</p>';

    main.innerHTML =
      '<section class="hero">' +
        '<p class="eyebrow">Admin · Kun for Zacharias</p>' +
        '<h1>' + (editing ? "Rediger regning" : "Gør arbejdet op") + '</h1>' +
        '<p class="lede">Løste sager samles per person. Ét klik, så er linjeposterne udfyldt — derefter kan du finpudse dem.</p>' +
      '</section>' +
      dbWarning() +
      '<div class="notice">Del ét link til alle. De opretter selv sager, og finder deres egen regning i receptionen. Kun du kan oprette og redigere regninger.</div>' +

      '<h2>Ufaktureret arbejde</h2>' + unbilledHtml +

      '<h2>Modtager</h2>' +
      '<div class="field"><label for="f-name">Navn</label>' +
        '<input type="text" id="f-name" value="' + esc(draft.name) + '" placeholder="Fx Mette fra Kundeservice"></div>' +
      '<div class="field"><label for="f-greet">Personlig hilsen (valgfri)</label>' +
        '<textarea id="f-greet" placeholder="Fx: Særligt tak for tirsdag. Vi taler ikke mere om tirsdag.">' + esc(draft.greeting) + '</textarea>' +
        '<span class="hint">Vises øverst på deres regning.</span></div>' +

      '<h2>Linjeposter</h2>' +
      '<p style="margin:-6px 0 14px;font-size:13.5px;color:var(--muted)">Sæt flueben for at tage en post med — så kan du redigere noten, der står under linjen på regningen.</p>' +
      presetHtml +

      '<h2>Egne linjer</h2>' +
      '<div class="custom-lines">' + customHtml + '</div>' +
      '<button class="btn-secondary" type="button" id="add-line">+ Tilføj egen linje</button>' +

      '<h2>Rabat</h2>' +
      '<div class="field"><label for="f-disc">Kollegarabat i kroner</label>' +
        '<input type="text" inputmode="numeric" id="f-disc" value="' + esc(draft.discount) + '">' +
        '<span class="hint">Trækkes fra subtotalen. Sæt 0 hvis du er i det humør.</span></div>' +

      '<div class="admin-total"><span>At betale</span><span>' + kr(draftTotal()) + '</span></div>' +
      '<div class="admin-actions">' +
        '<button class="btn-primary" type="button" id="save">' + (editing ? "Gem ændringer" : "Opret regning") + '</button>' +
        '<button class="btn-weak" type="button" id="cancel">Ryd formularen</button>' +
        '<span id="save-msg" aria-live="polite" style="font-size:14px;color:var(--muted)"></span>' +
      '</div>' +

      '<h2>Gemte regninger</h2>' +
      '<div class="saved-list">' + savedHtml + '</div>';

    wireAdmin();
  }

  function wireAdmin() {
    var nameEl = document.getElementById("f-name");
    var greetEl = document.getElementById("f-greet");
    var discEl = document.getElementById("f-disc");

    nameEl.addEventListener("input", function () { draft.name = nameEl.value; });
    greetEl.addEventListener("input", function () { draft.greeting = greetEl.value; });
    discEl.addEventListener("input", function () {
      draft.discount = Number(discEl.value.replace(/[^0-9]/g, "")) || 0;
      updateTotal();
    });

    main.querySelectorAll("[data-bill]").forEach(function (b) {
      b.addEventListener("click", function () {
        var groups = unbilledByPerson();
        for (var i = 0; i < groups.length; i++) {
          if (groups[i].slug === b.dataset.bill) { draftFromTickets(groups[i]); return; }
        }
      });
    });

    main.querySelectorAll("[data-pid]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var row = cb.closest(".preset");
        var qtyEl = row.querySelector("[data-qty]");
        if (cb.checked) { draft.picked[cb.dataset.pid] = Math.max(1, Number(qtyEl.value) || 1); }
        else { delete draft.picked[cb.dataset.pid]; }
        row.dataset.on = cb.checked ? "1" : "0";
        renderAdmin();
      });
    });

    main.querySelectorAll("[data-note]").forEach(function (n) {
      n.addEventListener("input", function () { draft.notes[n.dataset.note] = n.value; });
    });

    main.querySelectorAll("[data-qty]").forEach(function (q) {
      q.addEventListener("input", function () {
        var n = Number(q.value.replace(/[^0-9]/g, "")) || 0;
        var cb = q.closest(".preset").querySelector("[data-pid]");
        if (cb.checked) draft.picked[q.dataset.qty] = Math.max(1, n);
        updateTotal();
      });
    });

    main.querySelectorAll("[data-c]").forEach(function (el) {
      el.addEventListener("input", function () {
        var i = Number(el.dataset.i), f = el.dataset.c;
        draft.custom[i][f] = (f === "desc" || f === "note") ? el.value : (Number(el.value.replace(/[^0-9]/g, "")) || 0);
        updateTotal();
      });
    });

    main.querySelectorAll("[data-rm]").forEach(function (b) {
      b.addEventListener("click", function () { draft.custom.splice(Number(b.dataset.rm), 1); renderAdmin(); });
    });

    document.getElementById("add-line").addEventListener("click", function () {
      draft.custom.push({ desc: "", note: "", qty: 1, unit: 100 });
      renderAdmin();
      var inputs = main.querySelectorAll('[data-c="desc"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    document.getElementById("save").addEventListener("click", onSave);
    document.getElementById("cancel").addEventListener("click", function () {
      editing = null; draft = blankDraft(); renderAdmin();
    });

    main.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { loadForEdit(b.dataset.edit); });
    });
    main.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var inv = findInvoice(b.dataset.del);
        if (!inv || !window.confirm("Slet regningen til " + inv.name + "?")) return;
        store.remove("invoices", inv.slug).catch(function () {});
      });
    });
  }

  function updateTotal() {
    var el = main.querySelector(".admin-total span:last-child");
    if (el) el.textContent = kr(draftTotal());
  }

  function loadForEdit(slug) {
    var inv = findInvoice(slug);
    if (!inv) return;
    editing = slug;
    draft = blankDraft();
    draft.slug = slug; draft.name = inv.name; draft.greeting = inv.greeting;
    draft.discount = inv.discount || 0;
    (inv.items || []).forEach(function (it) {
      var p = PRESETS.filter(function (x) { return x.desc === it.desc; })[0];
      if (p) { draft.picked[p.id] = it.qty; draft.notes[p.id] = it.note || ""; }
      else draft.custom.push({ desc: it.desc, note: it.note || "", qty: it.qty, unit: it.unit });
    });
    renderAdmin();
    window.scrollTo({ top: 0 });
  }

  function onSave() {
    var msg = document.getElementById("save-msg");
    var name = (draft.name || "").trim();
    if (!name) { msg.textContent = "Skriv et navn først."; document.getElementById("f-name").focus(); return; }
    var items = draftItems();
    if (!items.length) { msg.textContent = "Vælg mindst én linjepost."; return; }

    var slug = editing || draft.slug || slugify(name);
    if (!slug) { msg.textContent = "Navnet kan ikke bruges som id. Prøv et andet."; return; }

    var billed = draft.fromTickets.slice();
    msg.textContent = "Gemmer…";
    saveInvoice({
      slug: slug, name: name, greeting: (draft.greeting || "").trim(),
      items: items, discount: Number(draft.discount) || 0,
      order: (findInvoice(slug) || {}).order || Date.now()
    }).then(function () {
      return Promise.all(billed.map(function (id) {
        return setTicketStatus(id, "billed").catch(function () {});
      }));
    }).then(function () {
      editing = null; draft = blankDraft(); renderAdmin();
      var m = document.getElementById("save-msg");
      if (m) m.textContent = "Gemt. " + name + " ligger nu i receptionen" +
        (billed.length ? " — " + billed.length + " sager er markeret som fakturerede." : ".");
    }).catch(function () {
      var m = document.getElementById("save-msg");
      if (m) m.textContent = "Kunne ikke gemme. Kun ejeren af siden kan oprette regninger.";
    });
  }

  /* ---- Genstart-knap ---- */

  var rebootN = 0;
  document.getElementById("reboot").addEventListener("click", function () {
    document.getElementById("reboot-out").textContent = REBOOTS[rebootN % REBOOTS.length];
    rebootN++;
  });

  /* ---- Konfetti ---- */

  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cv = document.getElementById("confetti");
    var ctx = cv.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    var W = cv.clientWidth, H = cv.clientHeight;
    var colors = ["#6EC943", "#56B529", "#00643A", "#DDF1D0", "#B5E099"];
    var bits = [];
    for (var i = 0; i < 110; i++) {
      bits.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.5,
        y: H * 0.45 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 3,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        c: colors[(Math.random() * colors.length) | 0]
      });
    }
    var start = performance.now();
    function frame(now) {
      var t = now - start;
      ctx.clearRect(0, 0, W, H);
      bits.forEach(function (b) {
        b.vy += 0.28; b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.globalAlpha = Math.max(0, 1 - t / 2600);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      });
      if (t < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(frame);
  }

  /* ---- Start ---- */
  render();
  connect();
})(window.ZG);
