import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { variationSlot } from "@abtest-solution/core";
import { SourceCodeViewer } from "@/ui/SourceCodeViewer";
import { API_BASE } from "@/apiBase";
import type { CampaignOutletContext } from "./campaignOutletContext";

type DevAssetResponse = {
  folderName: string;
  path: string;
  content: string;
};

type AssetTab = "script" | "style";
type NavKey = "shared" | number;

export function CampaignDevelopmentPage() {
  const { campaign } = useOutletContext<CampaignOutletContext>();

  /** Slot 0 = contrôle (« Original ») : pas de variant-n/ côté dépôt pour l’UI code. */
  const variationsForDevMenu = useMemo(
    () =>
      [...campaign.variations]
        .filter((v) => variationSlot(v.id) !== 0)
        .sort((a, b) => a.id - b.id),
    [campaign.variations],
  );

  const [navKey, setNavKey] = useState<NavKey>("shared");
  const [assetTab, setAssetTab] = useState<AssetTab>("script");

  const [repoFolderName, setRepoFolderName] = useState<string>("");
  const [resolvedPath, setResolvedPath] = useState<string>("");
  const [sourceText, setSourceText] = useState("");
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "error" | "ok"
  >("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const first = variationsForDevMenu[0];
    setNavKey(first ? first.id : "shared");
    setAssetTab("script");
  }, [campaign.id, variationsForDevMenu]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadState("loading");
      setLoadError(null);
      setRepoFolderName("");
      setResolvedPath("");
      setSourceText("");
      try {
        const kind = assetTab;
        const scope = navKey === "shared" ? "shared" : "variation";
        const q = new URLSearchParams({ scope, kind });
        if (navKey !== "shared") {
          q.set("variationId", String(navKey));
        }
        const res = await fetch(
          `${API_BASE}/api/campaigns/${campaign.id}/dev-asset?${q}`,
        );
        if (!res.ok) {
          let msg = `Erreur HTTP ${res.status}`;
          try {
            const j = (await res.json()) as { error?: string };
            if (typeof j.error === "string" && j.error) msg = j.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as DevAssetResponse;
        if (cancelled) return;
        setRepoFolderName(
          typeof data.folderName === "string" ? data.folderName : "",
        );
        setResolvedPath(data.path ?? "");
        setSourceText(data.content ?? "");
        setLoadState("ok");
      } catch (e) {
        if (cancelled) return;
        setRepoFolderName("");
        setLoadError((e as Error).message);
        setLoadState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaign.id, navKey, assetTab]);

  const prismLanguage = assetTab === "script" ? "javascript" : "css";

  return (
    <div className="campaign-dev">
      <p className="section-hint text-small" style={{ marginBottom: "1rem" }}>
        Uniquement <code className="code-inline">shared/script.js</code>,{" "}
        <code className="code-inline">shared/style.css</code> et, par
        variation, les fichiers{" "}
        <code className="code-inline">script.js</code> /{" "}
        <code className="code-inline">style.css</code> sous{" "}
        <code className="code-inline">abtest-campaigns-segments/Campaigns/</code>
        {repoFolderName ? (
          <>
            <strong>{repoFolderName}</strong>
          </>
        ) : null}
        . Chemins résolus depuis la config (URLs) ou convention{" "}
        <code className="code-inline">variant-n/</code> si le slot de variation
        est strictement positif.
      </p>
      {campaign.type === "backend" ? (
        <p className="section-hint text-small" style={{ marginBottom: "0.75rem" }}>
          Campagne <strong>backend</strong> : ces fichiers peuvent être absents
          si la campagne n’expose pas de ressources front.
        </p>
      ) : null}
      <div className="campaign-dev__grid">
        <nav className="campaign-dev__sidebar" aria-label="Variations et partagé">
          <p className="campaign-dev__sidebar-title text-small muted">
            Variations
          </p>
          <ul className="campaign-dev__nav">
            <li>
              <button
                type="button"
                className={`campaign-dev__nav-btn campaign-dev__nav-btn--block${
                  navKey === "shared"
                    ? " campaign-dev__nav-btn--active"
                    : ""
                }`}
                onClick={() => setNavKey("shared")}
              >
                Partagé <span className="campaign-dev__nav-id">(shared)</span>
              </button>
            </li>
            {variationsForDevMenu.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className={`campaign-dev__nav-btn campaign-dev__nav-btn--block${
                    navKey === v.id ? " campaign-dev__nav-btn--active" : ""
                  }`}
                  onClick={() => setNavKey(v.id)}
                >
                  {v.name}{" "}
                  <span className="campaign-dev__nav-id">#{v.id}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="campaign-dev__main">
          <div className="campaign-dev__tabs" role="tablist" aria-label="Fichier">
            <button
              type="button"
              role="tab"
              aria-selected={assetTab === "script"}
              className={`campaign-dev__tab${
                assetTab === "script" ? " campaign-dev__tab--active" : ""
              }`}
              onClick={() => setAssetTab("script")}
            >
              Script
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={assetTab === "style"}
              className={`campaign-dev__tab${
                assetTab === "style" ? " campaign-dev__tab--active" : ""
              }`}
              onClick={() => setAssetTab("style")}
            >
              Style
            </button>
          </div>
          <div className="campaign-dev__panel campaign-dev__panel--repo campaign-dev__panel--below-tabs">
            {resolvedPath ? (
              <div className="campaign-dev__repo-head">
                <code className="code-inline campaign-dev__repo-path">
                  {resolvedPath}
                </code>
                <span className="text-small muted">
                  {prismLanguage === "css" ? "CSS" : "JavaScript"}
                </span>
              </div>
            ) : null}
            {loadState === "loading" ? (
              <p className="text-small muted">Chargement…</p>
            ) : null}
            {loadState === "error" && loadError ? (
              <p className="diag-error">{loadError}</p>
            ) : null}
            {loadState === "ok" && resolvedPath ? (
              <SourceCodeViewer
                key={`${navKey}-${assetTab}`}
                code={sourceText}
                language={prismLanguage}
                emptyMessage="Fichier vide."
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
