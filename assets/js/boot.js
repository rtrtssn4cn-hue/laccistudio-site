/* =========================================================================
   Lacci Studio — content loader
   Fetches editable content from /content/*.json (managed by the /admin editor)
   and exposes it as window.LACCI_CONFIG + window.LACCI_SHOP, then fires
   'lacci:ready' so cart.js and main.js can initialize.
   ========================================================================= */
(function () {
  function getJSON(url) {
    return fetch(url, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  Promise.all([
    getJSON("/content/settings.json"),
    getJSON("/content/products.json"),
    getJSON("/content/home.json"),
    getJSON("/content/gallery.json")
  ]).then(function (res) {
    var s = res[0] || {};
    var p = res[1] || {};
    var h = res[2] || {};
    var g = res[3] || {};

    // ---- Contact / site settings (used by main.js) ----
    window.LACCI_CONFIG = {
      email: s.email || "",
      phone: s.phone || "",
      hoursWeekday: s.hoursWeekday || "",
      hoursSaturday: s.hoursSaturday || "",
      hoursSunday: s.hoursSunday || "",
      instagram: s.instagram || "",
      facebook: s.facebook || "",
      etsy: s.etsy || ""
    };

    // ---- Shop (used by cart.js) ----
    function mapChoice(c) {
      if (typeof c === "string") return { name: c };
      var o = { name: c.name };
      if (c.price !== undefined && c.price !== null && c.price !== "") o.price = Number(c.price);
      if (c.add !== undefined && c.add !== null && c.add !== "") o.add = Number(c.add);
      if (c.img) o.img = c.img;
      return o;
    }
    function mapGroup(g) { return { label: g.label || "Option", choices: (g.choices || []).map(mapChoice) }; }
    var products = (p.products || []).filter(function (pr) { return !pr.hidden; }).map(function (pr) {
      var groups = [];
      if (pr.optionGroups && pr.optionGroups.length) {
        groups = pr.optionGroups.map(mapGroup);
      } else if (pr.choices && pr.choices.length) {
        groups = [{ label: pr.optionLabel || "Option", choices: pr.choices.map(mapChoice) }];
      }
      var imgs = (pr.images && pr.images.length) ? pr.images : (pr.image ? [pr.image] : []);
      return {
        id: pr.id, name: pr.name, price: Number(pr.price),
        image: imgs[0] || "", images: imgs, video: pr.video || "",
        category: pr.category, description: pr.description,
        mockupPhoto: pr.mockupPhoto || "",
        options: groups[0] || null, optionGroups: groups
      };
    });
    window.LACCI_SHOP = {
      currency: "USD",
      currencySymbol: "$",
      checkout: {
        mode: s.checkoutMode || "inquiry",
        orderEmail: s.orderEmail || s.email || "",
        paypalClientId: s.paypalClientId || "",
        snipcartApiKey: s.snipcartApiKey || "",
        uploadEndpoint: s.uploadEndpoint || "",
        uploadcarePublicKey: s.uploadcarePublicKey || ""
      },
      products: products
    };

    // ---- Inject editable homepage text ----
    Object.keys(h).forEach(function (k) {
      document.querySelectorAll('[data-c="' + k + '"]').forEach(function (el) {
        el.textContent = h[k];
      });
    });

    // ---- Gallery page ----
    var ggrid = document.querySelector("#gallery-grid");
    if (ggrid) {
      if (g.intro) document.querySelectorAll('[data-c="galleryIntro"]').forEach(function (el) { el.textContent = g.intro; });
      ggrid.innerHTML = (g.items || []).map(function (it) {
        return '<figure class="gal-item"><img src="' + esc(it.image) + '" alt="' + esc(it.caption || "") + '" loading="lazy">' +
          (it.caption ? '<figcaption>' + esc(it.caption) + "</figcaption>" : "") + "</figure>";
      }).join("");
    }

    window.LACCI_READY = true;
    document.dispatchEvent(new Event("lacci:ready"));
  });
})();
