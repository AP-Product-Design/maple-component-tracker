import type { ComponentRecord, ComponentType, CompositionNode, Platform } from "./component-data";

type JsonObject = Record<string, unknown>;

const defaultAdoption: ComponentRecord["adoption"] = {
  web: "Needs Jira ticket",
  ios: "Needs Jira ticket",
  android: "Needs Jira ticket",
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function entries(value: unknown): Array<[string, JsonObject]> {
  if (Array.isArray(value)) return value.filter(isObject).map((item, index) => [String(index), item]);
  if (!isObject(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, JsonObject] => isObject(entry[1]));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function displayName(value: string): string {
  const withoutPrefix = value.replace(/^slot components\s*\/\s*\.?/i, "").replace(/^modules?\s*\/\s*\.?/i, "");
  const cleaned = withoutPrefix.split("/")[0].replace(/^\./, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : cleaned;
}

function variantLabel(value: string): string {
  return value.split(",").map((part) => part.trim().split("=").at(-1)?.trim()).filter(Boolean).join(" · ");
}

function classificationType(value: unknown): ComponentType | null {
  const normalized = text(value).toLowerCase().replaceAll("_", " ");
  if (normalized === "base" || normalized === "base component") return "Base";
  if (normalized === "slot" || normalized === "slot component") return "Slot";
  if (normalized === "module") return "Module";
  if (normalized === "page structure") return "Page structure";
  return null;
}

function isBuildingBlock(node: JsonObject): boolean {
  return text(node.classification).toLowerCase() === "building_block" ||
    /^building blocks?\s*\//i.test(text(node.name)) ||
    /^building blocks?/i.test(text(node.page));
}

function componentId(type: ComponentType, name: string): string {
  return `figma-${slug(type)}-${slug(name)}`;
}

function childrenOf(node: JsonObject): JsonObject[] {
  const children = Array.isArray(node.children) ? node.children.filter(isObject) : [];
  const nested = Array.isArray(node.nestedInstances) ? node.nestedInstances.filter(isObject) : [];
  return [...children, ...nested];
}

function compositionFrom(nodes: JsonObject[]): CompositionNode[] {
  return nodes.flatMap((node) => {
    const nested = compositionFrom(childrenOf(node));
    if (isBuildingBlock(node)) return nested;
    const kind = classificationType(node.classification);
    if (!kind) return nested;

    const name = displayName(text(node.name) || text(node.page) || "Unnamed component");
    const variant = variantLabel(text(node.mainComponent));
    return [{
      name,
      kind,
      componentId: componentId(kind, name),
      variant: variant || undefined,
      count: typeof node.repeatCount === "number" ? node.repeatCount : undefined,
      figmaNodeId: text(node.mainComponentId) || text(node.id) || undefined,
      children: nested.length ? nested : undefined,
    } satisfies CompositionNode];
  });
}

function collectInstances(nodes: JsonObject[], found: Map<string, { name: string; type: ComponentType; variants: Set<string>; page: string; nodeId: string }>) {
  for (const node of nodes) {
    if (isBuildingBlock(node)) {
      collectInstances(childrenOf(node), found);
      continue;
    }
    const type = classificationType(node.classification);
    if (type) {
      const name = displayName(text(node.name) || text(node.page) || "Unnamed component");
      const key = `${type}:${slug(name)}`;
      const variant = variantLabel(text(node.mainComponent));
      const current = found.get(key) ?? { name, type, variants: new Set<string>(), page: text(node.page), nodeId: text(node.mainComponentId) || text(node.id) };
      if (variant) current.variants.add(variant);
      if (!current.page) current.page = text(node.page);
      if (!current.nodeId) current.nodeId = text(node.mainComponentId) || text(node.id);
      found.set(key, current);
    }
    collectInstances(childrenOf(node), found);
  }
}

function figmaLink(fileKey: string, nodeId: string): string | undefined {
  if (!fileKey) return undefined;
  const base = `https://www.figma.com/design/${fileKey}`;
  return nodeId ? `${base}?node-id=${nodeId.replace(":", "-")}` : base;
}

function dateLabel(value: string): string {
  if (!value) return "Today";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function makeRecord({ name, type, variants, page, nodeId, notes, composition, fileKey, exportDate }: {
  name: string;
  type: ComponentType;
  variants: string[];
  page: string;
  nodeId: string;
  notes?: string;
  composition?: CompositionNode[];
  fileKey: string;
  exportDate: string;
}): ComponentRecord {
  return {
    id: componentId(type, name),
    name,
    type,
    variants,
    status: "In design",
    support: "Planned",
    adoption: { ...defaultAdoption } as Record<Platform, ComponentRecord["adoption"][Platform]>,
    composedOf: (composition ?? []).map((item) => item.name),
    composition: composition ?? [],
    links: { figma: figmaLink(fileKey, nodeId) },
    notes: notes ?? "Imported from Figma.",
    updated: dateLabel(exportDate),
    source: { label: `Figma import${exportDate ? ` · ${dateLabel(exportDate)}` : ""}`, page: page || "Unknown page", nodeId: nodeId || undefined },
  };
}

export function parseFigmaComponentExport(value: unknown): ComponentRecord[] {
  if (!isObject(value)) throw new Error("The selected file is not a valid Figma component export.");
  const moduleEntries = entries(value.modules);
  const slotEntries = entries(value.slotComponents);
  if (!moduleEntries.length && !slotEntries.length) throw new Error("No modules or slot components were found in this JSON file.");

  const fileKey = text(value.fileKey);
  const exportDate = text(value.exportDate);
  const records = new Map<string, ComponentRecord>();
  const nested = new Map<string, { name: string; type: ComponentType; variants: Set<string>; page: string; nodeId: string }>();

  const topLevelEntries: Array<[string, JsonObject, ComponentType]> = [
    ...moduleEntries.map(([key, item]) => [key, item, "Module"] as [string, JsonObject, ComponentType]),
    ...slotEntries.map(([key, item]) => [key, item, "Slot"] as [string, JsonObject, ComponentType]),
  ];

  for (const [fallbackName, item, defaultType] of topLevelEntries) {
    const type = classificationType(item.classification) ?? defaultType;
    const name = displayName(text(item.name) || fallbackName);
    const structure = isObject(item.structure) ? item.structure : {};
    const composition = compositionFrom(childrenOf(structure));
    const variants = Array.isArray(item.variants) ? item.variants.map(text).filter(Boolean).map(variantLabel) : [];
    const structureVariant = variantLabel(text(structure.name));
    if (structureVariant && !variants.includes(structureVariant)) variants.push(structureVariant);
    const nodeId = text(item.componentSetId) || text(structure.id);

    records.set(`${type}:${slug(name)}`, makeRecord({
      name,
      type,
      variants,
      page: text(item.page),
      nodeId,
      notes: text(item.description) || undefined,
      composition,
      fileKey,
      exportDate,
    }));
    collectInstances(childrenOf(structure), nested);
  }

  for (const [key, item] of nested) {
    const existing = records.get(key);
    if (existing) {
      existing.variants = [...new Set([...existing.variants, ...item.variants])];
      continue;
    }
    records.set(key, makeRecord({
      name: item.name,
      type: item.type,
      variants: [...item.variants],
      page: item.page,
      nodeId: item.nodeId,
      fileKey,
      exportDate,
    }));
  }

  return [...records.values()];
}

export function mergeImportedComponents(current: ComponentRecord[], imported: ComponentRecord[]) {
  let added = 0;
  let updated = 0;
  const next = [...current];

  for (const incoming of imported) {
    const matchIndex = next.findIndex((item) =>
      (incoming.source?.nodeId && item.source?.nodeId === incoming.source.nodeId) ||
      (item.type === incoming.type && slug(item.name) === slug(incoming.name))
    );
    if (matchIndex === -1) {
      next.unshift(incoming);
      added += 1;
      continue;
    }

    const existing = next[matchIndex];
    next[matchIndex] = {
      ...existing,
      name: incoming.name,
      type: incoming.type,
      variants: [...new Set([...existing.variants, ...incoming.variants])],
      composedOf: incoming.composedOf,
      composition: incoming.composition,
      links: { ...incoming.links, ...existing.links, figma: incoming.links.figma ?? existing.links.figma },
      notes: existing.notes || incoming.notes,
      source: incoming.source,
      updated: "Today",
    };
    updated += 1;
  }

  return { components: next, added, updated };
}
