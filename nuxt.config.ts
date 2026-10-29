// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-04-03",
  devtools: { enabled: true },

  nitro: {
    experimental: {
      websocket: true,
    },
  },

  runtimeConfig: {
    turnID: "",
    turnToken: "",
    public: {
      docsUrl: "https://litsi.nirjan.dev/",
      telemetrydeck: {
        appID: "",
      },
    },
  },

  css: ["~/assets/css/main.css"],

  modules: ["@nuxt/ui"],
});
