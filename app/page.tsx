"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, writeBatch } from "firebase/firestore";
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
import { mergeImportedComponents, parseFigmaComponentExportText } from "./figma-import";
import { allowedEmailDomain, firebaseConfigured, getFirebaseServices } from "./firebase";

const componentTypes: Array<ComponentType | "All types"> = [
  "All types", "Base", "Slot", "Module", "Page structure",
];
const designStatuses: Array<ComponentStatus | "All design statuses"> = [
  "All design statuses", "Proposed", "In design", "Ready", "Deprecated",
];
const supportStatuses: Array<SupportStatus | "All platform scopes"> = [
  "All platform scopes", "Full", "Partial", "Planned",
];
const adoptionStatuses: Array<AdoptionStatus | "All statuses"> = [
  "All statuses", "Needs Jira ticket", "Backlog", "In dev", "In review", "Released", "Blocked", "Not supported",
];
const platformLabels: Record<Platform, string> = { web: "Web", ios: "iOS", android: "Android" };
type ColumnFilterKey = "type" | "design" | "support" | Platform;
type OpenColumnFilter = { key: ColumnFilterKey; top: number; left: number };
type PendingImport = { fileName: string; components: ComponentRecord[]; preserveManualRelationships: boolean };

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
  currentVersion: "1.0",
  releaseHistory: [],
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

function normalizeComponent(record: ComponentRecord): ComponentRecord {
  const legacy = record as ComponentRecord & { targetVersion?: string; versionHistory?: Array<{ version?: string }> };
  const currentVersion = record.currentVersion?.trim() || legacy.targetVersion?.trim() || "1.0";
  const adoption = record.adoption ?? { web: "Needs Jira ticket", ios: "Needs Jira ticket", android: "Needs Jira ticket" };
  const releaseHistory = record.releaseHistory ?? legacy.versionHistory?.map((version) => version.version ?? "").filter(Boolean) ?? [];
  return {
    ...record,
    support: (record.support as string) === "None" ? "Planned" : (record.support ?? "Planned"),
    adoption,
    currentVersion,
    releaseHistory: [...new Set(releaseHistory.filter((version) => version !== currentVersion))],
  };
}

function relationshipNode(component: ComponentRecord): CompositionNode {
  return { name: component.name, kind: component.type, componentId: component.id, figmaNodeId: component.source?.nodeId };
}

function reconcileDirectRelationships(nodes: CompositionNode[], selectedIds: string[], components: ComponentRecord[]): CompositionNode[] {
  const selected = new Set(selectedIds);
  const retained = nodes.filter((node) => !node.componentId || selected.has(node.componentId));
  const retainedIds = new Set(retained.map((node) => node.componentId).filter(Boolean));
  return [
    ...retained,
    ...components.filter((component) => selected.has(component.id) && !retainedIds.has(component.id)).map(relationshipNode),
  ];
}

function removeRelationship(nodes: CompositionNode[] = [], componentId: string): CompositionNode[] {
  return nodes.filter((node) => node.componentId !== componentId).map((node) => ({
    ...node,
    children: node.children ? removeRelationship(node.children, componentId) : undefined,
  }));
}

