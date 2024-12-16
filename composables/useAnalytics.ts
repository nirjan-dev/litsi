import TelemetryDeck from "@telemetrydeck/sdk";

let analytics: TelemetryDeck | null = null;

export const useAnalytics = () => {
  const appID = useRuntimeConfig().public.telemetrydeck.appID;

  if (!analytics) {
    console.log("TelemetryDeck initialized");
    analytics = new TelemetryDeck({
      appID,
      clientUser: "default",
      testMode: import.meta.dev,
    });
  }

  function trackEvent(
    event: string,
    payload?: {
      [key: string]: string;
    }
  ) {
    if (!analytics) {
      return;
    }
    console.log("tracking event", event, payload);
    analytics.signal(event, payload);
  }

  function setUserID(userId: string) {
    if (!analytics) {
      return;
    }
    console.log("setting user id", userId);
    analytics.clientUser = userId;
  }

  return {
    trackEvent,
    setUserID,
  };
};
