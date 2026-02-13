// BeatSquares Pricing Calculator – Configuration
// Edit values below to customize pricing. No rebuild needed.
const CONFIG = {
  app: {
    month_weeks: 4
  },

  tiers: [
    {
      id: "T1",
      name: "Tier 1 – Einstieg",
      price_monthly: 500,
      included: {
        newsletters_per_month: 8,
        podcasts_per_month: 0,
        messaging_channel_days_per_month: 8,
        quality_level: "light",
        sources_per_medium: 3
      },
      constraints: {
        podcast_allowed: false
      },
      overage: {
        newsletter_price: 45,
        podcast_price: null,
        messaging_day_price: 35,
        source_price: 100
      }
    },
    {
      id: "T2",
      name: "Tier 2 – Pro",
      price_monthly: 1700,
      included: {
        newsletters_per_month: 30,
        podcasts_per_month: 20,
        messaging_channel_days_per_month: 84,
        quality_level: "standard",
        sources_per_medium: 5
      },
      constraints: {
        podcast_allowed: true
      },
      overage: {
        newsletter_price: 35,
        podcast_price: 85,
        messaging_day_price: 30,
        source_price: 75
      }
    },
    {
      id: "T3",
      name: "Tier 3 – Enterprise",
      price_monthly: 3500,
      included: {
        newsletters_per_month: 100,
        podcasts_per_month: 50,
        messaging_channel_days_per_month: 168,
        quality_level: "high",
        sources_per_medium: 15
      },
      constraints: {
        podcast_allowed: true
      },
      overage: {
        newsletter_price: 30,
        podcast_price: 70,
        messaging_day_price: 25,
        source_price: 50
      }
    }
  ],

  addons: {
    quality: {
      levels: ["light", "standard", "high"],
      // Delta pricing: add-on cost = price[desired] - price[included_in_tier]
      // Applied GLOBALLY (once per contract, not per medium)
      price_by_level: {
        light: 0,
        standard: 350,
        high: 900
      }
    },
    sources: {
      // Per extra source above tier included. Price per tier in overage.source_price.
      // extra = max(0, requested - tier.included.sources_per_medium)
      // cost = extra * tier.overage.source_price * media_count
      max_sources_per_medium: 20
    }
  },

  ui: {
    currency: "\u20AC",
    show_yearly: true
  }
};
