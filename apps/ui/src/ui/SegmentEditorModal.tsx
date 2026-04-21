import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  SEGMENT_ID_MAX,
  SEGMENT_ID_MIN,
  type SegmentCondition,
  type SegmentRule,
} from "@abtest-solution/core";
import { API_BASE } from "../apiBase";
import type { SegmentListRow } from "@/lib/segmentSort";
import {
  RULE_PALETTE_GROUPS,
  SEGMENT_EDITOR_DND_MIME,
  SEGMENT_EDITOR_DND_MIME_FALLBACK,
  addChildGroup,
  appendToContainer as appendChild,
  cloneCondition,
  createDefaultLeaf as mkLeaf,
  defaultRootCondition as emptyRoot,
  normalizeRootForEditor as normRoot,
  pathsEqual as pathEq,
  removeNodeAtPath as rmAt,
  replaceNodeAtPath as setAt,
  setGroupKindAtPath as setGroupKind,
  unwrapNotAtPath as unwrapNot,
  wrapInNotAtPath as wrapNot,
  type Path,
  type RulePaletteKind,
  type SegmentEditorDndPayload,
} from "@/lib/segmentEditorModel";
import { LeafRuleForm } from "./SegmentEditorLeafForm";
import {
  SegmentConditionTree,
  endSegmentDrag,
} from "./SegmentConditionTree";

function startSegmentPaletteDrag(
  ev: DragEvent,
  kind: RulePaletteKind,
  submitting: boolean,
  setSegmentDndActive: (v: boolean) => void,
): void {
  if (submitting) return;
  ev.stopPropagation();
  setSegmentDndActive(true);
  const payload: SegmentEditorDndPayload = { source: "palette", kind };
  const json = JSON.stringify(payload);
  ev.dataTransfer.setData(SEGMENT_EDITOR_DND_MIME, json);
  ev.dataTransfer.setData(SEGMENT_EDITOR_DND_MIME_FALLBACK, json);
  ev.dataTransfer.effectAllowed = "copy";
}