function refreshRelationship(nodes: CompositionNode[] = [], component: ComponentRecord): CompositionNode[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.componentId === component.id ? { name: component.name, kind: component.type } : {}),
    children: node.children ? refreshRelationship(node.children, component) : undefined,
  }));
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export default function Home() {
  const [components, setComponents] = useState<ComponentRecord[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof componentTypes)[number]>("All types");
  const [designFilter, setDesignFilter] = useState<(typeof designStatuses)[number]>("All design statuses");
  const [supportFilter, setSupportFilter] = useState<(typeof supportStatuses)[number]>("All platform scopes");
  const [platformFilters, setPlatformFilters] = useState<Record<Platform, (typeof adoptionStatuses)[number]>>({
    web: "All statuses", ios: "All statuses", android: "All statuses",
  });
  const [detailTrail, setDetailTrail] = useState<string[]>([]);
  const [editing, setEditing] = useState<ComponentRecord | null>(null);
  const [openColumnFilter, setOpenColumnFilter] = useState<OpenColumnFilter | null>(null);
  const [importNotice, setImportNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthReady(true);
      return;
    }
    const { auth } = getFirebaseServices();
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    setComponents([]);
    setIsEditor(false);
    setDataReady(!user);
    if (!user) return;

    const emailDomain = user.email?.split("@").at(-1)?.toLowerCase();
    if (emailDomain !== allowedEmailDomain.toLowerCase()) {
      setImportNotice({ tone: "error", message: `Use an @${allowedEmailDomain} account to access the component tracker.` });
      void signOut(getFirebaseServices().auth);
      return;
    }

    const { db } = getFirebaseServices();
    const stopEditor = onSnapshot(doc(db, "editors", user.uid),
      (snapshot) => setIsEditor(snapshot.exists()),
      () => setIsEditor(false),
    );
    const stopComponents = onSnapshot(collection(db, "components"), (snapshot) => {
      const records = snapshot.docs.map((item) => normalizeComponent(item.data() as ComponentRecord));
      setComponents(records.sort((a, b) => a.name.localeCompare(b.name)));
      setDataReady(true);
    }, (error) => {
      setDataReady(true);
      setImportNotice({ tone: "error", message: error.code === "permission-denied" ? "Your account does not currently have access to the component inventory." : "The component inventory could not be loaded." });
    });
    return () => { stopEditor(); stopComponents(); };
  }, [user]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (openColumnFilter) setOpenColumnFilter(null);
        else if (pendingImport) setPendingImport(null);
        else if (editing) setEditing(null);
        else setDetailTrail([]);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editing, openColumnFilter, pendingImport]);

  useEffect(() => {
    if (!openColumnFilter) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".column-filter-trigger") && !target.closest(".column-filter-popover")) setOpenColumnFilter(null);
    };
    const closeOnViewportChange = () => setOpenColumnFilter(null);
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [openColumnFilter]);

  const highLevelMatches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return components.filter((component) => {
      const matchesQuery = !term || component.name.toLowerCase().includes(term) ||
        component.variants.some((variant) => variant.toLowerCase().includes(term)) ||
        dependencyText(component.composition).includes(term);
      return matchesQuery &&
        (typeFilter === "All types" || component.type === typeFilter) &&
        (designFilter === "All design statuses" || component.status === designFilter) &&
        (supportFilter === "All platform scopes" || component.support === supportFilter);
    });
  }, [components, query, typeFilter, designFilter, supportFilter]);

  const filtered = useMemo(() => highLevelMatches.filter((component) =>
    (platformFilters.web === "All statuses" || component.adoption.web === platformFilters.web) &&
    (platformFilters.ios === "All statuses" || component.adoption.ios === platformFilters.ios) &&
    (platformFilters.android === "All statuses" || component.adoption.android === platformFilters.android)
  ), [highLevelMatches, platformFilters]);

  const selectedComponent = components.find((component) => component.id === detailTrail.at(-1));
  const activeHighLevel = [typeFilter !== "All types", designFilter !== "All design statuses", supportFilter !== "All platform scopes", Boolean(query)].filter(Boolean).length;
  const activePlatform = Object.values(platformFilters).filter((value) => value !== "All statuses").length;
  const activeFacetCount = activeHighLevel + activePlatform - (query ? 1 : 0);
  const activeFacets = [
    typeFilter !== "All types" ? `Type: ${typeFilter}` : "",
    designFilter !== "All design statuses" ? `Design: ${designFilter}` : "",
    supportFilter !== "All platform scopes" ? `Platform scope: ${supportFilter}` : "",
    ...(["web", "ios", "android"] as Platform[]).map((platform) => platformFilters[platform] !== "All statuses" ? `${platformLabels[platform]}: ${platformFilters[platform]}` : ""),
  ].filter(Boolean);
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

  function columnFilterValue(key: ColumnFilterKey): string {
    if (key === "type") return typeFilter;
    if (key === "design") return designFilter;
    if (key === "support") return supportFilter;
    return platformFilters[key];
  }

  function columnFilterOptions(key: ColumnFilterKey): readonly string[] {
    if (key === "type") return componentTypes;
    if (key === "design") return designStatuses;
    if (key === "support") return supportStatuses;
    return adoptionStatuses;
  }

  function columnFilterLabel(key: ColumnFilterKey): string {
    if (key === "type") return "Type";
    if (key === "design") return "Design";
    if (key === "support") return "Platform scope";
    return platformLabels[key];
  }

  function updateColumnFilter(key: ColumnFilterKey, value: string) {
    if (key === "type") setTypeFilter(value as (typeof componentTypes)[number]);
    else if (key === "design") setDesignFilter(value as (typeof designStatuses)[number]);
    else if (key === "support") setSupportFilter(value as (typeof supportStatuses)[number]);
    else setPlatformFilters((current) => ({ ...current, [key]: value as (typeof adoptionStatuses)[number] }));
    setOpenColumnFilter(null);
  }

  function toggleColumnFilter(key: ColumnFilterKey, event: React.MouseEvent<HTMLButtonElement>) {
    if (openColumnFilter?.key === key) {
      setOpenColumnFilter(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const panelWidth = 232;
    setOpenColumnFilter({
      key,
      top: rect.bottom + 6,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12)),
    });
  }

  async function saveComponent(event: React.FormEvent<HTMLFormElement>, composedIds: string[], usedInIds: string[]) {
    event.preventDefault();
    if (!editing?.name.trim()) return;
    if (!isEditor) {
      setImportNotice({ tone: "error", message: "Only approved editors can change component records." });
      return;
    }
    const previous = components.find((component) => component.id === editing.id);
    const currentVersion = editing.currentVersion.trim();
    let releaseHistory = editing.releaseHistory ?? [];
    if (previous && previous.currentVersion !== currentVersion) releaseHistory = [previous.currentVersion, ...releaseHistory.filter((version) => version !== previous.currentVersion)];
    const composition = reconcileDirectRelationships(editing.composition ?? [], composedIds, components);
    const previousComposedIds = (previous?.composition ?? []).map((node) => node.componentId).filter((id): id is string => Boolean(id));
    const relationshipsChanged = !sameIds(previousComposedIds, composedIds);
    const updated: ComponentRecord = {
      ...editing,
      name: editing.name.trim(),
      currentVersion,
      releaseHistory,
      composedOf: composition.map((node) => node.name),
      composition,
      relationshipsModified: Boolean(editing.relationshipsModified || relationshipsChanged),
      updated: "Today",
    };
    try {
      const { db } = getFirebaseServices();
      const batch = writeBatch(db);
      batch.set(doc(db, "components", updated.id), updated);
      const desiredParents = new Set(usedInIds);
      for (const parent of components) {
        if (parent.id === updated.id) continue;
        const currentlyUsed = walkIds(parent.composition).includes(updated.id);
        const shouldBeUsed = desiredParents.has(parent.id);
        let parentComposition = refreshRelationship(parent.composition ?? [], updated);
        if (currentlyUsed && !shouldBeUsed) parentComposition = removeRelationship(parentComposition, updated.id);
        if (!currentlyUsed && shouldBeUsed) parentComposition = [...parentComposition, relationshipNode(updated)];
        if (currentlyUsed !== shouldBeUsed || JSON.stringify(parentComposition) !== JSON.stringify(parent.composition ?? [])) {
          batch.set(doc(db, "components", parent.id), {
            ...parent,
            composition: parentComposition,
            composedOf: parentComposition.map((node) => node.name),
            relationshipsModified: Boolean(parent.relationshipsModified || currentlyUsed !== shouldBeUsed),
            updated: "Today",
          });
        }
      }
      await batch.commit();
      setEditing(null);
    } catch {
      setImportNotice({ tone: "error", message: "The component could not be saved. Check your editor access and try again." });
    }
  }

  async function importFigmaJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isEditor) {
      setImportNotice({ tone: "error", message: "Only approved editors can import component records." });
      return;
    }

    try {
      const imported = parseFigmaComponentExportText(await file.text());
      setPendingImport({ fileName: file.name, components: imported, preserveManualRelationships: true });
    } catch (error) {
      setImportNotice({ tone: "error", message: error instanceof Error ? error.message : "This JSON file could not be imported." });
    }
  }

  async function confirmFigmaImport() {
    if (!pendingImport) return;
    try {
      const result = mergeImportedComponents(components, pendingImport.components, { preserveManualRelationships: pendingImport.preserveManualRelationships });
      const { db } = getFirebaseServices();
      const batch = writeBatch(db);
      for (const component of result.components) batch.set(doc(db, "components", component.id), component);
      await batch.commit();
      setImportNotice({
        tone: "success",
        message: `${pendingImport.fileName}: ${result.added} component${result.added === 1 ? "" : "s"} added and ${result.updated} updated. Existing workflow statuses, resource links${pendingImport.preserveManualRelationships ? ", and manual relationship overrides" : ""} were preserved.`,
      });
      setPendingImport(null);
    } catch {
      setImportNotice({ tone: "error", message: "The Figma import could not be published. Check your editor access and try again." });
    }
  }

  async function publishStarterInventory() {
    if (!isEditor) return;
    let seed = initialComponents;
    const localCopy = window.localStorage.getItem("maple-components-v3");
    if (localCopy) {
      try {
        const parsed = JSON.parse(localCopy);
        if (Array.isArray(parsed) && parsed.length) seed = parsed.map((component) => normalizeComponent(component as ComponentRecord));
      } catch { /* Use the bundled inventory. */ }
    }

    try {
      const { db } = getFirebaseServices();
      const batch = writeBatch(db);
      for (const component of seed) batch.set(doc(db, "components", component.id), component);
      await batch.commit();
      setImportNotice({ tone: "success", message: `${seed.length} component records were published to the shared inventory.` });
    } catch {
      setImportNotice({ tone: "error", message: "The starter inventory could not be published. Check your editor access and try again." });
    }
  }

  async function signIn() {
    setImportNotice(null);
    try {
      const { auth, provider } = getFirebaseServices();
      await signInWithPopup(auth, provider);
    } catch {
      setImportNotice({ tone: "error", message: "Google sign-in was not completed." });
    }
  }

  function clearAllFilters() {
    setQuery("");
    setTypeFilter("All types");
    setDesignFilter("All design statuses");
    setSupportFilter("All platform scopes");
    setPlatformFilters({ web: "All statuses", ios: "All statuses", android: "All statuses" });
  }

  if (!authReady) return <AccessScreen title="Connecting to Maple" message="Checking your AP account…" />;
  if (!firebaseConfigured) return <AccessScreen title="Firebase setup required" message="Add the Firebase web configuration to this environment before opening the tracker." />;
  if (!user) return <AccessScreen title="Component tracker" message={importNotice?.message ?? `Sign in with your @${allowedEmailDomain} Google account to review the Maple inventory.`} actionLabel="Sign in with Google" onAction={signIn} error={importNotice?.tone === "error"} />;
  if (!dataReady) return <AccessScreen title="Loading the inventory" message="Connecting to the shared component data…" />;

  return (
    <main>
      <header className="app-header">
        <a href="#top" className="brand" aria-label="Maple component tracker home">
          <span className="brand-mark">M</span>
          <span>Maple</span>
          <span className="brand-product">AP News design system</span>
        </a>
        <div className="header-actions">
          <span className="prototype-state"><i /> Live · {isEditor ? "Editor" : "Viewer"}</span>
          {isEditor && <><input ref={importInput} className="sr-only" type="file" accept="application/json,.json" onChange={importFigmaJson} /><button className="button secondary import-button" onClick={() => importInput.current?.click()}><span className="import-wide">Import Figma JSON</span><span className="import-short">Import JSON</span></button><button className="button primary" onClick={() => setEditing(emptyComponent())}>＋ Add component</button></>}
          <button className="account-button" onClick={() => void signOut(getFirebaseServices().auth)} title={user.email ?? "Signed in"}>{user.email?.split("@")[0]} <span>Sign out</span></button>
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

        <details className="type-guide">
          <summary>
            <span><strong>Component type definitions</strong><small>Reference the Maple component hierarchy</small></span>
            <span className="type-guide-action">View definitions</span>
          </summary>
          <div className="type-guide-grid">
            <article>
              <h2>Base component</h2>
              <p>The smallest building blocks in Maple—buttons, eyebrows, timestamps, and titles. Base components carry no inherent awareness of layout context; they consume tokens directly and adapt to whatever container or module they&apos;re placed in.</p>
            </article>
            <article>
              <h2>Slot component</h2>
              <p>A reusable component that can appear across multiple modules or page structures, rather than being fixed to a single one. Slots may function as placeholders for dynamic content within a module (e.g., Live updates slot), or as portable, self-contained units—composed of base components—that multiple modules can incorporate (e.g., Story card, Story link).</p>
            </article>
            <article>
              <h2>Module</h2>
              <p>Larger UI patterns composed primarily of base components and slot components. List E, Narrow List A, and our other list items are considered modules.</p>
            </article>
            <article>
              <h2>Page structure</h2>
              <p>The top-level assembly—an arrangement of modules per a page template (article page, homepage, etc.). Page structures define ordering, spacing rhythm, and which modules are eligible for that context, but shouldn&apos;t override module or slot internals.</p>
            </article>
          </div>
        </details>

        <section className="inventory-card">
          <div className="table-heading">
            <div><h2>Components</h2><span>{filtered.length} shown{activeFacetCount ? ` · ${activeFacetCount} active filter${activeFacetCount > 1 ? "s" : ""}` : ""}</span></div>
            <span>Select a component to review its details and dependencies.</span>
          </div>

          <div className="table-controls">
            <label className="search-field table-search">
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Component or dependency" />
            </label>
            <details className="mobile-filter-panel">
              <summary>Filters{activeFacetCount ? ` (${activeFacetCount})` : ""}</summary>
              <div className="mobile-filter-grid">
                <Filter label="Type" value={typeFilter} options={componentTypes} onChange={(value) => setTypeFilter(value as typeof typeFilter)} />
                <Filter label="Design status" value={designFilter} options={designStatuses} onChange={(value) => setDesignFilter(value as typeof designFilter)} />
                <Filter label="Platform scope" value={supportFilter} options={supportStatuses} onChange={(value) => setSupportFilter(value as typeof supportFilter)} />
                {(["web", "ios", "android"] as Platform[]).map((platform) => <Filter key={platform} label={platformLabels[platform]} value={platformFilters[platform]} options={adoptionStatuses} onChange={(value) => setPlatformFilters((current) => ({ ...current, [platform]: value as (typeof adoptionStatuses)[number] }))} />)}
              </div>
            </details>
          </div>

          {activeFacets.length > 0 && <div className="active-filter-row" aria-label="Active filters">
            <div>{activeFacets.map((filter) => <span key={filter}>{filter}</span>)}</div>
            <button onClick={clearAllFilters}>Clear all</button>
          </div>}

          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Component</th>
                <th><ColumnFilterButton filterKey="type" label="Type" active={typeFilter !== "All types"} expanded={openColumnFilter?.key === "type"} onClick={toggleColumnFilter} /></th>
                <th><ColumnFilterButton filterKey="design" label="Design" active={designFilter !== "All design statuses"} expanded={openColumnFilter?.key === "design"} onClick={toggleColumnFilter} /></th>
                <th><ColumnFilterButton filterKey="support" label="Platform scope" active={supportFilter !== "All platform scopes"} expanded={openColumnFilter?.key === "support"} onClick={toggleColumnFilter} /></th>
                {(["web", "ios", "android"] as Platform[]).map((platform) => <th key={platform}><ColumnFilterButton filterKey={platform} label={platformLabels[platform]} active={platformFilters[platform] !== "All statuses"} expanded={openColumnFilter?.key === platform} onClick={toggleColumnFilter} /></th>)}
              </tr></thead>
              <tbody>
                {filtered.map((component) => (
                  <tr key={component.id}>
                    <td><button className="component-link" onClick={() => openDetails(component.id, true)}><strong>{component.name}</strong><small>Version {component.currentVersion}</small></button></td>
                    <td><span className={`type-label type-${component.type.toLowerCase().replace(" ", "-")}`}>{typeLabel[component.type]}</span></td>
                    <td><Status value={component.status} /></td>
                    <td><Status value={component.support} /></td>
                    <td><Status value={component.adoption.web} compact /></td>
                    <td><Status value={component.adoption.ios} compact /></td>
                    <td><Status value={component.adoption.android} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (components.length === 0
              ? <div className="empty"><strong>The shared inventory is empty</strong><span>{isEditor ? "Publish the prototype’s current records to initialize Firestore." : "An editor needs to publish the initial component inventory."}</span>{isEditor && <button onClick={publishStarterInventory}>Publish starter inventory</button>}</div>
              : <div className="empty"><strong>No matching components</strong><span>Try removing a platform refinement or broadening the system scope.</span><button onClick={clearAllFilters}>Clear filters</button></div>)}
          </div>
        </section>
      </div>

      {openColumnFilter && <div className="column-filter-popover" role="group" aria-label={`Filter by ${columnFilterLabel(openColumnFilter.key)}`} style={{ top: openColumnFilter.top, left: openColumnFilter.left }}>
        <strong>{columnFilterLabel(openColumnFilter.key)}</strong>
        <div>{columnFilterOptions(openColumnFilter.key).map((option) => <button key={option} className={columnFilterValue(openColumnFilter.key) === option ? "selected" : ""} aria-pressed={columnFilterValue(openColumnFilter.key) === option} onClick={() => updateColumnFilter(openColumnFilter.key, option)}><span>{option}</span><i aria-hidden="true">{columnFilterValue(openColumnFilter.key) === option ? "✓" : ""}</i></button>)}</div>
      </div>}

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
          canEdit={isEditor}
        />
      )}

      {editing && <Editor component={editing} components={components} onChange={setEditing} onCancel={() => setEditing(null)} onSave={saveComponent} />}
      {pendingImport && <ImportReview pending={pendingImport} onChange={setPendingImport} onCancel={() => setPendingImport(null)} onConfirm={() => void confirmFigmaImport()} />}
    </main>
  );
}

