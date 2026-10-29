import { issueTurnCredentials, requireTurnSession } from "../utils/turnSessions";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  if (getMethod(event) !== "POST") {
    setHeader(event, "Allow", "POST");
    throw createError({ statusCode: 405, statusMessage: "POST only" });
  }

  const authorization = getHeader(event, "authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  let body: unknown;
  try {
    body = await readBody(event);
  } catch {
    body = undefined;
  }
  const roomID = typeof body === "object" && body !== null && "roomID" in body ? body.roomID : undefined;
  if (!bearer || typeof roomID !== "string" || !roomID) {
    throw createError({ statusCode: 401, statusMessage: "Live room session required" });
  }

  const session = requireTurnSession(bearer, roomID);
  try {
    const { turnID, turnToken } = useRuntimeConfig(event);
    const credentials = await issueTurnCredentials(session, { turnID, turnToken }, $fetch);
    setResponseStatus(event, 200);
    return credentials;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 429) {
      const dataValue = "data" in error ? error.data : undefined;
      const retryAfter = typeof dataValue === "object" && dataValue !== null &&
        "retryAfter" in dataValue && typeof dataValue.retryAfter === "number"
        ? dataValue.retryAfter
        : 1;
      setHeader(event, "Retry-After", String(retryAfter));
    }
    throw error;
  }
});