async function readApiError(res: Response): Promise<string> {
  let msg = `Erreur HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.trim()) {
      msg = body.error.trim();
    }
  } catch {
    /* ignore */
  }
  return msg;
}

type Props = {
  open: boolean;
  mode: "create" | "edit";
  segmentId: number | null;
  segments: SegmentListRow[];
  onClose: () => void;
  onSaved: () => void;
};

function portalDocument(node: ReactNode): ReactNode {
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function suggestNextSegmentId(usedIds: number[]): number | null {
  const used = new Set(usedIds);
  for (let id = SEGMENT_ID_MIN; id <= SEGMENT_ID_MAX; id++) {
    if (!used.has(id)) return id;
  }
  return null;
}

export function SegmentEditorModal({
  open,
  mode,
  segmentId,
  segments,
  onClose,
  onSaved,
}: Props) {
  const wasOpen = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [idStr, setIdStr] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState<SegmentCondition>(emptyRoot());
  const [insertTargetPath, setInsertTargetPath] = useState<Path>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rulesView, setRulesView] = useState<"visual" | "json">("visual");
  const [dndHoverKey, setDndHoverKey] = useState<string | null>(null);
  const [segmentDndActive, setSegmentDndActive] = useState(false);

  const draftJson = useMemo(() => {
    const idNum = Number(idStr.trim());
    const idOk =
      Number.isInteger(idNum) &&
      idNum >= SEGMENT_ID_MIN &&
      idNum <= SEGMENT_ID_MAX;
    const o: Record<string, unknown> = {
      id: idOk ? idNum : idStr.trim() || null,
      name: name.trim() || "",
      condition: cloneCondition(condition),
    };
    if (description.trim()) o.description = description.trim();
    return JSON.stringify(o, null, 2);
  }, [idStr, name, description, condition]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoadError(null);
      setError(null);
      setSubmitting(false);
      if (mode === "create") {
        const nextId = suggestNextSegmentId(segments.map((s) => s.id));
        setIdStr(nextId != null ? String(nextId) : "");
        setName("");
        setDescription("");
        setCondition(emptyRoot());
        setInsertTargetPath([]);
        requestAnimationFrame(() => {
          nameInputRef.current?.focus();
        });
        return;
      }
      if (segmentId == null) return;
      try {
        const res = await fetch(`${API_BASE}/api/segments/${segmentId}`);
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }
        const data = (await res.json()) as {
          id: number;
          name: string;
          description?: string;
          condition: SegmentCondition;
        };
        if (cancelled) return;
        setIdStr(String(data.id));
        setName(data.name);
        setDescription(data.description ?? "");
        setCondition(normRoot(data.condition));
        setInsertTargetPath([]);
        requestAnimationFrame(() => {
          nameInputRef.current?.focus();
        });
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, mode, segmentId, segments]);

  useEffect(() => {
    if (open) setRulesView("visual");
  }, [open, mode, segmentId]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setError(null);
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  useEffect(() => {
    if (!open) return;
    function onDragEnd() {
      endSegmentDrag(setDndHoverKey, setSegmentDndActive);
    }
    document.addEventListener("dragend", onDragEnd, true);
    return () => document.removeEventListener("dragend", onDragEnd, true);
  }, [open]);

  useEffect(() => {
    if (!open) setSegmentDndActive(false);
  }, [open]);

  if (!open) return null;

  if (loadError) {
    return portalDocument(
      <div
        className="modal-overlay modal-overlay--document"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget && !submitting) onClose();
        }}
      >
        <div
          className="modal-panel modal-panel--create-campaign"
          role="dialog"
          aria-modal="true"
          aria-labelledby="segment-editor-error-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="segment-editor-error-title">Segment</h3>
          <p className="modal-create-campaign__lede muted text-small">
            Impossible de charger ce segment depuis l’API.
          </p>
          <p className="diag-error modal-create-campaign__error">{loadError}</p>
          <div className="modal-create-campaign__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>,
    );
  }

  function onRuleChange(path: Path, next: SegmentRule) {
    setCondition((c) => setAt(c, path, next));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const id = Number(idStr.trim());
    if (!Number.isInteger(id) || id < SEGMENT_ID_MIN || id > SEGMENT_ID_MAX) {
      setError(`Identifiant invalide (${SEGMENT_ID_MIN}–${SEGMENT_ID_MAX}).`);
      return;
    }
    if (!name.trim()) {
      setError("Le nom est requis.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        id,
        name: name.trim(),
        condition: cloneCondition(condition),
      };
      if (description.trim()) {
        payload.description = description.trim();
      }
      const url =
        mode === "create"
          ? `${API_BASE}/api/segments`
          : `${API_BASE}/api/segments/${id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const nextFree = suggestNextSegmentId(segments.map((s) => s.id));
  const noIdAvailable = mode === "create" && nextFree === null;

  return portalDocument(
    <div
      className="modal-overlay modal-overlay--document"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="modal-panel modal-panel--segment-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="segment-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={(e) => void handleSubmit(e)}>
          <h3 id="segment-editor-title">
            {mode === "create" ? "Nouveau segment" : "Modifier le segment"}
          </h3>
          <p className="modal-create-campaign__lede muted text-small">
            {mode === "create" ? (
              <>
                Un dossier de segment est créé dans le dépôt de configuration
                (<code className="code-inline">Segments/</code>
                ). Le nom lisible sert de base pour le nom du dossier sur disque,
                comme pour une campagne.
              </>
            ) : (
              <>
                Les changements sont enregistrés dans le fichier du segment.
                L’identifiant métier ne peut pas être modifié.
              </>
            )}
          </p>

          <div className="modal-create-campaign__field">
            <label className="modal-create-campaign__label" htmlFor="seg-name">
              Nom
            </label>
            <input
              ref={nameInputRef}
              id="seg-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Visiteurs France mobile"
              autoComplete="off"
              disabled={submitting}
            />
          </div>

          <div className="modal-create-campaign__field">
            <label className="modal-create-campaign__label" htmlFor="seg-id">
              Identifiant métier
            </label>
            <input
              id="seg-id"
              className="field-input"
              inputMode="numeric"
              value={idStr}
              onChange={(e) => setIdStr(e.target.value)}
              placeholder={`${SEGMENT_ID_MIN}–${SEGMENT_ID_MAX}`}
              disabled={submitting || mode === "edit" || noIdAvailable}
              aria-describedby="seg-id-hint"
            />
            <p id="seg-id-hint" className="modal-create-campaign__hint text-small">
              {mode === "edit"
                ? "L’identifiant est figé une fois le segment créé."
                : noIdAvailable
                  ? "Aucun identifiant libre dans la plage autorisée."
                  : `Valeur proposée : premier identifiant libre (${SEGMENT_ID_MIN}–${SEGMENT_ID_MAX}). Ajustez si nécessaire.`}
            </p>
          </div>

          <div className="modal-create-campaign__field">
            <label
              className="modal-create-campaign__label"
              htmlFor="seg-description"
            >
              Description
            </label>
            <input
              id="seg-description"
              className="field-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              placeholder="Optionnel — note pour l’équipe"
            />
            <p className="modal-create-campaign__hint text-small">
              Texte libre dans le fichier de configuration ; distinct des règles
              de ciblage ci-dessous.
            </p>
          </div>

          <fieldset className="modal-create-campaign__field segment-editor__rules-fieldset">
            <legend className="modal-create-campaign__label">
              Règles de ciblage
            </legend>
            <p className="modal-create-campaign__hint text-small segment-editor__rules-hint">
              Colonne de gauche : types de critères par famille (comme la doc
              « Types de segment »). Colonne de droite : arbre{" "}
              <strong>ET</strong> / <strong>OU</strong> / <strong>NON</strong>.
              L’interrupteur à côté du libellé <strong>ET</strong> /{" "}
              <strong>OU</strong> bascule entre les deux logiques (comme pour{" "}
              <strong>NON</strong>) ; l’interrupteur <strong>NON</strong> enveloppe
              ou retire la négation sur le groupe concerné.               Le bouton <strong>Insérer ici</strong> /{" "}
              <strong>✓ Insérer ici</strong> indique dans quel groupe du graphe
              les clics sur la liste de gauche sont ajoutés (surlignage). Vous
              pouvez aussi <strong>glisser-déposer</strong> : poignée{" "}
              <strong>⋮⋮</strong> ou le libellé du type, ou sur
              l’arbre pour déplacer un bloc ; déposez sur une ligne d’insertion ou
              l’en-tête du groupe (ajout en fin).
            </p>
            <div
              className="segment-editor__rules-tabs"
              role="tablist"
              aria-label="Affichage des règles"
            >
              <button
                type="button"
                role="tab"
                id="segment-rules-tab-visual"
                aria-selected={rulesView === "visual"}
                aria-controls="segment-rules-panel-visual"
                className={`segment-editor__rules-tab${rulesView === "visual" ? " is-active" : ""}`}
                onClick={() => setRulesView("visual")}
              >
                Éditeur
              </button>
              <button
                type="button"
                role="tab"
                id="segment-rules-tab-json"
                aria-selected={rulesView === "json"}
                aria-controls="segment-rules-panel-json"
                className={`segment-editor__rules-tab${rulesView === "json" ? " is-active" : ""}`}
                onClick={() => setRulesView("json")}
              >
                JSON
              </button>
            </div>
            {rulesView === "visual" ? (
              <div
                className="segment-editor__grid"
                id="segment-rules-panel-visual"
                role="tabpanel"
                aria-labelledby="segment-rules-tab-visual"
              >
                <div className="segment-editor__palette">
                  <p className="text-small muted segment-editor__palette-title">
                    Types de règles
                  </p>
                  {RULE_PALETTE_GROUPS.map((group) => (
                    <div
                      key={group.heading}
                      className="segment-editor__palette-group"
                    >
                      <p className="segment-editor__palette-group-title">
                        {group.heading}
                      </p>
                      <ul className="segment-editor__palette-list">
                        {group.items.map(({ kind, label }) => (
                          <li key={kind} className="segment-editor__palette-item">
                            <span
                              className="segment-editor__palette-drag"
                              draggable={!submitting}
                              title={`Glisser « ${label} » vers l’arbre`}
                              aria-label={`Glisser-déposer le type ${label}`}
                              onDragStart={(ev) =>
                                startSegmentPaletteDrag(
                                  ev,
                                  kind,
                                  submitting,
                                  setSegmentDndActive,
                                )
                              }
                              onDragEnd={() =>
                                endSegmentDrag(setDndHoverKey, setSegmentDndActive)
                              }
                            >
                              ⋮⋮
                            </span>
                            <button
                              type="button"
                              className="segment-editor__palette-btn"
                              disabled={submitting}
                              draggable={!submitting}
                              title={`${label} — cliquer pour insérer dans le groupe actif, ou glisser vers l’arbre`}
                              onDragStart={(ev) =>
                                startSegmentPaletteDrag(
                                  ev,
                                  kind,
                                  submitting,
                                  setSegmentDndActive,
                                )
                              }
                              onDragEnd={() =>
                                endSegmentDrag(setDndHoverKey, setSegmentDndActive)
                              }
                              onClick={() => {
                                const leaf = mkLeaf(kind);
                                setCondition((c) =>
                                  appendChild(c, insertTargetPath, leaf),
                                );
                              }}
                            >
                              {label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div
                  className={`segment-editor__tree${segmentDndActive ? " segment-editor__tree--dnd-active" : ""}`}
                >
                  <p className="text-small muted segment-editor__tree-title">
                    Arbre de conditions
                  </p>
                  <SegmentConditionTree
                    root={condition}
                    submitting={submitting}
                    insertTargetPath={insertTargetPath}
                    segmentDndActive={segmentDndActive}
                    dndHoverKey={dndHoverKey}
                    setCondition={setCondition}
                    setInsertTargetPath={setInsertTargetPath}
                    setDndHoverKey={setDndHoverKey}
                    setSegmentDndActive={setSegmentDndActive}
                    onRuleChange={onRuleChange}
                  />
                </div>
              </div>
            ) : (
              <div
                className="segment-editor__json-panel"
                id="segment-rules-panel-json"
                role="tabpanel"
                aria-labelledby="segment-rules-tab-json"
              >
                <p className="text-small muted segment-editor__json-lede">
                  Aperçu lecture seule du corps envoyé à l’API (identifiant, nom,
                  description optionnelle, condition).
                </p>
                <pre className="segment-editor__json-pre" tabIndex={0}>
                  {draftJson}
                </pre>
              </div>
            )}
          </fieldset>

          {error ? (
            <p className="diag-error modal-create-campaign__error">{error}</p>
          ) : null}

          <div className="modal-create-campaign__actions">
            <button
              type="button"
              className="ghost-button"
              disabled={submitting}
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || noIdAvailable || !name.trim()}
            >
              {submitting
                ? mode === "create"
                  ? "Création…"
                  : "Enregistrement…"
                : mode === "create"
                  ? "Créer le segment"
                  : "Enregistrer les modifications"}
            </button>
          </div>
        </form>
      </div>
    </div>,
  );
}
