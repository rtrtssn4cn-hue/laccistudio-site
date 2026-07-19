/* =========================================================================
   Lacci Studio — Shop + Cart engine
   Compact grid + category filters + personalization & design upload (in cart)
   Reads products & checkout settings from assets/js/shop-config.js
   ========================================================================= */
(function () {
  function run() {
  var SHOP = window.LACCI_SHOP;
  if (!SHOP) return;
  var CO = SHOP.checkout || {};
  var MODE = CO.mode || "inquiry";
  var SYM = SHOP.currencySymbol || "$";
  var CUR = SHOP.currency || "USD";
  var KEY = "lacci_cart_v2";
  var SNIPCART = (MODE === "snipcart" && CO.snipcartApiKey);

  var FILES = {}; // in-memory design files this session, keyed by line key
  var money = function (n) { return SYM + Number(n).toFixed(2); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  /* ------------------------------ storage ------------------------------ */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  var cart = load();
  function lineKey(id, opt) { return id + "::" + (opt || ""); }
  function count() { return cart.reduce(function (s, i) { return s + i.qty; }, 0); }
  function subtotal() { return cart.reduce(function (s, i) { return s + i.qty * i.price; }, 0); }
  function findProduct(id) { return (SHOP.products || []).find(function (p) { return p.id === id; }); }
  // Options may be plain strings OR { name, price } objects for per-size pricing
  function choicesOf(p) { return (p && p.options && p.options.choices) ? p.options.choices : []; }
  function choiceName(c) { return (c && typeof c === "object") ? c.name : c; }
  function firstChoiceName(p) { var cs = choicesOf(p); return cs.length ? choiceName(cs[0]) : ""; }
  function priceFor(p, opt) {
    var cs = choicesOf(p);
    for (var i = 0; i < cs.length; i++) { var c = cs[i]; if (typeof c === "object" && c.name === opt && c.price != null) return c.price; }
    return p.price;
  }
  function priceLabelFor(p) {
    var priced = choicesOf(p).filter(function (c) { return typeof c === "object" && c.price != null; });
    if (priced.length) { var m = Math.min.apply(null, priced.map(function (c) { return c.price; })); return "from " + money(m); }
    return money(p.price);
  }

  function addItem(id, opt) {
    var p = findProduct(id); if (!p) return;
    var k = lineKey(id, opt);
    var line = cart.find(function (i) { return lineKey(i.id, i.option) === k; });
    if (line) line.qty += 1;
    else cart.push({ id: id, name: p.name, price: priceFor(p, opt), image: p.image, option: opt || "", note: "", design: "", qty: 1 });
    save(cart); render(); openDrawer();
  }
  function setQty(k, q) {
    var line = cart.find(function (i) { return lineKey(i.id, i.option) === k; });
    if (!line) return;
    line.qty = q;
    if (line.qty <= 0) { cart = cart.filter(function (i) { return lineKey(i.id, i.option) !== k; }); delete FILES[k]; }
    save(cart); render();
  }

  /* ------------------------------ filters ------------------------------ */
  function renderFilters() {
    var bar = document.querySelector("#shop-filters");
    if (!bar) return;
    var cats = [];
    (SHOP.products || []).forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    var btns = ['<button class="filter-btn active" data-filter="all">All</button>']
      .concat(cats.map(function (c) { return '<button class="filter-btn" data-filter="' + esc(c) + '">' + esc(c) + "</button>"; }));
    bar.innerHTML = btns.join("");
    bar.querySelectorAll(".filter-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        bar.querySelectorAll(".filter-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        var f = b.getAttribute("data-filter");
        document.querySelectorAll(".prod-card").forEach(function (card) {
          var show = (f === "all") || (card.getAttribute("data-category") === f);
          card.classList.toggle("hide", !show);
        });
      });
    });
  }

  /* --------------------------- product media carousel --------------------------- */
  function mediaHTML(p) {
    var imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
    var slides = imgs.map(function (src, i) {
      return '<div class="pslide' + (i === 0 ? " active" : "") + '"><img src="' + esc(src) + '" alt="' + esc(p.name) + '" loading="lazy"></div>';
    });
    if (p.video) {
      slides.push('<div class="pslide"><video src="' + esc(p.video) + '" muted loop playsinline preload="metadata"></video><span class="pvid-badge">▶ Video</span></div>');
    }
    var n = slides.length;
    var controls = "";
    if (n > 1) {
      var dots = "";
      for (var i = 0; i < n; i++) dots += '<span class="pdot' + (i === 0 ? " on" : "") + '" data-d="' + i + '"></span>';
      controls = '<button class="pnav prev" aria-label="Previous photo">‹</button>' +
        '<button class="pnav next" aria-label="Next photo">›</button>' +
        '<div class="pdots">' + dots + "</div>";
    }
    return '<div class="prod-media" data-idx="0">' + slides.join("") +
      (p.category ? '<span class="prod-tag">' + esc(p.category) + "</span>" : "") +
      controls + "</div>";
  }
  function setupCarousels(grid) {
    grid.querySelectorAll(".prod-media").forEach(function (media) {
      var slides = media.querySelectorAll(".pslide");
      if (slides.length < 2) return;
      var dots = media.querySelectorAll(".pdot");
      function show(n) {
        var cur = parseInt(media.getAttribute("data-idx") || "0", 10);
        var prevVid = slides[cur].querySelector("video"); if (prevVid) prevVid.pause();
        n = (n + slides.length) % slides.length;
        slides.forEach(function (s, i) { s.classList.toggle("active", i === n); });
        dots.forEach(function (d, i) { d.classList.toggle("on", i === n); });
        media.setAttribute("data-idx", n);
        var vid = slides[n].querySelector("video"); if (vid) { vid.play().catch(function () {}); }
      }
      var prev = media.querySelector(".pnav.prev");
      var next = media.querySelector(".pnav.next");
      if (prev) prev.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); show(parseInt(media.getAttribute("data-idx") || "0", 10) - 1); });
      if (next) next.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); show(parseInt(media.getAttribute("data-idx") || "0", 10) + 1); });
      dots.forEach(function (d) { d.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); show(parseInt(d.getAttribute("data-d"), 10)); }); });
      // swipe on touch
      var x0 = null;
      media.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      media.addEventListener("touchend", function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) show(parseInt(media.getAttribute("data-idx") || "0", 10) + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    });
  }

  /* --------------------------- shop grid page --------------------------- */
  function renderGrid() {
    var grid = document.querySelector("#shop-grid");
    if (!grid) return;
    grid.innerHTML = (SHOP.products || []).map(function (p) {
      var btn;
      if (SNIPCART) {
        btn = '<button class="btn btn-gold snipcart-add-item"' +
          ' data-item-id="' + esc(p.id) + '" data-item-name="' + esc(p.name) + '"' +
          ' data-item-price="' + Number(p.price).toFixed(2) + '" data-item-url="shop.html"' +
          ' data-item-image="' + esc(p.image) + '" data-item-description="' + esc(p.description || "") + '"' +
          ' data-item-custom1-name="Personalization" data-item-custom1-type="textarea"' +
          (p.options ? ' data-item-custom2-name="' + esc(p.options.label) + '" data-item-custom2-options="' + esc(p.options.choices.join("|")) + '"' : "") +
          ">Add to Cart</button>";
      } else {
        btn = '<button class="btn btn-gold js-add" data-add="' + esc(p.id) + '">Add to Cart</button>';
      }
      return '<article class="prod-card reveal in" data-category="' + esc(p.category || "") + '" title="' + esc(p.description || "") + '">' +
        mediaHTML(p) +
        '<div class="prod-body">' +
        '<h3>' + esc(p.name) + "</h3>" +
        '<div class="prod-foot"><span class="prod-price">' + priceLabelFor(p) + "</span></div>" +
        btn + "</div></article>";
    }).join("");

    if (!SNIPCART) {
      grid.querySelectorAll(".js-add").forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-add");
          addItem(id, firstChoiceName(findProduct(id)));
        });
      });
    }
    setupCarousels(grid);
  }

  /* ------------------------- cart button + drawer ------------------------ */
  function injectChrome() {
    var navUL = document.querySelector(".nav-links");
    if (navUL && !document.querySelector(".cart-btn")) {
      var li = document.createElement("li");
      li.className = "cart-li";
      if (SNIPCART) li.innerHTML = '<a href="#" class="cart-btn snipcart-checkout" aria-label="Cart">' + cartIcon() + '<span class="cart-count snipcart-items-count">0</span></a>';
      else li.innerHTML = '<a href="#" class="cart-btn" aria-label="Cart">' + cartIcon() + '<span class="cart-count">0</span></a>';
      navUL.appendChild(li);
      if (!SNIPCART) li.querySelector(".cart-btn").addEventListener("click", function (e) { e.preventDefault(); openDrawer(); });
    }
    if (SNIPCART) return;
    if (document.querySelector("#cart-drawer")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="cart-overlay" id="cart-overlay"></div>' +
      '<aside class="cart-drawer" id="cart-drawer" aria-label="Shopping cart">' +
        '<div class="cart-head"><h3>Your Cart</h3><button class="cart-close" aria-label="Close">&times;</button></div>' +
        '<div class="cart-items" id="cart-items"></div>' +
        '<div class="cart-foot" id="cart-foot"></div>' +
      "</aside>";
    document.body.appendChild(wrap);
    document.querySelector("#cart-overlay").addEventListener("click", closeDrawer);
    document.querySelector(".cart-close").addEventListener("click", closeDrawer);
  }
  function cartIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="22" height="22">' +
      '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/></svg>';
  }
  function openDrawer() { if (SNIPCART) return; document.querySelector("#cart-drawer").classList.add("open"); document.querySelector("#cart-overlay").classList.add("show"); }
  function closeDrawer() { document.querySelector("#cart-drawer").classList.remove("open"); document.querySelector("#cart-overlay").classList.remove("show"); }

  /* ------------------------------ render ------------------------------ */
  function render() {
    document.querySelectorAll(".cart-count").forEach(function (el) { el.textContent = count(); el.style.display = count() ? "" : "none"; });
    if (SNIPCART) return;
    var box = document.querySelector("#cart-items");
    var foot = document.querySelector("#cart-foot");
    if (!box || !foot) return;
    if (!cart.length) {
      box.innerHTML = '<p class="cart-empty">Your cart is empty.<br><a href="shop.html">Browse the shop &rarr;</a></p>';
      foot.innerHTML = ""; return;
    }
    box.innerHTML = cart.map(function (i) {
      var k = lineKey(i.id, i.option);
      var prod = findProduct(i.id);
      var hasFile = !!FILES[k];
      var optCtrl = "";
      if (prod && choicesOf(prod).length) {
        optCtrl = '<select class="ci-optsel" data-optsel="' + k + '">' +
          choicesOf(prod).map(function (c) {
            var nm = choiceName(c);
            var pr = (typeof c === "object" && c.price != null) ? " — " + money(c.price) : "";
            return '<option value="' + esc(nm) + '"' + (nm === i.option ? " selected" : "") + ">" + esc(nm) + pr + "</option>";
          }).join("") +
          "</select>";
      } else if (i.option) {
        optCtrl = '<span class="ci-opt">' + esc(i.option) + "</span>";
      }
      var design = i.design
        ? '<span class="ci-design' + (hasFile ? " ok" : "") + '">' + (hasFile ? "✓ Design: " : "Design: ") + esc(i.design) + (hasFile ? "" : " (re-attach at checkout)") + "</span>"
        : '<button class="ci-adddesign" data-adddesign="' + k + '">+ Add your design / photo</button>';
      return '<div class="cart-item">' +
        '<img src="' + esc(i.image) + '" alt="' + esc(i.name) + '">' +
        '<div class="ci-info"><strong>' + esc(i.name) + "</strong>" + optCtrl +
        '<span class="ci-price">' + money(i.price) + "</span>" + design +
        '<input type="text" class="ci-note-input" data-note="' + k + '" value="' + esc(i.note) + '" placeholder="Personalization (name, initials, text)">' +
        '<input type="file" accept="image/*,.pdf" class="ci-file" data-cfile="' + k + '" hidden>' +
        "</div>" +
        '<div class="ci-qty"><button data-dec="' + k + '" aria-label="Decrease">&minus;</button><span>' + i.qty + "</span>" +
        '<button data-inc="' + k + '" aria-label="Increase">+</button></div>' +
        '<button class="ci-remove" data-rem="' + k + '" aria-label="Remove">&times;</button>' +
        "</div>";
    }).join("");
    foot.innerHTML =
      '<div class="cart-subtotal"><span>Subtotal</span><strong>' + money(subtotal()) + "</strong></div>" +
      '<p class="cart-note">Add your photo/logo &amp; personalization to any item above. Shipping &amp; custom-work adjustments are confirmed after your order.</p>' +
      '<button class="btn btn-gold" id="cart-checkout" style="width:100%;justify-content:center">' + checkoutLabel() + "</button>" +
      '<div id="pay-area"></div>' +
      '<button class="cart-continue" id="cart-continue">Continue shopping</button>';

    box.querySelectorAll("[data-inc]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-inc"); var l = cart.find(function (i) { return lineKey(i.id, i.option) === k; }); setQty(k, l.qty + 1); }; });
    box.querySelectorAll("[data-dec]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-dec"); var l = cart.find(function (i) { return lineKey(i.id, i.option) === k; }); setQty(k, l.qty - 1); }; });
    box.querySelectorAll("[data-rem]").forEach(function (b) { b.onclick = function () { setQty(b.getAttribute("data-rem"), 0); }; });
    box.querySelectorAll(".ci-note-input").forEach(function (inp) {
      inp.onchange = function () { var k = inp.getAttribute("data-note"); var l = cart.find(function (i) { return lineKey(i.id, i.option) === k; }); if (l) { l.note = inp.value.trim(); save(cart); } };
    });
    box.querySelectorAll(".ci-optsel").forEach(function (sel) {
      sel.onchange = function () {
        var k = sel.getAttribute("data-optsel");
        var l = cart.find(function (i) { return lineKey(i.id, i.option) === k; });
        if (!l) return;
        var oldK = k, newOpt = sel.value;
        if (FILES[oldK]) { FILES[lineKey(l.id, newOpt)] = FILES[oldK]; delete FILES[oldK]; }
        l.option = newOpt;
        l.price = priceFor(findProduct(l.id), newOpt); // update price for the chosen size
        // merge if another identical line now exists
        var dupe = cart.find(function (i) { return i !== l && lineKey(i.id, i.option) === lineKey(l.id, l.option); });
        if (dupe) { dupe.qty += l.qty; cart = cart.filter(function (i) { return i !== l; }); }
        save(cart); render();
      };
    });
    box.querySelectorAll("[data-adddesign]").forEach(function (b) {
      b.onclick = function () { var k = b.getAttribute("data-adddesign"); var inp = box.querySelector('[data-cfile="' + CSS.escape(k) + '"]'); if (inp) inp.click(); };
    });
    box.querySelectorAll(".ci-file").forEach(function (inp) {
      inp.onchange = function () {
        var k = inp.getAttribute("data-cfile");
        var line = cart.find(function (i) { return lineKey(i.id, i.option) === k; });
        if (line && inp.files && inp.files[0]) { line.design = inp.files[0].name; FILES[k] = inp.files[0]; save(cart); render(); }
      };
    });
    document.querySelector("#cart-continue").onclick = closeDrawer;
    document.querySelector("#cart-checkout").onclick = checkout;
  }
  function checkoutLabel() { return MODE === "inquiry" ? "Place Order Request" : "Checkout"; }

  /* ----------------------------- checkout ----------------------------- */
  function checkout() { if (!cart.length) return; if (MODE === "paypal") return payPal(); return inquiry(); }
  function orderText() {
    var lines = cart.map(function (i) {
      var extra = [];
      if (i.note) extra.push('personalization: "' + i.note + '"');
      if (i.design) extra.push("design file: " + i.design);
      return "• " + i.qty + " × " + i.name + (i.option ? " (" + i.option + ")" : "") +
        (extra.length ? " [" + extra.join("; ") + "]" : "") + " — " + money(i.price * i.qty);
    });
    return lines.join("\n") + "\n\nSubtotal: " + money(subtotal());
  }
  function collectFiles() { var out = []; cart.forEach(function (i) { var k = lineKey(i.id, i.option); if (FILES[k]) out.push(FILES[k]); }); return out; }
  function inquiry() {
    var pay = document.querySelector("#pay-area");
    var files = collectFiles();
    if (CO.uploadEndpoint && files.length) {
      var fd = new FormData();
      fd.append("_subject", "New Order + Design — Lacci Studio");
      fd.append("order", orderText());
      files.forEach(function (f, n) { fd.append("design_" + (n + 1), f, f.name); });
      if (pay) pay.innerHTML = '<p class="pay-ok">Uploading your order &amp; design…</p>';
      fetch(CO.uploadEndpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } })
        .then(function (r) {
          if (r.ok) { cart = []; save(cart); FILES = {}; render();
            var items = document.querySelector("#cart-items");
            if (items) items.innerHTML = '<p class="pay-ok" style="text-align:center">Thank you! Your order and design were sent. We’ll confirm details &amp; payment shortly.</p>';
            var f2 = document.querySelector("#cart-foot"); if (f2) f2.innerHTML = "";
          } else mailtoOrder(files);
        }).catch(function () { mailtoOrder(files); });
      return;
    }
    mailtoOrder(files);
  }
  function mailtoOrder(files) {
    var to = CO.orderEmail || "info@laccistudio.com";
    var designNote = (files && files.length)
      ? "\n\nMY DESIGN FILES: " + files.map(function (f) { return f.name; }).join(", ") + "\n(Please attach these file(s) to this email before sending.)"
      : "\n\n(If your item needs a photo/logo, reply to this email with your design attached.)";
    var body = encodeURIComponent("Hi Lacci Studio,\n\nI'd like to order:\n\n" + orderText() + designNote + "\n\nName:\nPhone:\nNotes:\n");
    window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent("New Order Request — Lacci Studio") + "&body=" + body;
    var pay = document.querySelector("#pay-area");
    if (pay) pay.innerHTML = '<p class="pay-ok">Your email is opening with your order' +
      (files && files.length ? '. <strong>Please attach your design file(s)</strong> (' + files.map(function (f) { return esc(f.name); }).join(", ") + ') before sending.' : ' — reply with your design attached if needed.') + '</p>';
  }
  function payPal() {
    var pay = document.querySelector("#pay-area");
    if (!CO.paypalClientId) { if (pay) pay.innerHTML = '<p class="pay-err">PayPal isn\'t connected yet. Add your PayPal Client ID in shop-config.js, or switch checkout mode to "inquiry".</p>'; return; }
    document.querySelector("#cart-checkout").style.display = "none";
    var hasDesign = collectFiles().length || cart.some(function (i) { return i.note; });
    if (pay) pay.innerHTML = (hasDesign ? '<p class="cart-note">After payment, we’ll email you to collect your design/photo &amp; personalization.</p>' : "") + '<div id="paypal-buttons"></div>';
    loadScript("https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(CO.paypalClientId) + "&currency=" + encodeURIComponent(CUR), function () {
      if (!window.paypal) return;
      window.paypal.Buttons({
        style: { color: "gold", shape: "rect", label: "pay" },
        createOrder: function (data, actions) {
          return actions.order.create({ purchase_units: [{
            amount: { value: subtotal().toFixed(2), currency_code: CUR, breakdown: { item_total: { value: subtotal().toFixed(2), currency_code: CUR } } },
            items: cart.map(function (i) { return { name: (i.name + (i.option ? " - " + i.option : "")).slice(0, 127), quantity: String(i.qty), unit_amount: { value: Number(i.price).toFixed(2), currency_code: CUR } }; })
          }] });
        },
        onApprove: function (data, actions) {
          return actions.order.capture().then(function () {
            cart = []; save(cart); FILES = {}; render();
            var p = document.querySelector("#cart-items");
            if (p) p.innerHTML = '<p class="pay-ok" style="text-align:center">Thank you! Payment received. We’ll email you to collect your design &amp; finalize your custom order.</p>';
            var f = document.querySelector("#cart-foot"); if (f) f.innerHTML = "";
          });
        }
      }).render("#paypal-buttons");
    });
  }
  var loaded = {};
  function loadScript(src, cb) { if (loaded[src]) return cb(); var s = document.createElement("script"); s.src = src; s.onload = function () { loaded[src] = 1; cb(); }; document.head.appendChild(s); }

  /* ----------------------------- Snipcart ----------------------------- */
  function initSnipcart() {
    if (!SNIPCART) return;
    var div = document.createElement("div");
    div.id = "snipcart"; div.setAttribute("data-config-modal-style", "side"); div.setAttribute("data-api-key", CO.snipcartApiKey); div.hidden = true;
    document.body.appendChild(div);
    var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdn.snipcart.com/themes/v3.7.1/default/snipcart.css"; document.head.appendChild(css);
    loadScript("https://cdn.snipcart.com/themes/v3.7.1/default/snipcart.js", function () {});
  }

  /* ------------------------------- init ------------------------------- */
  function init() { renderGrid(); renderFilters(); injectChrome(); render(); if (SNIPCART) initSnipcart(); }
  init();
  }
  if (window.LACCI_READY) run();
  else document.addEventListener("lacci:ready", run, { once: true });
})();
