import { defineConfig } from 'vitepress'

const requestedBase = process.env.DOCS_BASE || '/'
const base = '/' + requestedBase.replace(/^\/+|\/+$/g, '') + (requestedBase === '/' ? '' : '/')

export default defineConfig({
  title: 'Litsi',
  description: 'A room link. A conversation. Small, account-free video calls you can host yourself.',
  base,
  lang: 'en-US',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: base + 'logo.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Litsi',
    nav: [
      { text: 'Guide', link: '/introduction' },
      { text: 'Self-host', link: '/self-hosting' },
      { text: 'Try Litsi ↗', link: 'https://litsi.fly.dev' },
    ],
    sidebar: [
      { text: 'Meet Litsi', items: [
        { text: 'Introduction & demo', link: '/introduction' },
        { text: 'Local quickstart', link: '/quickstart' },
        { text: 'Architecture', link: '/architecture' },
        { text: 'Privacy & limits', link: '/privacy-and-limits' },
      ] },
      { text: 'Run your own', items: [
        { text: 'Self-hosting', link: '/self-hosting' },
        { text: 'Configuration', link: '/configuration' },
        { text: 'Troubleshooting', link: '/troubleshooting' },
      ] },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/nirjan-dev/litsi' }],
    editLink: { pattern: 'https://github.com/nirjan-dev/litsi/edit/master/docs-site/:path', text: 'Edit this page on GitHub' },
    footer: { message: 'Small calls. Clear boundaries. Released under the MIT License.', copyright: 'Litsi · Nirjan Khadka' },
    search: { provider: 'local' },
  },
})
