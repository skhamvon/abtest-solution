import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CampaignConfig, VariationConfig } from "@abtest-solution/core";
import { isCampaignId, parseNumericId } from "@abtest-solution/core";
import { readStoredVariationId, writeStoredVariation } from "./assignmentStore";
import { buildBrowserEvaluateContext } from "./evaluateContext";
import { enqueueAbtestTask } from "./evaluateQueue";
import {
  getNavigationStoreSnapshot,
  subscribeNavigationStore,
} from "./navigationSync";

const API_BASE =
  import.meta.env.VITE_ABTEST_API_URL ?? "http://localhost:5002";

export type AbTestSlotProps = {
  /**
   * Valeur fournie par l'hôte (ex. `location.key` React Router) pour réévaluer en SPA
   * lorsque l'URL pathname/search ne change pas.
   */
  navigationDependency?: string;
};

function queryParam(name: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const v = new URLSearchParams(window.location.search).get(name);
  return v === null || v === "" ? undefined : v;
}

type AssetPaths = { cssPath?: string; jsPath?: string };

/**
 * Injecte plusieurs couches : d'abord tous les CSS (ordre du tableau), puis tous les JS.
 * Les scripts sont ajoutés sous `scriptParent` (souvent le slot React).
 */
function injectAssetLayers(
  layers: AssetPaths[],
  scriptParent: HTMLElement,
): () => void {
  const cleanups: (() => void)[] = [];
  for (const layer of layers) {
    if (!layer.cssPath) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = layer.cssPath;
    document.head.appendChild(link);
    cleanups.push(() => link.remove());
  }
  for (const layer of layers) {
    if (!layer.jsPath) continue;
    const script = document.createElement("script");
    script.src = layer.jsPath;
    script.async = true;
    scriptParent.appendChild(script);
    cleanups.push(() => script.remove());
  }
  return () => {
    for (const fn of cleanups) fn();
  };
}

export default function AbTestSlot({
  navigationDependency,
}: AbTestSlotProps = {}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const teardownRef = useRef<(() => void) | null>(null);

  const navKey = useSyncExternalStore(
    subscribeNavigationStore,
    getNavigationStoreSnapshot,
    () => "",
  );
  const routeTag = `${navKey}|${navigationDependency ?? ""}`;

  useEffect(() => {
    const rawCampaign = queryParam("ab_campaign_id");
    const campaignIdParsed = rawCampaign ? parseNumericId(rawCampaign) : null;
    if (campaignIdParsed === null || !isCampaignId(campaignIdParsed)) {
      return;
    }
    const campaignId = campaignIdParsed;

    if (queryParam("ab_skip") === "1") return;

    const simulationFlag =
      queryParam("ab_simulation") === "1" || queryParam("ab_force") === "1";
    const rawVariation = queryParam("ab_variation_id");
    const hasVariationParam = rawVariation !== undefined;
    const forcedVariationId = hasVariationParam
      ? parseNumericId(rawVariation)
      : undefined;

    const simulation =
      simulationFlag || hasVariationParam
        ? forcedVariationId !== null && forcedVariationId !== undefined
          ? { variationId: forcedVariationId }
          : {}
        : null;

    let cancelled = false;

    async function run() {
      const context = buildBrowserEvaluateContext();
      const sticky = readStoredVariationId(campaignId);
      if (sticky !== undefined) {
        context.assignedVariationId = sticky;
      }

      const res = await fetch(`${API_BASE}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          context,
          simulation,
        }),
      });

      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        campaign: CampaignConfig;
        variation: VariationConfig;
        reason: string;
      };

      if (cancelled) return;

      writeStoredVariation(
        data.campaign,
        campaignId,
        data.variation,
        data.reason,
      );

      const parent = slotRef.current;
      if (!parent) return;
      teardownRef.current?.();
      teardownRef.current = injectAssetLayers(
        [
          {
            cssPath: data.campaign.sharedCssPath,
            jsPath: data.campaign.sharedJsPath,
          },
          {
            cssPath: data.variation.cssPath,
            jsPath: data.variation.jsPath,
          },
        ],
        parent,
      );
    }

    enqueueAbtestTask(() => run());

    return () => {
      cancelled = true;
      teardownRef.current?.();
      teardownRef.current = null;
    };
  }, [routeTag]);

  return (
    <div ref={slotRef} data-abtest-slot="" style={{ display: "contents" }} />
  );
}
