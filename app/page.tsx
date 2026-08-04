"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  initialComponents,
  type AdoptionStatus,
  type ComponentRecord,
  type ComponentStatus,
  type ComponentType,
  type CompositionNode,
  type Platform,
  type SupportStatus,
} from "./component-data";
import { mergeImportedComponents, parseFigmaComponentExport } from "./figma-import";

const componentTypes: Array<ComponentType | "All types"> = [
  "All types", "Base", "Slot", "Module", "Page structure",
];
const designStatuses: Array<ComponentStatus | "All design statuses"> = [
  "All design statuses", "Proposed", "In design", "Ready", "Deprecated",
];
const supportStatuses: Array<SupportStatus | "All cross-platform statuses"> = [
  "All cross-platform statuses", "Full", "Partial", "None", "Planned",
];
const adoptionStatuses: Array<AdoptionStatus | "All statuses"> = [
  "All statuses", "Needs Jira ticket", "Backlog", "In dev", "In review", "Released", "Blocked", "Not supported",
];
const platformLabels: Record<Platform, string> = { web: "Web", ios: "iOS", android: "Android" };

const typeLabel: Record<ComponentType, string> = {
  Base: "Base", Slot: "Slot", Module: "Module", "Page structure": "Page structure",
};

const emptyComponent = (): ComponentRecord => ({
  id: crypto.randomUUID(),
  name: "",
  type: "Base",
  variants: [],
  status: "Proposed",
  support: "Planned",
  adoption: { web: "Needs Jira ticket", ios: "Needs Jira ticket", android: "Needs Jira ticket" },
  composedOf: [],
  composition: [],
  links: {},
  notes: "",
  updated: "Today",
});

function statusClass(value: string) {
  return value.toLowerCase().replaceAll(" ", "-");
}

function Status({ value, compact = false }: { value: string; compact?: boolean }) {
  return <span className={`status ${statusClass(value)} ${compact ? "compact" : ""}`}>{value}</span>;
}

function walkIds(nodes: CompositionNode[] = []): string[] {
  return nodes.flatMap((node) => [node.componentId ?? "", ...walkIds(node.children)]).filter(Boolean);
}

function dependencyText(nodes: CompositionNode[] = []): string {
  return nodes.flatMap((node) => [node.name, node.variant ?? "", dependencyText(node.children)]).join(" ").toLowerCase();
}

function jiraLinks(value: ComponentRecord["links"]["jira"] | string): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

