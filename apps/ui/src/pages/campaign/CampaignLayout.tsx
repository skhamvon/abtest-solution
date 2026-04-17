import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import type { CampaignConfig } from "@abtest-solution/core";
import { isCampaignId, parseNumericId } from "@abtest-solution/core";
import { API_BASE } from "@/apiBase";
import type { ConsentConfigApi } from "@/simulationUrl";
import type { CampaignOutletContext } from "./campaignOutletContext";

export function CampaignLayout() {
  const { id: idParam } = useParams();
  const [campaign, setCampaign] = useState<CampaignConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consentConfig, setConsentConfig] = useState<ConsentConfigApi | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const n = idParam ? parseNumericId(idParam) : null;
    if (n === null || !isCampaignId(n)) {
      setError("ID campagne invalide");
      setLoading(false);
      setCampaign(null);
      return () => {
        cancelled = true;
      };
    }
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/campaigns/${n}`);
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? "Campagne introuvable" : `Erreur ${res.status}`,
          );
        }
        const data = (await res.json()) as CampaignConfig;
        if (!cancelled) setCampaign(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [idParam]);

  useEffect(() => {
    let cancelled = false;
    async function loadConsent() {
      try {
        const res = await fetch(`${API_BASE}/api/consent-config`);
        if (!res.ok) return;
        const data = (await res.json()) as ConsentConfigApi;
        if (!cancelled) setConsentConfig(data);
      } catch {
        if (!cancelled) setConsentConfig(null);
      }
    }
    loadConsent();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error && !campaign) {
    return (
      <div className="card">
        <p>Erreur : {error}</p>
        <Link to="/campaigns" className="link-back">
          Retour aux campagnes
        </Link>
      </div>
    );
  }

  if (loading || !campaign) {
    return <p className="page-loading">Chargement…</p>;
  }

  const outletCtx: CampaignOutletContext = {
    campaign,
    setCampaign,
    consentConfig,
  };

  return (
    <div className="card campaign-layout">
      <div className="card-header">
        <h2 className="card-title">{campaign.name}</h2>
        <Link to="/campaigns" className="link-back">
          ← Liste
        </Link>
      </div>
      <nav className="campaign-subnav" aria-label="Sections campagne">
        <NavLink
          to="."
          end
          className={({ isActive }) =>
            `campaign-subnav__link${isActive ? " campaign-subnav__link--active" : ""}`
          }
        >
          Général
        </NavLink>
        <NavLink
          to="allocation"
          className={({ isActive }) =>
            `campaign-subnav__link${isActive ? " campaign-subnav__link--active" : ""}`
          }
        >
          Allocation du trafic et segments
        </NavLink>
        <NavLink
          to="variations"
          className={({ isActive }) =>
            `campaign-subnav__link${isActive ? " campaign-subnav__link--active" : ""}`
          }
        >
          Variations
        </NavLink>
        <NavLink
          to="developpement"
          className={({ isActive }) =>
            `campaign-subnav__link${isActive ? " campaign-subnav__link--active" : ""}`
          }
        >
          Développement
        </NavLink>
      </nav>
      <div className="campaign-layout__body">
        <Outlet context={outletCtx} />
      </div>
    </div>
  );
}
