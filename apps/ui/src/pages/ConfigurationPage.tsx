import { useEffect, useState } from "react";
import { API_BASE } from "../apiBase";

type ConfigurationPayload = {
  stored: {
    domain: string;
    acceptanceCookie: {
      name: string;
      value: string;
    };
  };
  effective: {
    guardActive: boolean;
    domain: string | null;
    acceptanceCookie: {
      name: string;
      value: string;
    };
  };
  envOverrides: {
    name: boolean;
    value: boolean;
    domain: boolean;
  };
};

export function ConfigurationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<ConfigurationPayload | null>(null);

  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [domain, setDomain] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/consent-config`);
        if (!res.ok) {
          throw new Error(`Erreur API ${res.status}`);
        }
        const data = (await res.json()) as ConfigurationPayload;
        if (!cancelled) {
          setPayload(data);
          setName(data.stored.acceptanceCookie.name);
          setValue(data.stored.acceptanceCookie.value);
          setDomain(data.stored.domain);
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

  async function save() {
    const domainTrim = domain.trim();
    if (!domainTrim) {
      setSaveError("Le domaine est obligatoire (ex. .example.com ou lab.example.com).");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_BASE}/api/consent-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domainTrim,
          acceptanceCookie: { name, value },
        }),
      });
      const body = (await res.json()) as { error?: string } & ConfigurationPayload;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setPayload(body);
      setName(body.stored.acceptanceCookie.name);
      setValue(body.stored.acceptanceCookie.value);
      setDomain(body.stored.domain);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const envAny =
    payload &&
    (payload.envOverrides.name ||
      payload.envOverrides.value ||
      payload.envOverrides.domain);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Configuration</h2>
        <button
          type="button"
          className="primary-button"
          disabled={saving || loading}
          onClick={() => void save()}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      <p className="section-hint" style={{ marginBottom: "1rem" }}>
        Fichier{" "}
        <code className="code-inline">consent-config.json</code> à la racine du dépôt
        données : un <strong>domaine</strong> (obligatoire) pour l’ancrage site et
        les liens de simulation ; un <strong>cookie</strong> nom / valeur pour le
        cookie de consentement (nom vide = inactif).
      </p>

      {loading && <p className="text-small">Chargement…</p>}
      {error && <p className="diag-error">{error}</p>}
      {saveError && <p className="diag-error">{saveError}</p>}

      {!loading && !error && (
        <>
          {envAny && (
            <div className="callout callout--warning">
              Des variables d&apos;environnement sur l&apos;API surchargent le fichier
              :{" "}
              {[
                payload!.envOverrides.name ? "cookie (nom)" : null,
                payload!.envOverrides.value ? "cookie (valeur)" : null,
                payload!.envOverrides.domain ? "domaine" : null,
              ]
                .filter(Boolean)
                .join(", ")}
              . L&apos;écran édite le fichier sur disque ; les valeurs effectives
              peuvent différer jusqu&apos;au retrait des surcharges.
            </div>
          )}

          {payload && (
            <div className="callout callout--info">
              <div className="callout__label">Effet actuel (fichier + env.)</div>
              <div>
                Domaine :{" "}
                <strong>
                  {payload.effective.domain != null && payload.effective.domain !== ""
                    ? payload.effective.domain
                    : "—"}
                </strong>
              </div>
              <div style={{ marginTop: "0.35rem" }}>
                Cookie de consentement :{" "}
                <strong>
                  {payload.effective.guardActive ? "actif" : "inactif"}
                </strong>
                {payload.effective.guardActive ? (
                  <span style={{ fontFamily: "ui-monospace, monospace" }}>
                    {" "}
                    — {payload.effective.acceptanceCookie.name}=
                    {payload.effective.acceptanceCookie.value}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          <h3 className="section-title-sm">Domaine du site</h3>
          <p className="section-hint">
            Utilisé pour les liens de simulation (base https). Ex.{" "}
            <code className="code-inline">.example.com</code> ou{" "}
            <code className="code-inline">lab.example.com</code>.
          </p>
          <div className="field-grid">
            <label className="field-stack">
              <span className="field-label">
                Domaine <span className="required-mark">*</span>
              </span>
              <input
                className="field-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ex. .example.com"
                required
              />
            </label>
          </div>

          <h3 className="section-title-sm">Cookie d&apos;acceptation (analytics)</h3>
          <p className="section-hint">
            Comparaison stricte avec <code className="code-inline">context.cookies</code>{" "}
            sur <code className="code-inline">POST /api/evaluate</code>. Laisser le nom
            vide pour désactiver le cookie de consentement.
          </p>
          <div className="field-grid" style={{ marginBottom: 0 }}>
            <label className="field-stack">
              <span className="field-label">Nom du cookie</span>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. analytics_consent"
              />
            </label>
            <label className="field-stack">
              <span className="field-label">Valeur attendue</span>
              <input
                className="field-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="ex. granted"
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