export default function Home() {
  const [components, setComponents] = useState<ComponentRecord[]>(initialComponents);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof componentTypes)[number]>("All types");
  const [designFilter, setDesignFilter] = useState<(typeof designStatuses)[number]>("All design statuses");
  const [supportFilter, setSupportFilter] = useState<(typeof supportStatuses)[number]>("All cross-platform statuses");
  const [platformFilters, setPlatformFilters] = useState<Record<Platform, (typeof adoptionStatuses)[number]>>({
    web: "All statuses", ios: "All statuses", android: "All statuses",
  });
  const [detailTrail, setDetailTrail] = useState<string[]>([]);
  const [editing, setEditing] = useState<ComponentRecord | null>(null);
  const [importNotice, setImportNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("maple-components-v3");
    if (stored) {
      try { setComponents(JSON.parse(stored)); }
      catch { window.localStorage.removeItem("maple-components-v3"); }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("maple-components-v3", JSON.stringify(components));
  }, [components, hydrated]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (editing) setEditing(null);
        else setDetailTrail([]);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editing]);

  const highLevelMatches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return components.filter((component) => {
      const matchesQuery = !term || component.name.toLowerCase().includes(term) ||
        component.variants.some((variant) => variant.toLowerCase().includes(term)) ||
        dependencyText(component.composition).includes(term);
      return matchesQuery &&
        (typeFilter === "All types" || component.type === typeFilter) &&
        (designFilter === "All design statuses" || component.status === designFilter) &&
        (supportFilter === "All cross-platform statuses" || component.support === supportFilter);
    });
  }, [components, query, typeFilter, designFilter, supportFilter]);

  const filtered = useMemo(() => highLevelMatches.filter((component) =>
    (platformFilters.web === "All statuses" || component.adoption.web === platformFilters.web) &&
    (platformFilters.ios === "All statuses" || component.adoption.ios === platformFilters.ios) &&
    (platformFilters.android === "All statuses" || component.adoption.android === platformFilters.android)
  ), [highLevelMatches, platformFilters]);

  const selectedComponent = components.find((component) => component.id === detailTrail.at(-1));
  const activeHighLevel = [typeFilter !== "All types", designFilter !== "All design statuses", supportFilter !== "All cross-platform statuses", Boolean(query)].filter(Boolean).length;
  const activePlatform = Object.values(platformFilters).filter((value) => value !== "All statuses").length;
  const needsPlanning = components.filter((component) => Object.values(component.adoption).includes("Needs Jira ticket")).length;
  const inDelivery = components.filter((component) => Object.values(component.adoption).some((value) => value === "In dev" || value === "In review")).length;
  const blocked = components.filter((component) => Object.values(component.adoption).includes("Blocked")).length;
  const ready = components.filter((component) => component.status === "Ready").length;

  const usedBy = useMemo(() => {
    if (!selectedComponent) return [];
    return components.filter((component) => walkIds(component.composition).includes(selectedComponent.id));
  }, [components, selectedComponent]);

  function openDetails(id: string, reset = false) {
    if (!components.some((component) => component.id === id)) return;
    setDetailTrail((current) => reset ? [id] : [...current.filter((item) => item !== id), id]);
  }

  function saveComponent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing?.name.trim()) return;
    const updated = { ...editing, name: editing.name.trim(), updated: "Today" };
    setComponents((current) => current.some((component) => component.id === updated.id)
      ? current.map((component) => component.id === updated.id ? updated : component)
      : [updated, ...current]);
    setEditing(null);
  }

  async function importFigmaJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const imported = parseFigmaComponentExport(JSON.parse(await file.text()));
      const result = mergeImportedComponents(components, imported);
      setComponents(result.components);
      setImportNotice({
        tone: "success",
        message: `${file.name}: ${result.added} component${result.added === 1 ? "" : "s"} added and ${result.updated} updated. Existing workflow statuses and manually entered resource links were preserved.`,
      });
    } catch (error) {
      setImportNotice({ tone: "error", message: error instanceof Error ? error.message : "This JSON file could not be imported." });
    }
  }

  function clearAllFilters() {
    setQuery("");
    setTypeFilter("All types");
    setDesignFilter("All design statuses");
    setSupportFilter("All cross-platform statuses");
    setPlatformFilters({ web: "All statuses", ios: "All statuses", android: "All statuses" });
  }

  return (
    <main>
      <header className="app-header">
        <a href="#top" className="brand" aria-label="Maple component tracker home">
          <span className="brand-mark">M</span>
          <span>Maple</span>
          <span className="brand-product">AP News design system</span>
        </a>
        <div className="header-actions">
          <span className="prototype-state"><i /> Firebase-ready prototype</span>
          <input ref={importInput} className="sr-only" type="file" accept="application/json,.json" onChange={importFigmaJson} />
          <button className="button secondary import-button" onClick={() => importInput.current?.click()}><span className="import-wide">Import Figma JSON</span><span className="import-short">Import JSON</span></button>
          <button className="button primary" onClick={() => setEditing(emptyComponent())}>＋ Add component</button>
        </div>
      </header>

      <div className="shell" id="top">
        {importNotice && <div className={`import-notice ${importNotice.tone}`} role={importNotice.tone === "error" ? "alert" : "status"}><span>{importNotice.message}</span><button onClick={() => setImportNotice(null)} aria-label="Dismiss import message">×</button></div>}
        <section className="page-intro">
          <div>
            <h1>Component tracker</h1>
            <p>Review design readiness and platform delivery gaps across the Maple system.</p>
          </div>
          <span className="last-updated">Data updated Jul 31</span>
        </section>

        <section className="summary" aria-label="Inventory summary">
          <article><span>Needs planning</span><strong>{needsPlanning}</strong><small>Missing Jira ticket</small></article>
          <article><span>In delivery</span><strong>{inDelivery}</strong><small>Development or review</small></article>
          <article><span>Blocked</span><strong>{blocked}</strong><small>Across any platform</small></article>
          <article><span>Design ready</span><strong>{ready}</strong><small>Ready for implementation</small></article>
        </section>

        <section className="filter-card" aria-label="System filters">
          <div className="filter-card-heading">
            <div><span>1</span><div><strong>Set the system scope</strong><small>These filters define the initial result set.</small></div></div>
            {activeHighLevel > 0 && <button onClick={clearAllFilters}>Clear all</button>}
          </div>
          <div className="primary-filters">
            <label className="search-field">
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Component or dependency" />
            </label>
            <Filter label="Type" value={typeFilter} options={componentTypes} onChange={(value) => setTypeFilter(value as typeof typeFilter)} />
            <Filter label="Design status" value={designFilter} options={designStatuses} onChange={(value) => setDesignFilter(value as typeof designFilter)} />
            <Filter label="Cross-platform" value={supportFilter} options={supportStatuses} onChange={(value) => setSupportFilter(value as typeof supportFilter)} />
          </div>
        </section>

        <section className="inventory-card">
          <div className="platform-filter-row">
            <div className="platform-filter-heading"><span>2</span><div><strong>Refine by platform</strong><small>Applied to {highLevelMatches.length} system-level matches</small></div></div>
            <div className="platform-filters">
              {(["web", "ios", "android"] as Platform[]).map((platform) => (
                <Filter
                  key={platform}
                  label={platformLabels[platform]}
                  value={platformFilters[platform]}
                  options={adoptionStatuses}
                  onChange={(value) => setPlatformFilters((current) => ({ ...current, [platform]: value as (typeof adoptionStatuses)[number] }))}
                  compact
                />
              ))}
            </div>
          </div>

          <div className="table-heading">
            <div><h2>Components</h2><span>{filtered.length} shown{activePlatform ? ` · ${activePlatform} platform filter${activePlatform > 1 ? "s" : ""}` : ""}</span></div>
            <span>Select a component to review its details and dependencies.</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Component</th><th>Type</th><th>Design</th><th>Cross-platform</th><th>Web</th><th>iOS</th><th>Android</th><th><span className="sr-only">View</span></th>
              </tr></thead>
              <tbody>
                {filtered.map((component) => (
                  <tr key={component.id}>
                    <td><button className="component-link" onClick={() => openDetails(component.id, true)}><strong>{component.name}</strong><small>{component.variants.slice(0, 2).join(" · ") || "No variants"}</small></button></td>
                    <td><span className={`type-label type-${component.type.toLowerCase().replace(" ", "-")}`}>{typeLabel[component.type]}</span></td>
                    <td><Status value={component.status} /></td>
                    <td><Status value={component.support} /></td>
                    <td><Status value={component.adoption.web} compact /></td>
                    <td><Status value={component.adoption.ios} compact /></td>
                    <td><Status value={component.adoption.android} compact /></td>
                    <td><button className="row-open" onClick={() => openDetails(component.id, true)} aria-label={`View ${component.name}`}>→</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <div className="empty"><strong>No matching components</strong><span>Try removing a platform refinement or broadening the system scope.</span><button onClick={clearAllFilters}>Clear filters</button></div>}
          </div>
        </section>
      </div>

      {selectedComponent && (
        <DetailDrawer
          component={selectedComponent}
          components={components}
          usedBy={usedBy}
          canGoBack={detailTrail.length > 1}
          onBack={() => setDetailTrail((current) => current.slice(0, -1))}
          onClose={() => setDetailTrail([])}
          onSelect={openDetails}
          onEdit={() => setEditing({ ...selectedComponent })}
        />
      )}

      {editing && <Editor component={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={saveComponent} />}
    </main>
  );
}

function Filter({ label, value, options, onChange, compact = false }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return <label className={`filter ${compact ? "compact-filter" : ""}`}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function DetailDrawer({ component, components, usedBy, canGoBack, onBack, onClose, onSelect, onEdit }: {
  component: ComponentRecord;
  components: ComponentRecord[];
  usedBy: ComponentRecord[];
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: () => void;
}) {
  const componentMap = new Map(components.map((item) => [item.id, item]));
  return <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="drawer-nav"><button onClick={onBack} disabled={!canGoBack} aria-label="Back">←</button><span>Component details</span><button onClick={onClose} aria-label="Close">×</button></div>
      <div className="drawer-header">
        <div><span className={`type-label type-${component.type.toLowerCase().replace(" ", "-")}`}>{typeLabel[component.type]}</span><h2 id="drawer-title">{component.name}</h2></div>
        <button className="button secondary" onClick={onEdit}>Edit</button>
      </div>
      <p className="drawer-description">{component.notes || "No notes added."}</p>

      <section className="detail-section">
        <h3>Current status</h3>
        <div className="status-grid">
          <div><span>Design</span><Status value={component.status} /></div>
          <div><span>Cross-platform</span><Status value={component.support} /></div>
          <div><span>Web</span><Status value={component.adoption.web} /></div>
          <div><span>iOS</span><Status value={component.adoption.ios} /></div>
          <div><span>Android</span><Status value={component.adoption.android} /></div>
        </div>
      </section>

      <section className="detail-section">
        <div className="section-heading"><h3>Uses</h3><span>{component.composition?.length ?? 0} direct dependencies</span></div>
        {component.composition?.length ? <div className="dependency-tree">{component.composition.map((node, index) => <Dependency key={`${node.name}-${index}`} node={node} componentMap={componentMap} onSelect={onSelect} depth={0} />)}</div> : <p className="quiet-empty">No tracked dependencies. This is a foundational component.</p>}
      </section>

      <section className="detail-section">
        <div className="section-heading"><h3>Used by</h3><span>{usedBy.length} components</span></div>
        {usedBy.length ? <div className="used-by-list">{usedBy.map((parent) => <button key={parent.id} onClick={() => onSelect(parent.id)}><span className={`type-dot dot-${parent.type.toLowerCase().replace(" ", "-")}`} /> <strong>{parent.name}</strong><small>{typeLabel[parent.type]}</small><i>→</i></button>)}</div> : <p className="quiet-empty">No tracked components currently reference this item.</p>}
      </section>

      <section className="detail-section detail-meta">
        <div><span>Variants</span><p>{component.variants.join(" · ") || "None"}</p></div>
        <div><span>Figma page</span><p>{component.source?.page ?? "Not linked"}</p></div>
        <div><span>Updated</span><p>{component.updated}</p></div>
      </section>
      <section className="detail-section resources-section">
        <div className="section-heading"><h3>Resources</h3><span>{[component.links.figma, component.links.zeroheight, component.links.prototype, ...jiraLinks(component.links.jira as ComponentRecord["links"]["jira"] | string)].filter(Boolean).length} links</span></div>
        <div className="resource-list">
          {component.links.figma && <ResourceLink label="Figma" detail="Design source" href={component.links.figma} />}
          {component.links.zeroheight && <ResourceLink label="Zeroheight" detail="Documentation" href={component.links.zeroheight} />}
          {component.links.prototype && <ResourceLink label="Prototype" detail="Interactive reference" href={component.links.prototype} />}
          {jiraLinks(component.links.jira as ComponentRecord["links"]["jira"] | string).map((href, index) => <ResourceLink key={`${href}-${index}`} label={`Jira${jiraLinks(component.links.jira as ComponentRecord["links"]["jira"] | string).length > 1 ? ` ${index + 1}` : ""}`} detail="Work item" href={href} />)}
          {![component.links.figma, component.links.zeroheight, component.links.prototype, ...jiraLinks(component.links.jira as ComponentRecord["links"]["jira"] | string)].some(Boolean) && <p className="quiet-empty">No resources have been added yet. Select Edit to add links.</p>}
        </div>
      </section>
    </aside>
  </div>;
}

function ResourceLink({ label, detail, href }: { label: string; detail: string; href: string }) {
  return <a href={href} target="_blank" rel="noreferrer"><span><strong>{label}</strong><small>{detail}</small></span><i>↗</i></a>;
}

function Dependency({ node, componentMap, onSelect, depth }: {
  node: CompositionNode;
  componentMap: Map<string, ComponentRecord>;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const target = node.componentId ? componentMap.get(node.componentId) : undefined;
  const content = <><span className={`type-dot dot-${node.kind.toLowerCase().replace(" ", "-")}`} /><span><strong>{node.name}</strong><small>{node.variant ?? node.kind}</small></span>{node.count && <em>×{node.count}</em>}{target && <i>→</i>}</>;
  return <div className="dependency" style={{ "--depth": depth } as React.CSSProperties}>
    {target ? <button onClick={() => onSelect(target.id)}>{content}</button> : <div className="dependency-context">{content}</div>}
    {node.children?.map((child, index) => <Dependency key={`${child.name}-${index}`} node={child} componentMap={componentMap} onSelect={onSelect} depth={depth + 1} />)}
  </div>;
}

function Editor({ component, onChange, onCancel, onSave }: {
  component: ComponentRecord;
  onChange: (component: ComponentRecord) => void;
  onCancel: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
    <section className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="editor-header"><div><span>Component record</span><h2 id="editor-title">{component.name ? `Edit ${component.name}` : "Add component"}</h2></div><button onClick={onCancel} aria-label="Close">×</button></div>
      <form onSubmit={onSave}>
        <div className="form-grid">
          <label className="wide">Name<input required autoFocus value={component.name} onChange={(event) => onChange({ ...component, name: event.target.value })} /></label>
          <label>Type<select value={component.type} onChange={(event) => onChange({ ...component, type: event.target.value as ComponentType })}>{componentTypes.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Design status<select value={component.status} onChange={(event) => onChange({ ...component, status: event.target.value as ComponentStatus })}>{designStatuses.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="wide">Cross-platform status<select value={component.support} onChange={(event) => onChange({ ...component, support: event.target.value as SupportStatus })}>{supportStatuses.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
          {(["web", "ios", "android"] as Platform[]).map((platform) => <label key={platform}>{platformLabels[platform]}<select value={component.adoption[platform]} onChange={(event) => onChange({ ...component, adoption: { ...component.adoption, [platform]: event.target.value as AdoptionStatus } })}>{adoptionStatuses.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>)}
          <label className="wide">Variants <small>Comma separated</small><input value={component.variants.join(", ")} onChange={(event) => onChange({ ...component, variants: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
          <label className="wide">Notes<textarea rows={4} value={component.notes} onChange={(event) => onChange({ ...component, notes: event.target.value })} /></label>
          <label>Figma URL<input type="url" value={component.links.figma ?? ""} onChange={(event) => onChange({ ...component, links: { ...component.links, figma: event.target.value } })} placeholder="https://figma.com/..." /></label>
          <label>Zeroheight URL<input type="url" value={component.links.zeroheight ?? ""} onChange={(event) => onChange({ ...component, links: { ...component.links, zeroheight: event.target.value } })} placeholder="https://zeroheight.com/..." /></label>
          <label className="wide">Prototype URL<input type="url" value={component.links.prototype ?? ""} onChange={(event) => onChange({ ...component, links: { ...component.links, prototype: event.target.value } })} placeholder="https://..." /></label>
          <label className="wide">Jira URLs <small>One link per line</small><textarea rows={3} value={jiraLinks(component.links.jira as ComponentRecord["links"]["jira"] | string).join("\n")} onChange={(event) => onChange({ ...component, links: { ...component.links, jira: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) } })} placeholder={"https://jira.../MAPLE-123\nhttps://jira.../MAPLE-456"} /></label>
        </div>
        <div className="editor-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button primary">Save changes</button></div>
      </form>
    </section>
  </div>;
}
