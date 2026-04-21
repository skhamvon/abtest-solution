import {
  Fragment,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from "react";
import { summarizeOneRule, type SegmentCondition, type SegmentRule } from "@abtest-solution/core";
import {
  RULE_PALETTE,
  SEGMENT_EDITOR_DND_MIME,
  SEGMENT_EDITOR_DND_MIME_FALLBACK,
  addChildGroup,
  createDefaultLeaf as mkLeaf,
  insertChildAtIndex,
  moveSubtreeToIndex,
  pathsEqual as pathEq,
  removeNodeAtPath as rmAt,
  replaceNodeAtPath as setAt,
  setGroupKindAtPath as setGroupKind,
  unwrapNotAtPath as unwrapNot,
  wrapInNotAtPath as wrapNot,
  type Path,
  type RulePaletteKind,
  type SegmentEditorDndPayload,
  dataTransferHasSegmentEditorDnd,
  readSegmentEditorDndJson,
} from "@/lib/segmentEditorModel";
import { LeafRuleForm } from "./SegmentEditorLeafForm";

const PALETTE_KINDS = new Set<RulePaletteKind>(
  RULE_PALETTE.map((x) => x.kind),
);

function isPaletteKind(s: string): s is RulePaletteKind {
  return PALETTE_KINDS.has(s as RulePaletteKind);
}

function pathKey(p: Path): string {
  return p.length ? p.map((s) => (s === "n" ? "n" : String(s))).join("-") : "root";
}

function parseSegmentDndPayload(
  dataTransfer: DataTransfer,
): SegmentEditorDndPayload | null {
  const raw = readSegmentEditorDndJson(dataTransfer);
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (o.source === "palette" && typeof o.kind === "string" && isPaletteKind(o.kind))
      return { source: "palette", kind: o.kind };
    if (o.source === "tree" && Array.isArray(o.path)) {
      const path: Path = [];
      for (const x of o.path) {
        if (x === "n") path.push("n");
        else if (typeof x === "number" && Number.isInteger(x)) path.push(x);
        else return null;
      }
      return { source: "tree", path };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function treeNodeDraggable(path: Path, node: SegmentCondition): boolean {
  if (path.length === 0) return false;
  const last = path[path.length - 1];
  if (last === "n" && (node.type === "allOf" || node.type === "anyOf")) return false;
  return true;
}

export function endSegmentDrag(
  setDndHoverKey: Dispatch<SetStateAction<string | null>>,
  setSegmentDndActive: Dispatch<SetStateAction<boolean>>,
) {
  setDndHoverKey(null);
  setSegmentDndActive(false);
}

export type SegmentConditionTreeProps = {
  submitting: boolean;
  insertTargetPath: Path;
  segmentDndActive: boolean;
  dndHoverKey: string | null;
  setCondition: Dispatch<SetStateAction<SegmentCondition>>;
  setInsertTargetPath: Dispatch<SetStateAction<Path>>;
  setDndHoverKey: Dispatch<SetStateAction<string | null>>;
  setSegmentDndActive: Dispatch<SetStateAction<boolean>>;
  onRuleChange: (path: Path, next: SegmentRule) => void;
};

function applySegmentDrop(
  setCondition: Dispatch<SetStateAction<SegmentCondition>>,
  e: DragEvent,
  containerPath: Path,
  insertBefore: number,
) {
  e.preventDefault();
  e.stopPropagation();
  const payload = parseSegmentDndPayload(e.dataTransfer);
  if (!payload) return;
  if (payload.source === "palette") {
    setCondition((root) =>
      insertChildAtIndex(
        root,
        containerPath,
        mkLeaf(payload.kind),
        insertBefore,
      ),
    );
    return;
  }
  setCondition((root) =>
    moveSubtreeToIndex(root, payload.path, containerPath, insertBefore),
  );
}

function SegmentDropZone(
  props: SegmentConditionTreeProps & { containerPath: Path; insertBefore: number },
) {
  const {
    containerPath,
    insertBefore,
    setCondition,
    dndHoverKey,
    setDndHoverKey,
    setSegmentDndActive,
  } = props;
  const key = `${pathKey(containerPath)}:${insertBefore}`;
  return (
    <div
      key={key}
      className={`segment-editor__drop-zone${
        dndHoverKey === key ? " segment-editor__drop-zone--hover" : ""
      }`}
      onDragOver={(ev) => {
        if (!dataTransferHasSegmentEditorDnd(ev.dataTransfer)) return;
        ev.preventDefault();
        ev.stopPropagation();
        const ea = ev.dataTransfer.effectAllowed;
        ev.dataTransfer.dropEffect =
          ea === "copy" || ea === "copyMove" ? "copy" : "move";
        setDndHoverKey(key);
      }}
      onDragLeave={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
          setDndHoverKey((k) => (k === key ? null : k));
        }
      }}
      onDrop={(ev) => {
        setDndHoverKey(null);
        setSegmentDndActive(false);
        applySegmentDrop(setCondition, ev, containerPath, insertBefore);
      }}
    />
  );
}

function ConditionBlock(
  props: SegmentConditionTreeProps & {
    node: SegmentCondition;
    path: Path;
    depth: number;
  },
) {
  const {
    node,
    path,
    depth,
    submitting,
    insertTargetPath,
    segmentDndActive,
    dndHoverKey,
    setCondition,
    setInsertTargetPath,
    setDndHoverKey,
    setSegmentDndActive,
    onRuleChange,
  } = props;
  const directChildOfNot =
    path.length > 0 && path[path.length - 1] === "n";
  const pad = {
    marginLeft:
      depth === 0 || directChildOfNot
        ? 0
        : Math.min(depth * 12, 72),
  };
  const isTarget = pathEq(insertTargetPath, path);

  if (node.type === "allOf" || node.type === "anyOf") {
    const cls =
      node.type === "allOf"
        ? "condition-node condition-node--allOf"
        : "condition-node condition-node--anyOf";
    const isOu = node.type === "anyOf";
    const isNegated =
      path.length > 0 && path[path.length - 1] === "n";
    const canDrag = treeNodeDraggable(path, node);
    return (
      <div className={`${cls} condition-node--with-handle`} style={pad}>
        {canDrag ? (
          <button
            type="button"
            className="segment-editor__drag-handle"
            draggable={!submitting}
            title="Glisser-déposer pour déplacer ce groupe"
            aria-label="Déplacer ce groupe dans l’arbre"
            onClick={(e) => e.preventDefault()}
            onDragStart={(ev) => {
              if (submitting) return;
              ev.stopPropagation();
              setSegmentDndActive(true);
              const payload: SegmentEditorDndPayload = { source: "tree", path };
              ev.dataTransfer.setData(
                SEGMENT_EDITOR_DND_MIME,
                JSON.stringify(payload),
              );
              ev.dataTransfer.effectAllowed = "move";
            }}
          >
            ⋮⋮
          </button>
        ) : (
          <span
            className="segment-editor__drag-handle-spacer"
            aria-hidden
          />
        )}
        <div className="condition-node__column">
        <div
          className={`condition-node__header${isTarget ? " condition-node__header--active" : ""}${segmentDndActive ? " condition-node__header--drop-append-hint" : ""}`}
          onDragOver={(ev) => {
            if (!dataTransferHasSegmentEditorDnd(ev.dataTransfer)) return;
            ev.preventDefault();
            ev.stopPropagation();
            const ea = ev.dataTransfer.effectAllowed;
            ev.dataTransfer.dropEffect =
              ea === "copy" || ea === "copyMove" ? "copy" : "move";
          }}
          onDrop={(ev) => {
            setDndHoverKey(null);
            setSegmentDndActive(false);
            applySegmentDrop(setCondition, ev, path, node.conditions.length);
          }}
        >
          <div className="condition-node__header-row condition-node__header-row--primary">
            <div className="segment-editor__etou-wrap">
              <span
                className={`segment-editor__etou-wrap__label${isOu ? " is-ou" : " is-et"}`}
                id={`etou-label-${pathKey(path)}`}
              >
                {isOu ? "OU" : "ET"}
              </span>
              <button
                type="button"
                className="segment-editor__etou-switch"
                role="switch"
                aria-checked={isOu}
                aria-labelledby={`etou-label-${pathKey(path)}`}
                aria-label={
                  isOu
                    ? "Groupe OU (au moins une condition vraie). Cliquer pour passer en ET."
                    : "Groupe ET (toutes les conditions vraies). Cliquer pour passer en OU."
                }
                title={
                  isOu
                    ? "Passer en logique ET (toutes les sous-conditions vraies)"
                    : "Passer en logique OU (au moins une sous-condition vraie)"
                }
                onClick={() =>
                  setCondition((c) =>
                    isOu
                      ? setGroupKind(c, path, "allOf")
                      : setGroupKind(c, path, "anyOf"),
                  )
                }
              >
                <span className="segment-editor__etou-switch__track" aria-hidden>
                  <span
                    className="segment-editor__etou-switch__thumb"
                    data-on={isOu}
                  />
                </span>
              </button>
            </div>
            <div className="segment-editor__non-wrap">
              <span
                className={`segment-editor__non-wrap__label${isNegated ? " is-on" : ""}`}
                id={`non-label-${pathKey(path)}`}
              >
                NON
              </span>
              <button
                type="button"
                className="segment-editor__non-switch"
                role="switch"
                aria-checked={isNegated}
                aria-labelledby={`non-label-${pathKey(path)}`}
                title={
                  isNegated
                    ? "Retirer la négation sur ce groupe"
                    : "Inverser ce groupe (logique NON)"
                }
                onClick={() =>
                  setCondition((c) =>
                    isNegated
                      ? unwrapNot(c, path.slice(0, -1))
                      : wrapNot(c, path),
                  )
                }
              >
                <span className="segment-editor__non-switch__track" aria-hidden>
                  <span
                    className="segment-editor__non-switch__thumb"
                    data-on={isNegated}
                  />
                </span>
              </button>
            </div>
            <button
              type="button"
              className={`segment-editor__chip segment-editor__chip--target${isTarget ? " is-active" : ""}`}
              title="Les types choisis dans la colonne de gauche seront ajoutés dans ce groupe du graphe"
              onClick={() => setInsertTargetPath(path)}
            >
              {isTarget ? "✓ Insérer ici" : "Insérer ici"}
            </button>
          </div>
          <div className="condition-node__header-row condition-node__header-row--hint">
            <span className="text-small muted">
              Cible d’insertion — cliquez ou glissez un type depuis la liste de
              gauche, ou déposez sur une ligne d’insertion, pour l’ajouter au
              groupe surligné
            </span>
          </div>
          <div className="condition-node__toolbar">
            <button
              type="button"
              className="ghost-button text-small"
              title="Ajoute un sous-groupe ET (toutes les conditions vraies). Pour du OU, utilisez l’interrupteur ET / OU sur ce sous-groupe."
              onClick={() => setCondition((c) => addChildGroup(c, path, "allOf"))}
            >
              + sous-groupe
            </button>
            {path.length > 0 ? (
              <button
                type="button"
                className="ghost-button text-small"
                onClick={() => setCondition((c) => rmAt(c, path))}
              >
                Supprimer ce nœud
              </button>
            ) : null}
          </div>
        </div>
        <div
          className={`condition-node__children${
            node.conditions.length === 0
              ? " condition-node__children--empty"
              : ""
          }`}
        >
          {<SegmentDropZone
            setCondition={setCondition}
            dndHoverKey={dndHoverKey}
            setDndHoverKey={setDndHoverKey}
            setSegmentDndActive={setSegmentDndActive}
            containerPath={path}
            insertBefore={0}
          />}
          {node.conditions.length === 0 ? (
            <p className="text-small muted segment-editor__empty-children-hint">
              Aucune sous-condition.
            </p>
          ) : null}
          {node.conditions.map((ch, i) => (
            <Fragment key={pathKey([...path, i])}>
              <ConditionBlock
                submitting={submitting}
                insertTargetPath={insertTargetPath}
                segmentDndActive={segmentDndActive}
                dndHoverKey={dndHoverKey}
                setCondition={setCondition}
                setInsertTargetPath={setInsertTargetPath}
                setDndHoverKey={setDndHoverKey}
                setSegmentDndActive={setSegmentDndActive}
                onRuleChange={onRuleChange}
                node={ch}
                path={[...path, i]}
                depth={depth + 1}
              />
              {<SegmentDropZone
                setCondition={setCondition}
                dndHoverKey={dndHoverKey}
                setDndHoverKey={setDndHoverKey}
                setSegmentDndActive={setSegmentDndActive}
                containerPath={path}
                insertBefore={i + 1}
              />}
            </Fragment>
          ))}
        </div>
        </div>
      </div>
    );
  }

  if (node.type === "not") {
    const inner = node.condition;
    const innerIsEtOuGroup =
      inner.type === "allOf" || inner.type === "anyOf";
    return (
      <div
        className={`condition-node condition-node--not${isTarget ? " condition-node--not--target" : ""}`}
        style={pad}
      >
        {path.length > 0 && !innerIsEtOuGroup ? (
          <div className="condition-node__header condition-node__header--not-toolbar">
            <button
              type="button"
              className="ghost-button text-small"
              onClick={() => setCondition((c) => rmAt(c, path))}
            >
              Supprimer
            </button>
          </div>
        ) : null}
        <div className="condition-node__not-body">
          <ConditionBlock
            submitting={submitting}
            insertTargetPath={insertTargetPath}
            segmentDndActive={segmentDndActive}
            dndHoverKey={dndHoverKey}
            setCondition={setCondition}
            setInsertTargetPath={setInsertTargetPath}
            setDndHoverKey={setDndHoverKey}
            setSegmentDndActive={setSegmentDndActive}
            onRuleChange={onRuleChange}
            node={node.condition}
            path={[...path, "n"]}
            depth={depth + 1}
          />
        </div>
      </div>
    );
  }

  const rule = node;
  const canDragLeaf = treeNodeDraggable(path, node);
  return (
    <div
      className="condition-node condition-node--leaf condition-node--with-handle"
      style={pad}
    >
      {canDragLeaf ? (
        <button
          type="button"
          className="segment-editor__drag-handle"
          draggable={!submitting}
          title="Glisser-déposer pour déplacer cette règle"
          aria-label="Déplacer cette règle dans l’arbre"
          onClick={(e) => e.preventDefault()}
          onDragStart={(ev) => {
            if (submitting) return;
            ev.stopPropagation();
            setSegmentDndActive(true);
            const payload: SegmentEditorDndPayload = { source: "tree", path };
            const json = JSON.stringify(payload);
            ev.dataTransfer.setData(SEGMENT_EDITOR_DND_MIME, json);
            ev.dataTransfer.setData(SEGMENT_EDITOR_DND_MIME_FALLBACK, json);
            ev.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() =>
            endSegmentDrag(setDndHoverKey, setSegmentDndActive)
          }
        >
          ⋮⋮
        </button>
      ) : (
        <span className="segment-editor__drag-handle-spacer" aria-hidden />
      )}
      <div className="condition-node__column">
        <div className="condition-node__leaf-head">
          <strong className="text-small">{summarizeOneRule(rule)}</strong>
          <button
            type="button"
            className="ghost-button text-small"
            onClick={() => setCondition((c) => rmAt(c, path))}
          >
            Supprimer
          </button>
        </div>
        <LeafRuleForm rule={rule} path={path} onChange={onRuleChange} />
      </div>
    </div>
  );
}


export function SegmentConditionTree(
  props: SegmentConditionTreeProps & { root: SegmentCondition },
) {
  const { root, ...rest } = props;
  return <ConditionBlock {...rest} node={root} path={[]} depth={0} />;
}
