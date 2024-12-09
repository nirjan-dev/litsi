interface IceUrlsResponse {
  iceServers: {
    urls: string[];
    username: string;
    credential: string;
  }[];
}

export default defineEventHandler(async (event) => {
  const { turnID, turnToken } = useRuntimeConfig();

  return $fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${turnID}/credentials/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${turnToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 86400 }),
    }
  );
});
