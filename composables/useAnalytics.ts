import TelemetryDeck from "@telemetrydeck/sdk";

let analytics: TelemetryDeck | null = null;

export const useAnalytics = () => {
  const appID = useRuntimeConfig().public.telemetrydeck.appID.trim();

  function trackEvent(event: string) {
    if (import.meta.server || !appID) return;
    analytics ??= new TelemetryDeck({
      appID,
      clientUser: "anonymous",
      testMode: import.meta.dev,
    });
    // Opt-in analytics must not interrupt a conversation when unavailable.
    void analytics.signal(event).catch(() => {});
  }

  return { trackEvent };
};
