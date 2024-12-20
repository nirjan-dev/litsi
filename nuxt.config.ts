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
      telemetrydeck: {
        appID: "",
      },
    },
  },

  modules: ["@nuxt/ui"],
});
