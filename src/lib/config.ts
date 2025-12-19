export const siteConfig = {
  url: 'https://cc.ethereumclassic.org',
  name: 'ETC Community Calls',
  description: 'Regular open discussions about Ethereum Classic development, ECIPs, and the future of ETC.',

  // Event display settings
  // Events stay "upcoming" for this duration after their start time
  // 2.5 hours = covers typical 1-2 hour call + buffer for rebuild timing
  upcomingBufferMs: 2.5 * 60 * 60 * 1000,

  // Feed URLs (derived)
  get rssUrl() { return `${this.url}/rss.xml`; },
  get icsUrl() { return `${this.url}/etccc.ics`; },

  // Social links
  social: {
    discord: 'https://ethereumclassic.org/discord',
    youtube: 'https://www.youtube.com/@ETCCommunityCalls',
    github: 'https://github.com/ethereumclassic',
    website: 'https://ethereumclassic.org',
  },

  // Assets
  assets: {
    logo: '/etc-logo.svg',
    ogImage: '/og.png',
  },
} as const;
