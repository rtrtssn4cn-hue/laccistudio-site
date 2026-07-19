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

  Promise.all([
    getJSON("/content/settings.json"),
    getJSON("/content/products.json"),
    getJSON("/content/home.json")
  ]).then(function (res) {
    var s = res[0] || {};
    var p = res[1] || {};
    var h = res[2] || {};

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
    var products = (p.products || []).map(function (pr) {
      var opt = null;
      if (pr.choices && pr.choices.length) {
        opt = {
          label: pr.optionLabel || "Option",
          choices: pr.choices.map(function (c) {
            return (c && c.price !== undefined && c.price !== null && c.price !== "")
              ? { name: c.name, price: Number(c.price) }
              : (c && c.name ? c.name : c);
          })
        };
      }
      return {
        id: pr.id, name: pr.name, price: Number(pr.price), image: pr.image,
        category: pr.category, description: pr.description, options: opt
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
        uploadEndpoint: s.uploadEndpoint || ""
      },
      products: products
    };

    // ---- Inject editable homepage text ----
    Object.keys(h).forEach(function (k) {
      document.querySelectorAll('[data-c="' + k + '"]').forEach(function (el) {
        el.textContent = h[k];
      });
    });

    window.LACCI_READY = true;
    document.dispatchEvent(new Event("lacci:ready"));
  });
})();
