import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CampaignConfig, SegmentConfig } from "@abtest-solution/core";
import { API_BASE } from "../apiBase";
import {
  countCampaignsLeadingVariantNotOriginal,
  countRunningCampaigns,
} from "../lib/dashboardStats";

export function HomePage() {
  const [campaigns, setCampaigns] = useState<CampaignConfig[]>([]);
  const [segments, setSegments] = useState<SegmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [campRes, segRes] = await Promise.all([
          fetch(`${API_BASE}/api/campaigns`),
          fetch(`${API_BASE}/api/segments`),
        ]);
        if (!campRes.ok) {
          throw new Error(`Campagnes : erreur ${campRes.status}`);
        }
        if (!segRes.ok) {
          throw new Error(`Segments : erreur ${segRes.status}`);
        }
        const campData = (await campRes.json()) as CampaignConfig[];
        const segData = (await segRes.json()) as SegmentConfig[];
        if (!cancelled) {
          setCampaigns(campData);
          setSegments(segData);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const running = countRunningCampaigns(campaigns);
  const totalCampaigns = campaigns.length;
  const totalSegments = segments.length;
  const leaderNotOriginal = countCampaignsLeadingVariantNotOriginal(campaigns);

  return (
    <div className="home-page">
      <section className="card home-hero">
        <p className="home-hero__eyebrow">Console d’administration</p>
        <h2 className="home-hero__title">
          Pilotez vos expérimentations et la répartition du trafic
        </h2>
        <p className="home-hero__lede">
          Vue synthétique du dépôt de configuration actuellement chargé par l’API.
          Gérez les campagnes, les segments et le consentement depuis le menu ou les
          raccourcis ci-dessous.
        </p>
        <div className="home-hero__actions">
          <Link to="/campaigns" className="primary-button">
            Voir les campagnes
          </Link>
          <Link to="/configuration" className="ghost-button">
            Configuration
          </Link>
        </div>
      </section>

      {loading && <p className="page-loading">Chargement des indicateurs…</p>}
      {error && (
        <p className="diag-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          <div className="stats-grid">
            <article className="stat-card">
              <div className="stat-card__value">{running}</div>
              <div className="stat-card__label">Campagnes en cours</div>
              <p className="stat-card__hint">Statut « running »</p>
            </article>
            <article className="stat-card">
              <div className="stat-card__value">{totalCampaigns}</div>
              <div className="stat-card__label">Campagnes (total)</div>
              <p className="stat-card__hint">Tous statuts confondus</p>
            </article>
            <article className="stat-card">
              <div className="stat-card__value">{totalSegments}</div>
              <div className="stat-card__label">Segments</div>
              <p className="stat-card__hint">Règles d’éligibilité</p>
            </article>
            <article className="stat-card">
              <div className="stat-card__value">{leaderNotOriginal}</div>
              <div className="stat-card__label">Trafic max. ≠ Original</div>
              <p className="stat-card__hint">
                Campagnes dont la plus forte allocation n’est pas sur une variante
                nommée « Original » (config., pas résultat statistique).
              </p>
            </article>
          </div>
          <p className="home-footnote muted text-small">
            Les métriques proviennent de <code className="code-inline">GET /api/campaigns</code>{" "}
            et <code className="code-inline">GET /api/segments</code>. Aucun résultat de test A/B
            n’est persisté dans ce dépôt de démo.
          </p>
        </>
      )}
    </div>
  );
}