function ImportReview({ pending, onChange, onCancel, onConfirm }: {
  pending: PendingImport;
  onChange: (pending: PendingImport) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const counts = componentTypes.slice(1).map((type) => ({ type, count: pending.components.filter((component) => component.type === type).length })).filter((item) => item.count > 0);
  return <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
    <section className="import-review" role="dialog" aria-modal="true" aria-labelledby="import-review-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="editor-header"><div><span>Figma import</span><h2 id="import-review-title">Review import</h2></div><button onClick={onCancel} aria-label="Close">×</button></div>
      <div className="import-review-body">
        <p><strong>{pending.fileName}</strong> contains {pending.components.length} tracked components.</p>
        <div className="import-counts">{counts.map(({ type, count }) => <span key={type}><strong>{count}</strong> {type}</span>)}</div>
        <label className="preserve-option"><input type="checkbox" checked={pending.preserveManualRelationships} onChange={(event) => onChange({ ...pending, preserveManualRelationships: event.target.checked })} /><span><strong>Preserve manually edited relationships</strong><small>Components marked as manually changed keep their current “Composed of” and “Used in” relationships. Untouched components continue to refresh from Figma.</small></span></label>
      </div>
      <div className="editor-actions import-review-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="button" className="button primary" onClick={onConfirm}>Import components</button></div>
    </section>
  </div>;
}

function AccessScreen({ title, message, actionLabel, onAction, error = false }: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  error?: boolean;
}) {
  return <main className="access-shell">
    <div className="access-brand"><span className="brand-mark">M</span><strong>Maple</strong><span>AP News design system</span></div>
    <section className="access-card">
      <span className="access-label">Component tracker</span>
      <h1>{title}</h1>
      <p className={error ? "access-error" : ""}>{message}</p>
      {actionLabel && onAction && <button className="button primary" onClick={onAction}>{actionLabel}</button>}
    </section>
  </main>;
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

function ColumnFilterButton({ filterKey, label, active, expanded, onClick }: {
  filterKey: ColumnFilterKey;
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: (key: ColumnFilterKey, event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return <button className={`column-filter-trigger ${active ? "active" : ""}`} aria-label={`Filter ${label}`} aria-haspopup="true" aria-expanded={expanded} onClick={(event) => onClick(filterKey, event)}>
    <span>{label}</span>
    <svg className="column-filter-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.59 8.29504L12 12.875L7.41 8.29504L6 9.70504L12 15.705L18 9.70504L16.59 8.29504Z" /></svg>
  </button>;
}

function DetailDrawer({ component, components, usedBy, canGoBack, onBack, onClose, onSelect, onEdit, canEdit }: {
  component: ComponentRecord;
  components: ComponentRecord[];
  usedBy: ComponentRecord[];
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const componentMap = new Map(components.map((item) => [item.id, item]));
  return <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="drawer-nav"><button onClick={onBack} disabled={!canGoBack} aria-label="Back">←</button><span>Component details</span><button onClick={onClose} aria-label="Close">×</button></div>
      <div className="drawer-header">
        <div><span className={`type-label type-${component.type.toLowerCase().replace(" ", "-")}`}>{typeLabel[component.type]}</span><h2 id="drawer-title">{component.name}</h2></div>
        {canEdit && <button className="button secondary" onClick={onEdit}>Edit</button>}
      </div>
      <p className="drawer-description">{component.notes || "No notes added."}</p>

      <section className="detail-section">
        <div className="section-heading"><h3>Release history</h3><span>{component.releaseHistory.length + 1} versions</span></div>
        <div className="release-list"><div className="current"><strong>{component.currentVersion}</strong><span>Current</span></div>{component.releaseHistory.map((version) => <div key={version}><strong>{version}</strong></div>)}</div>
      </section>

      <section className="detail-section">
        <h3>Current status</h3>
        <div className="status-grid">
          <div><span>Design</span><Status value={component.status} /></div>
          <div><span>Platform scope</span><Status value={component.support} /></div>
          <div><span>Web</span><Status value={component.adoption.web} /></div>
          <div><span>iOS</span><Status value={component.adoption.ios} /></div>
          <div><span>Android</span><Status value={component.adoption.android} /></div>
        </div>
      </section>

      <section className="detail-section">
        <div className="section-heading"><h3>Composed of</h3><span>{component.composition?.length ?? 0} direct components</span></div>
        {component.composition?.length ? <div className="dependency-tree">{component.composition.map((node, index) => <Dependency key={`${node.name}-${index}`} node={node} componentMap={componentMap} onSelect={onSelect} depth={0} />)}</div> : <p className="quiet-empty">No tracked component parts. This is a foundational component.</p>}
      </section>

      <section className="detail-section">
        <div className="section-heading"><h3>Used in</h3><span>{usedBy.length} components</span></div>
        {usedBy.length ? <div className="used-by-list">{usedBy.map((parent) => <button key={parent.id} onClick={() => onSelect(parent.id)}><span className={`type-dot dot-${parent.type.toLowerCase().replace(" ", "-")}`} /> <strong>{parent.name}</strong><small>{typeLabel[parent.type]}</small><i>→</i></button>)}</div> : <p className="quiet-empty">This component is not currently used in another tracked component.</p>}
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

function Editor({ component, components, onChange, onCancel, onSave }: {
  component: ComponentRecord;
  components: ComponentRecord[];
  onChange: (component: ComponentRecord) => void;
  onCancel: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>, composedIds: string[], usedInIds: string[]) => void;
}) {
  const candidates = components.filter((candidate) => candidate.id !== component.id);
  const [composedIds, setComposedIds] = useState(() => (component.composition ?? []).map((node) => node.componentId).filter((id): id is string => Boolean(id)));
  const [usedInIds, setUsedInIds] = useState(() => components.filter((candidate) => walkIds(candidate.composition).includes(component.id)).map((candidate) => candidate.id));
  return <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
    <section className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="editor-header"><div><span>Component record</span><h2 id="editor-title">{component.name ? `Edit ${component.name}` : "Add component"}</h2></div><button onClick={onCancel} aria-label="Close">×</button></div>
      <form onSubmit={(event) => onSave(event, composedIds, usedInIds)}>
        <div className="form-grid">
          <label className="wide">Name<input required autoFocus value={component.name} onChange={(event) => onChange({ ...component, name: event.target.value })} /></label>
          <label>Type<select value={component.type} onChange={(event) => onChange({ ...component, type: event.target.value as ComponentType })}>{componentTypes.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Design status<select value={component.status} onChange={(event) => onChange({ ...component, status: event.target.value as ComponentStatus })}>{designStatuses.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="wide">Platform scope<select value={component.support} onChange={(event) => onChange({ ...component, support: event.target.value as SupportStatus })}>{supportStatuses.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
          <h3 className="form-section-title">Release</h3>
          <label className="wide">Current version<input required pattern="[0-9]+\.[0-9]+(\.[0-9]+)?" title="Use a semantic version such as 1.0, 1.1, or 2.0" value={component.currentVersion} onChange={(event) => onChange({ ...component, currentVersion: event.target.value })} /></label>
          <h3 className="form-section-title">Platform rollout</h3>
          {(["web", "ios", "android"] as Platform[]).map((platform) => <label key={platform}>{platformLabels[platform]} status<select value={component.adoption[platform]} onChange={(event) => onChange({ ...component, adoption: { ...component.adoption, [platform]: event.target.value as AdoptionStatus } })}>{adoptionStatuses.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>)}
          <label className="wide">Variants <small>Comma separated</small><input value={component.variants.join(", ")} onChange={(event) => onChange({ ...component, variants: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
          <h3 className="form-section-title">System relationships</h3>
          <RelationshipPicker label="Composed of" help="Direct components used to build this component" candidates={candidates} selectedIds={composedIds} onChange={setComposedIds} />
          <RelationshipPicker label="Used in" help="Components that directly or indirectly include this component" candidates={candidates} selectedIds={usedInIds} onChange={setUsedInIds} />
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

function RelationshipPicker({ label, help, candidates, selectedIds, onChange }: {
  label: string;
  help: string;
  candidates: ComponentRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = new Set(selectedIds);
  const visible = candidates.filter((candidate) => !query.trim() || candidate.name.toLowerCase().includes(query.trim().toLowerCase()));
  function toggle(id: string) {
    onChange(selected.has(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
  }
  return <fieldset className="relationship-picker">
    <legend>{label} <small>{help}</small></legend>
    <div className="relationship-picker-summary"><span>{selectedIds.length} selected</span>{selectedIds.length > 0 && <button type="button" onClick={() => onChange([])}>Clear</button>}</div>
    <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a component…" aria-label={`Search ${label.toLowerCase()} components`} />
    <div className="relationship-options">
      {visible.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} /><span><strong>{candidate.name}</strong><small>{typeLabel[candidate.type]}</small></span></label>)}
      {!visible.length && <p>No matching components.</p>}
    </div>
  </fieldset>;
}
