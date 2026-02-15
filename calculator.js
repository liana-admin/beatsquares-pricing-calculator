// BeatSquares Pricing Calculator – Logic & Rendering
(function () {
  "use strict";

  var QUALITY_ORDER = { standard: 0, extended: 1, custom: 2 };
  var QUALITY_LABELS = { standard: "Standard", extended: "Extended", custom: "Custom" };

  var els = {};
  var lastTierId = null;

  // ── Helpers ──────────────────────────────────────────────

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function fmt(amount) {
    if (amount === null || amount === undefined) return "\u2013";
    return amount.toLocaleString("de-DE") + " " + CONFIG.ui.currency;
  }

  // ── Init ─────────────────────────────────────────────────

  function init() {
    cacheElements();
    loadFromURL();
    setupListeners();
    calculate();
  }

  function cacheElements() {
    els = {
      newsletters: document.getElementById("newsletters"),
      podcasts: document.getElementById("podcasts"),
      channels: document.getElementById("channels"),
      daysPerWeek: document.getElementById("days-per-week"),
      daysDisplay: document.getElementById("days-display"),
      sources: document.getElementById("sources"),
      channelDaysDisplay: document.getElementById("channel-days-display"),
      channelDaysInfo: document.getElementById("channel-days-info"),
      tierBadge: document.getElementById("tier-badge"),
      tierReason: document.getElementById("tier-reason"),
      upgradeHint: document.getElementById("upgrade-hint"),
      contactSalesWarning: document.getElementById("contact-sales-warning"),
      breakdown: document.getElementById("breakdown"),
      transparency: document.getElementById("transparency"),
      copyLink: document.getElementById("copy-link"),
      copyBreakdown: document.getElementById("copy-breakdown"),
      copyFeedback: document.getElementById("copy-feedback"),
    };
  }

  function setupListeners() {
    var inputs = [
      els.newsletters,
      els.podcasts,
      els.channels,
      els.daysPerWeek,
      els.sources,
    ];
    inputs.forEach(function (el) {
      el.addEventListener("input", calculate);
    });

    document.getElementsByName("quality").forEach(function (radio) {
      radio.addEventListener("change", calculate);
    });

    els.copyLink.addEventListener("click", copyLink);
    els.copyBreakdown.addEventListener("click", copyBreakdown);
  }

  // ── Input reading ────────────────────────────────────────

  function getInputs() {
    var qualityRadio = document.querySelector('input[name="quality"]:checked');
    var quality = qualityRadio ? qualityRadio.value : "standard";

    return {
      media_count: 1,
      newsletters: clamp(parseInt(els.newsletters.value) || 0, 0, 500),
      podcasts: clamp(parseInt(els.podcasts.value) || 0, 0, 200),
      channels: clamp(parseInt(els.channels.value) || 0, 0, 20),
      days_per_week: clamp(parseInt(els.daysPerWeek.value) || 0, 0, 7),
      quality_level: quality,
      sources_per_medium: clamp(parseInt(els.sources.value) || 0, 0, 50),
    };
  }

  // ── URL handling ─────────────────────────────────────────

  function loadFromURL() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has("n")) return;

    var map = {
      n: "newsletters",
      p: "podcasts",
      c: "channels",
      d: "days-per-week",
      s: "sources",
    };

    Object.keys(map).forEach(function (key) {
      var val = params.get(key);
      if (val !== null) {
        var el = document.getElementById(map[key]);
        if (el) el.value = val;
      }
    });

    var q = params.get("q");
    if (q) {
      var radio = document.querySelector(
        'input[name="quality"][value="' + q + '"]'
      );
      if (radio) radio.checked = true;
    }
  }

  function generateLink() {
    var inputs = getInputs();
    var params = new URLSearchParams({
      n: inputs.newsletters,
      p: inputs.podcasts,
      c: inputs.channels,
      d: inputs.days_per_week,
      q: inputs.quality_level,
      s: inputs.sources_per_medium,
    });
    return (
      window.location.origin +
      window.location.pathname +
      "?" +
      params.toString()
    );
  }

  // ── Tier determination ───────────────────────────────────

  function determineTier(inputs) {
    var desired = {
      newsletters: inputs.newsletters,
      podcasts: inputs.podcasts,
      channel_days:
        inputs.channels * inputs.days_per_week * CONFIG.app.month_weeks,
    };

    var lastSkipReasons = [];

    for (var i = 0; i < CONFIG.tiers.length; i++) {
      var tier = CONFIG.tiers[i];
      var eligible = true;
      var tierReasons = [];

      // Hard constraint: podcast
      if (!tier.constraints.podcast_allowed && desired.podcasts > 0) {
        tierReasons.push(
          "Podcast in " + tier.name + " nicht verfügbar"
        );
        eligible = false;
      }

      if (eligible) {
        var inc_nl = tier.included.newsletters_per_month * inputs.media_count;
        var inc_pod = tier.included.podcasts_per_month * inputs.media_count;
        var inc_msg =
          tier.included.messaging_channel_days_per_month * inputs.media_count;

        if (desired.newsletters > inc_nl) {
          tierReasons.push(
            "Newsletter: " +
              desired.newsletters +
              " > " +
              inc_nl +
              " inkludiert"
          );
          eligible = false;
        }
        if (desired.podcasts > inc_pod) {
          tierReasons.push(
            "Podcast: " + desired.podcasts + " > " + inc_pod + " inkludiert"
          );
          eligible = false;
        }
        if (desired.channel_days > inc_msg) {
          tierReasons.push(
            "Messaging: " +
              desired.channel_days +
              " Ch-Tage > " +
              inc_msg +
              " inkludiert"
          );
          eligible = false;
        }
      }

      if (eligible) {
        return {
          tier: tier,
          reasons:
            lastSkipReasons.length > 0
              ? lastSkipReasons
              : ["Alle Outputs passen in dieses Tier"],
          desired: desired,
        };
      }

      lastSkipReasons = tierReasons;
    }

    // No tier fits → use highest tier with overages
    var lastTier = CONFIG.tiers[CONFIG.tiers.length - 1];
    return {
      tier: lastTier,
      reasons: lastSkipReasons,
      desired: desired,
      hasOverages: true,
    };
  }

  // ── Pricing computation ──────────────────────────────────

  function computePricing(inputs) {
    var result = determineTier(inputs);
    var tier = result.tier;
    var desired = result.desired;

    // Base
    var base = tier.price_monthly * inputs.media_count;

    // Quality add-on (GLOBAL, DELTA)
    var includedQ = tier.included.quality_level;
    var desiredQ = inputs.quality_level;
    var qualityAddon = 0;
    var qualityApplicable = false;
    if (QUALITY_ORDER[desiredQ] > QUALITY_ORDER[includedQ]) {
      qualityAddon =
        CONFIG.addons.quality.price_by_level[desiredQ] -
        CONFIG.addons.quality.price_by_level[includedQ];
      qualityApplicable = true;
    }

    // Sources add-on (per extra source, per medium)
    var includedSrc = tier.included.sources_per_medium;
    var requestedSrc = inputs.sources_per_medium;
    var extraSources = Math.max(0, requestedSrc - includedSrc);
    var sourcesApplicable = false;
    var sourcesContactSales = false;
    var sourcesPerMedium = 0;

    if (requestedSrc > CONFIG.addons.sources.max_sources_per_medium) {
      sourcesContactSales = true;
    } else if (extraSources > 0) {
      sourcesPerMedium = extraSources * tier.overage.source_price;
      sourcesApplicable = true;
    }
    var sourcesAddon = sourcesPerMedium * inputs.media_count;

    // Overages
    var inc_nl = tier.included.newsletters_per_month * inputs.media_count;
    var inc_pod = tier.included.podcasts_per_month * inputs.media_count;
    var inc_msg =
      tier.included.messaging_channel_days_per_month * inputs.media_count;

    var overages = {
      newsletters: {
        qty: Math.max(0, desired.newsletters - inc_nl),
        price: tier.overage.newsletter_price,
        included: inc_nl,
      },
      podcasts: {
        qty: Math.max(0, desired.podcasts - inc_pod),
        price: tier.overage.podcast_price,
        included: inc_pod,
      },
      messaging: {
        qty: Math.max(0, desired.channel_days - inc_msg),
        price: tier.overage.messaging_day_price,
        included: inc_msg,
      },
    };

    overages.newsletters.cost =
      overages.newsletters.price !== null
        ? overages.newsletters.qty * overages.newsletters.price
        : null;
    overages.podcasts.cost =
      overages.podcasts.price !== null
        ? overages.podcasts.qty * overages.podcasts.price
        : null;
    overages.messaging.cost =
      overages.messaging.price !== null
        ? overages.messaging.qty * overages.messaging.price
        : null;

    var overageCost =
      (overages.newsletters.cost || 0) +
      (overages.podcasts.cost || 0) +
      (overages.messaging.cost || 0);

    var totalMonthly = base + qualityAddon + sourcesAddon + overageCost;
    var totalYearly = totalMonthly * 12;

    return {
      tier: tier,
      reasons: result.reasons,
      desired: desired,
      inputs: inputs,
      base: base,
      qualityAddon: qualityAddon,
      qualityApplicable: qualityApplicable,
      qualityFrom: includedQ,
      qualityTo: desiredQ,
      sourcesAddon: sourcesAddon,
      sourcesPerMedium: sourcesPerMedium,
      sourcesApplicable: sourcesApplicable,
      sourcesContactSales: sourcesContactSales,
      overages: overages,
      overageCost: overageCost,
      totalMonthly: totalMonthly,
      totalYearly: totalYearly,
      included: {
        newsletters: inc_nl,
        podcasts: inc_pod,
        messaging: inc_msg,
        quality: includedQ,
        sources: includedSrc,
      },
    };
  }

  // ── Upgrade hint ─────────────────────────────────────────

  function getUpgradeHint(result) {
    var currentIdx = CONFIG.tiers.indexOf(result.tier);
    if (currentIdx >= CONFIG.tiers.length - 1) return null;

    var nextTier = CONFIG.tiers[currentIdx + 1];
    var nextBase = nextTier.price_monthly * result.inputs.media_count;

    // Compute what quality add-on would be on next tier
    var nextIncQ = nextTier.included.quality_level;
    var desiredQ = result.inputs.quality_level;
    var nextQualityAddon = 0;
    if (QUALITY_ORDER[desiredQ] > QUALITY_ORDER[nextIncQ]) {
      nextQualityAddon =
        CONFIG.addons.quality.price_by_level[desiredQ] -
        CONFIG.addons.quality.price_by_level[nextIncQ];
    }

    // Compute sources add-on on next tier
    var nextIncSrc = nextTier.included.sources_per_medium;
    var reqSrc = result.inputs.sources_per_medium;
    var nextExtraSrc = Math.max(0, reqSrc - nextIncSrc);
    var nextSourcesAddon = nextExtraSrc * nextTier.overage.source_price * result.inputs.media_count;

    var nextTotal = nextBase + nextQualityAddon + nextSourcesAddon;
    // No overages on next tier (outputs presumably fit)

    if (result.totalMonthly >= nextTotal * 0.85) {
      var diff = nextTotal - result.totalMonthly;
      return { nextTier: nextTier, nextTotal: nextTotal, diff: diff };
    }
    return null;
  }

  // ── Rendering ────────────────────────────────────────────

  function renderTierBadge(result) {
    var badge = els.tierBadge;
    var tierClass =
      result.tier.id === "T1" ? "t1" : result.tier.id === "T2" ? "t2" : "t3";
    badge.className = "tier-badge " + tierClass;
    badge.textContent = result.tier.name;

    if (lastTierId !== result.tier.id) {
      badge.classList.remove("animate");
      void badge.offsetWidth; // reflow
      badge.classList.add("animate");
    }
    lastTierId = result.tier.id;

    // Reasons
    var reasonHtml = result.reasons
      .map(function (r) {
        return '<span class="reason-item">' + escapeHtml(r) + "</span>";
      })
      .join("");
    els.tierReason.innerHTML = reasonHtml;
  }

  function renderUpgradeHint(result) {
    var hint = getUpgradeHint(result);
    if (hint) {
      var text;
      if (hint.diff <= 0) {
        text =
          hint.nextTier.name +
          " wäre günstiger (" +
          fmt(hint.nextTotal) +
          "/Monat) mit mehr inkludierten Leistungen.";
      } else {
        text =
          "Für " +
          fmt(hint.diff) +
          " mehr/Monat erhalten Sie " +
          hint.nextTier.name +
          " mit deutlich mehr inkludierten Outputs.";
      }
      els.upgradeHint.textContent = text;
      els.upgradeHint.classList.add("visible");
    } else {
      els.upgradeHint.classList.remove("visible");
    }
  }

  function renderContactSales(result) {
    if (result.sourcesContactSales) {
      els.contactSalesWarning.textContent =
        "Quellen > " + CONFIG.addons.sources.max_sources_per_medium + " pro Medium: Bitte kontaktieren Sie unser Sales-Team für ein individuelles Angebot.";
      els.contactSalesWarning.classList.add("visible");
    } else {
      els.contactSalesWarning.classList.remove("visible");
    }
  }

  function renderBreakdown(result) {
    var rows = [];

    // Base
    rows.push(
      '<tr><td class="item-label">Basis: ' +
        escapeHtml(result.tier.name) +
        "</td><td>" +
        fmt(result.base) +
        "</td></tr>"
    );
    rows.push(
      '<tr><td class="item-detail">' +
        fmt(result.tier.price_monthly) +
        " / Monat</td><td></td></tr>"
    );

    // Quality add-on
    if (result.qualityApplicable) {
      rows.push(
        '<tr><td class="item-label">Setup Add-on</td><td>' +
          fmt(result.qualityAddon) +
          "</td></tr>"
      );
      rows.push(
        '<tr><td class="item-detail">' +
          QUALITY_LABELS[result.qualityFrom] +
          " → " +
          QUALITY_LABELS[result.qualityTo] +
          " (global, Delta)</td><td></td></tr>"
      );
    }

    // Sources add-on
    if (result.sourcesApplicable) {
      var extraSrc = result.inputs.sources_per_medium - result.included.sources;
      rows.push(
        '<tr><td class="item-label">Quellen Add-on</td><td>' +
          fmt(result.sourcesAddon) +
          "</td></tr>"
      );
      rows.push(
        '<tr><td class="item-detail">' +
          extraSrc + " Extra-Quellen &times; " +
          fmt(result.tier.overage.source_price) +
          "</td><td></td></tr>"
      );
    } else if (result.sourcesContactSales) {
      rows.push(
        '<tr><td class="item-label">Quellen Add-on</td><td class="overage-unavailable">Contact Sales</td></tr>'
      );
    }

    // Overages
    var hasOverages =
      result.overages.newsletters.qty > 0 ||
      result.overages.podcasts.qty > 0 ||
      result.overages.messaging.qty > 0;

    if (hasOverages) {
      rows.push(
        '<tr><td class="item-label" style="padding-top:10px">Overages</td><td></td></tr>'
      );

      if (result.overages.newsletters.qty > 0) {
        if (result.overages.newsletters.cost !== null) {
          rows.push(
            '<tr><td class="item-detail">Newsletter: ' +
              result.overages.newsletters.qty +
              " &times; " +
              fmt(result.overages.newsletters.price) +
              "</td><td>" +
              fmt(result.overages.newsletters.cost) +
              "</td></tr>"
          );
        }
      }

      if (result.overages.podcasts.qty > 0) {
        if (result.overages.podcasts.cost !== null) {
          rows.push(
            '<tr><td class="item-detail">Podcast: ' +
              result.overages.podcasts.qty +
              " &times; " +
              fmt(result.overages.podcasts.price) +
              "</td><td>" +
              fmt(result.overages.podcasts.cost) +
              "</td></tr>"
          );
        } else {
          rows.push(
            '<tr><td class="item-detail">Podcast</td><td class="overage-unavailable">Upgrade nötig</td></tr>'
          );
        }
      }

      if (result.overages.messaging.qty > 0) {
        if (result.overages.messaging.cost !== null) {
          rows.push(
            '<tr><td class="item-detail">Messaging: ' +
              result.overages.messaging.qty +
              " Ch-Tage &times; " +
              fmt(result.overages.messaging.price) +
              "</td><td>" +
              fmt(result.overages.messaging.cost) +
              "</td></tr>"
          );
        }
      }
    }

    // Divider + total
    rows.push('<tr class="divider"><td></td><td></td></tr>');
    rows.push(
      '<tr class="total"><td>Gesamt monatlich</td><td>' +
        fmt(result.totalMonthly) +
        "</td></tr>"
    );
    if (CONFIG.ui.show_yearly) {
      rows.push(
        '<tr class="total-yearly"><td>Gesamt jährlich</td><td>' +
          fmt(result.totalYearly) +
          "</td></tr>"
      );
    }

    els.breakdown.innerHTML = "<table>" + rows.join("") + "</table>";
  }

  function renderTransparency(result) {
    var rows = [];

    rows.push(
      "<thead><tr><th>Kategorie</th><th>Inkludiert</th><th>Bedarf</th><th>Status</th></tr></thead>"
    );
    rows.push("<tbody>");

    // Newsletter
    rows.push(
      transparencyRow(
        "Newsletter",
        result.included.newsletters + "/Monat",
        result.desired.newsletters + "/Monat",
        result.overages.newsletters.qty > 0
          ? "+" + result.overages.newsletters.qty + " Overage"
          : null,
        "ok"
      )
    );

    // Podcast
    var podStatus = "ok";
    var podText = null;
    if (
      !result.tier.constraints.podcast_allowed &&
      result.desired.podcasts > 0
    ) {
      podStatus = "blocked";
      podText = "Nicht verfügbar";
    } else if (result.overages.podcasts.qty > 0) {
      if (result.overages.podcasts.cost !== null) {
        podStatus = "overage";
        podText = "+" + result.overages.podcasts.qty + " Overage";
      } else {
        podStatus = "blocked";
        podText = "Upgrade nötig";
      }
    }
    rows.push(
      transparencyRow(
        "Podcast",
        result.included.podcasts + "/Monat",
        result.desired.podcasts + "/Monat",
        podText,
        podStatus
      )
    );

    // Messaging
    rows.push(
      transparencyRow(
        "Messaging",
        result.included.messaging + " Ch-Tage",
        result.desired.channel_days + " Ch-Tage",
        result.overages.messaging.qty > 0
          ? "+" + result.overages.messaging.qty + " Ch-Tage"
          : null,
        result.overages.messaging.qty > 0 ? "overage" : "ok"
      )
    );

    // Quality
    var qStatus = "ok";
    var qText = null;
    if (result.qualityApplicable) {
      qStatus = "addon";
      qText = "+" + fmt(result.qualityAddon) + " Add-on";
    }
    rows.push(
      transparencyRow(
        "Setup",
        QUALITY_LABELS[result.included.quality],
        QUALITY_LABELS[result.inputs.quality_level],
        qText,
        qStatus
      )
    );

    // Sources
    var sStatus = "ok";
    var sText = null;
    if (result.sourcesApplicable) {
      sStatus = "addon";
      sText = "+" + fmt(result.sourcesAddon) + " Add-on";
    } else if (result.sourcesContactSales) {
      sStatus = "blocked";
      sText = "Contact Sales";
    }
    rows.push(
      transparencyRow(
        "Quellen/Medium",
        result.included.sources + "",
        result.inputs.sources_per_medium + "",
        sText,
        sStatus
      )
    );

    rows.push("</tbody>");
    els.transparency.innerHTML = "<table>" + rows.join("") + "</table>";
  }

  function transparencyRow(label, included, need, statusText, statusType) {
    var statusClass = "status-" + statusType;
    var display =
      statusText ||
      '<span class="status-ok">\u2713</span>';
    if (statusText) {
      display = '<span class="' + statusClass + '">' + escapeHtml(statusText) + "</span>";
    }
    return (
      "<tr><td>" +
      escapeHtml(label) +
      "</td><td>" +
      escapeHtml(included) +
      "</td><td>" +
      escapeHtml(need) +
      "</td><td>" +
      display +
      "</td></tr>"
    );
  }

  // ── Copy functions ───────────────────────────────────────

  function copyLink() {
    var url = generateLink();
    navigator.clipboard.writeText(url).then(function () {
      showCopyFeedback("Link kopiert!");
    });
  }

  function copyBreakdown() {
    var inputs = getInputs();
    var result = computePricing(inputs);
    var text = generateBreakdownText(result);
    navigator.clipboard.writeText(text).then(function () {
      showCopyFeedback("Breakdown kopiert!");
    });
  }

  function generateBreakdownText(r) {
    var lines = [];
    lines.push("BeatSquares Pricing – " + r.tier.name);
    lines.push("=".repeat(44));
    lines.push("");
    lines.push(
      "Basis: " +
        r.tier.name +
        " = " +
        fmt(r.base)
    );

    if (r.qualityApplicable) {
      lines.push(
        "Setup Add-on (" +
          QUALITY_LABELS[r.qualityFrom] +
          " -> " +
          QUALITY_LABELS[r.qualityTo] +
          "): " +
          fmt(r.qualityAddon)
      );
    }

    if (r.sourcesApplicable) {
      var extraSrc = r.inputs.sources_per_medium - r.included.sources;
      lines.push(
        "Quellen Add-on: " + extraSrc + " Extra x " +
          fmt(r.tier.overage.source_price) +
          " = " +
          fmt(r.sourcesAddon)
      );
    } else if (r.sourcesContactSales) {
      lines.push("Quellen: Contact Sales");
    }

    if (r.overages.newsletters.qty > 0 && r.overages.newsletters.cost !== null) {
      lines.push(
        "Overage Newsletter: " +
          r.overages.newsletters.qty +
          " x " +
          fmt(r.overages.newsletters.price) +
          " = " +
          fmt(r.overages.newsletters.cost)
      );
    }
    if (r.overages.podcasts.qty > 0 && r.overages.podcasts.cost !== null) {
      lines.push(
        "Overage Podcast: " +
          r.overages.podcasts.qty +
          " x " +
          fmt(r.overages.podcasts.price) +
          " = " +
          fmt(r.overages.podcasts.cost)
      );
    }
    if (r.overages.messaging.qty > 0 && r.overages.messaging.cost !== null) {
      lines.push(
        "Overage Messaging: " +
          r.overages.messaging.qty +
          " Ch-Tage x " +
          fmt(r.overages.messaging.price) +
          " = " +
          fmt(r.overages.messaging.cost)
      );
    }

    lines.push("");
    lines.push("Gesamt monatlich: " + fmt(r.totalMonthly));
    lines.push("Gesamt jaehrlich: " + fmt(r.totalYearly));

    return lines.join("\n");
  }

  function showCopyFeedback(msg) {
    els.copyFeedback.textContent = msg;
    setTimeout(function () {
      els.copyFeedback.textContent = "";
    }, 2000);
  }

  // ── Main calculation loop ────────────────────────────────

  function calculate() {
    var inputs = getInputs();

    // Update display values
    var channelDays =
      inputs.channels * inputs.days_per_week * CONFIG.app.month_weeks;
    els.channelDaysDisplay.textContent = channelDays;
    els.daysDisplay.textContent = inputs.days_per_week;

    var result = computePricing(inputs);

    renderTierBadge(result);
    renderUpgradeHint(result);
    renderContactSales(result);
    renderBreakdown(result);
    renderTransparency(result);
  }

  // ── Util ─────────────────────────────────────────────────

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Tier Carousel ─────────────────────────────────────────

  var carouselIndex = 0;

  function initCarousel() {
    var prev = document.getElementById("carousel-prev");
    var next = document.getElementById("carousel-next");
    var dots = document.getElementById("carousel-dots");

    // Build dots
    CONFIG.tiers.forEach(function (_, i) {
      var dot = document.createElement("button");
      dot.className = "carousel-dot" + (i === 0 ? " active" : "");
      dot.addEventListener("click", function () {
        carouselIndex = i;
        renderCarousel();
      });
      dots.appendChild(dot);
    });

    prev.addEventListener("click", function () {
      if (carouselIndex > 0) {
        carouselIndex--;
        renderCarousel();
      }
    });

    next.addEventListener("click", function () {
      if (carouselIndex < CONFIG.tiers.length - 1) {
        carouselIndex++;
        renderCarousel();
      }
    });

    renderCarousel();
  }

  function renderCarousel() {
    var tier = CONFIG.tiers[carouselIndex];
    var card = document.getElementById("carousel-card");
    var prev = document.getElementById("carousel-prev");
    var next = document.getElementById("carousel-next");

    prev.disabled = carouselIndex === 0;
    next.disabled = carouselIndex === CONFIG.tiers.length - 1;

    // Update dots
    var dots = document.getElementById("carousel-dots").children;
    for (var d = 0; d < dots.length; d++) {
      dots[d].className = "carousel-dot" + (d === carouselIndex ? " active" : "");
    }

    // Tier color class
    card.className = "carousel-card tier-highlight-" + tier.id.toLowerCase();

    var qualityLabel = QUALITY_LABELS[tier.included.quality_level] || tier.included.quality_level;
    var podcastNote = tier.constraints.podcast_allowed
      ? tier.included.podcasts_per_month + " / Monat"
      : "Nicht verfügbar";

    var overageParts = [];
    if (tier.overage.newsletter_price !== null) {
      overageParts.push("Newsletter: " + fmt(tier.overage.newsletter_price) + "/Stk");
    }
    if (tier.overage.podcast_price !== null) {
      overageParts.push("Podcast: " + fmt(tier.overage.podcast_price) + "/Ep");
    } else if (tier.constraints.podcast_allowed) {
      overageParts.push("Podcast: –");
    }
    if (tier.overage.messaging_day_price !== null) {
      overageParts.push("Messaging: " + fmt(tier.overage.messaging_day_price) + "/Ch-Tag");
    }
    if (tier.overage.source_price !== null) {
      overageParts.push("Quellen: " + fmt(tier.overage.source_price) + "/Extra-Quelle");
    }

    card.innerHTML =
      '<div class="card-header">' +
        '<div class="card-title">' + escapeHtml(tier.name) + "</div>" +
        '<div class="card-price">' + fmt(tier.price_monthly) + " <span>/ Monat</span></div>" +
      "</div>" +
      '<div class="card-grid">' +
        '<div class="card-item">' +
          '<div class="card-item-label">Newsletter</div>' +
          '<div class="card-item-value">' + tier.included.newsletters_per_month + " / Monat</div>" +
        "</div>" +
        '<div class="card-item">' +
          '<div class="card-item-label">Podcast</div>' +
          '<div class="card-item-value">' + podcastNote + "</div>" +
        "</div>" +
        '<div class="card-item">' +
          '<div class="card-item-label">Messaging</div>' +
          '<div class="card-item-value">' + tier.included.messaging_channel_days_per_month + " Channel-Tage</div>" +
        "</div>" +
        '<div class="card-item">' +
          '<div class="card-item-label">Setup</div>' +
          '<div class="card-item-value">' + qualityLabel + "</div>" +
        "</div>" +
        '<div class="card-item">' +
          '<div class="card-item-label">Quellen / Medium</div>' +
          '<div class="card-item-value">' + tier.included.sources_per_medium + " inkludiert</div>" +
        "</div>" +
      "</div>" +
      '<div class="card-overages">Overage-Preise: ' +
        overageParts.map(function (p) { return "<span>" + p + "</span>"; }).join("") +
      "</div>";
  }

  // ── Boot ─────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    init();
    initCarousel();
  });
})();
