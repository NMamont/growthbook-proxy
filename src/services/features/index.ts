import got from "got";
import { Context } from "../../types";
import { featuresCache } from "../cache";
import logger from "../logger";
import { eventStreamManager } from "../eventStreamManager";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeFetches: Record<string, any> = {};

export async function fetchFeatures({
  apiKey,
  ctx,
  ssEvalEnabled = false,
}: {
  apiKey: string;
  ctx: Context;
  ssEvalEnabled?: boolean;
}) {
  const path = `/api/features/${apiKey}`;
  if (!featuresCache) {
    return;
  }
  if (!ctx.growthbookApiHost) {
    throw new Error("missing required context for fetching features");
  }
  const url = ctx.growthbookApiHost + path;

  // debounce requests
  let promise = activeFetches[url];

  if (!promise) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers: any = {
      "User-Agent": `GrowthBook Proxy`,
    };
    if (ssEvalEnabled) {
      if (!ctx.secretApiKey) {
        throw new Error("missing required context for fetching features");
      }
      headers["Authorization"] = `Bearer ${ctx.secretApiKey}`;
    }
    promise = got
      .get(url, { headers })
      .json()
      .catch((e) => logger.error(e, "Refresh stale cache error"))
      .finally(() => delete activeFetches[url]);

    activeFetches[url] = promise;
  }

  const payload = await promise;

  if (payload) {
    logger.debug("cache STALE, refreshing cache...");
    const oldEntry = await featuresCache.get(apiKey);
    await featuresCache?.set(apiKey, payload);

    if (ctx.enableEventStream && eventStreamManager) {
      eventStreamManager?.publish({
        apiKey,
        event: "features",
        payload,
        oldPayload: oldEntry?.payload,
        ssEvalEnabled,
      });
    }

    return { payload, oldEntry };
  } else {
    logger.error("Unable to parse response");
    return;
  }
}
