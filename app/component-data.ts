export type ComponentType = "Base" | "Slot" | "Module" | "Page structure";
export type ComponentStatus = "Proposed" | "In design" | "Ready" | "Deprecated";
export type SupportStatus = "Full" | "Partial" | "None" | "Planned";
export type AdoptionStatus =
  | "Needs Jira ticket"
  | "Backlog"
  | "In dev"
  | "In review"
  | "Released"
  | "Blocked"
  | "Not supported";
export type Platform = "web" | "ios" | "android";

export type CompositionNode = {
  name: string;
  kind: ComponentType | "Building block";
  componentId?: string;
  variant?: string;
  count?: number;
  figmaNodeId?: string;
  children?: CompositionNode[];
};

export type ComponentRecord = {
  id: string;
  name: string;
  type: ComponentType;
  variants: string[];
  status: ComponentStatus;
  support: SupportStatus;
  adoption: Record<Platform, AdoptionStatus>;
  composedOf: string[];
  composition?: CompositionNode[];
  links: {
    figma?: string;
    zeroheight?: string;
    prototype?: string;
    jira?: string[];
  };
  notes: string;
  updated: string;
  source?: {
    label: string;
    page: string;
    nodeId?: string;
  };
};

const FIGMA_FILE = "j8LaZtIwO9YI8JGpGqEcZK";
const figmaUrl = (nodeId?: string) =>
  nodeId
    ? `https://www.figma.com/design/${FIGMA_FILE}?node-id=${nodeId.replace(":", "-")}`
    : `https://www.figma.com/design/${FIGMA_FILE}`;

const plannedAdoption: Record<Platform, AdoptionStatus> = {
  web: "Needs Jira ticket",
  ios: "Needs Jira ticket",
  android: "Needs Jira ticket",
};

function figmaRecord(
  record: Pick<ComponentRecord, "id" | "name" | "type" | "variants" | "notes"> & {
    page: string;
    nodeId?: string;
    composition?: CompositionNode[];
  },
): ComponentRecord {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    variants: record.variants,
    status: "In design",
    support: "Planned",
    adoption: { ...plannedAdoption },
    composedOf: (record.composition ?? []).map((item) => item.name),
    composition: record.composition,
    links: { figma: figmaUrl(record.nodeId) },
    notes: record.notes,
    updated: "Jul 31",
    source: {
      label: "Figma export · Jul 31, 2026",
      page: record.page,
      nodeId: record.nodeId,
    },
  };
}

const eyebrow: CompositionNode = {
  name: "Eyebrow",
  kind: "Base",
  componentId: "eyebrow",
  variant: "Live icon minutes",
  figmaNodeId: "5823:19790",
};
const breakingEyebrow: CompositionNode = {
  name: "Eyebrow",
  kind: "Base",
  componentId: "eyebrow",
  variant: "Breaking News",
  figmaNodeId: "5823:19796",
};
const timestampRead: CompositionNode = {
  name: "Timestamp",
  kind: "Base",
  componentId: "timestamp",
  variant: "Read time",
  figmaNodeId: "7560:21172",
};
const timestampMinutes: CompositionNode = {
  name: "Timestamp",
  kind: "Base",
  componentId: "timestamp",
  variant: "Minutes",
  figmaNodeId: "1433:5412",
};
const moduleTitle: CompositionNode = {
  name: "Module title",
  kind: "Base",
  componentId: "module-title",
  variant: "SM–MD screen",
  figmaNodeId: "11014:15037",
  children: [
    { name: "Container divider", kind: "Building block", variant: "Subtle" },
    { name: "Prompt", kind: "Building block", variant: "MD" },
  ],
};
const storyCardChildren: CompositionNode[] = [
  { name: "Divider", kind: "Building block" },
  breakingEyebrow,
  {
    name: "Story link title",
    kind: "Slot",
    componentId: "story-link-title",
    variant: "Title 5 · Medium",
    figmaNodeId: "3220:24428",
  },
  {
    name: "Description",
    kind: "Slot",
    componentId: "description",
    variant: "SM",
    figmaNodeId: "3220:24446",
  },
  {
    ...timestampRead,
    children: [
      {
        name: "Comment counter button",
        kind: "Base",
        componentId: "comment-counter-button",
        variant: "Text link",
        figmaNodeId: "8372:28577",
      },
    ],
  },
  { name: "Lead image standard", kind: "Building block", variant: "Image" },
];
const leadStoryNode: CompositionNode = {
  name: "Lead story",
  kind: "Slot",
  componentId: "lead-story",
  variant: "Default",
  figmaNodeId: "11807:15725",
  children: [eyebrow, timestampMinutes],
};
const storyCardTextNode: CompositionNode = {
  name: "Story card",
  kind: "Slot",
  componentId: "story-card",
  variant: "Text · Number false",
  count: 8,
  figmaNodeId: "12075:38548",
  children: storyCardChildren.filter((item) => item.name !== "Description" && item.name !== "Lead image standard"),
};
const storyCardGridNode: CompositionNode = {
  name: "Story card",
  kind: "Slot",
  componentId: "story-card",
  variant: "2–1 · Number false",
  count: 10,
  figmaNodeId: "12061:33902",
  children: storyCardChildren,
};

const figmaComponents: ComponentRecord[] = [
  figmaRecord({
    id: "module-title",
    name: "Module title",
    type: "Base",
    variants: ["SM–MD screen"],
    page: "Module title",
    nodeId: "11014:15037",
    notes: "Base title treatment used at the start of imported list modules.",
  }),
  figmaRecord({
    id: "eyebrow",
    name: "Eyebrow",
    type: "Base",
    variants: ["Live icon minutes", "Breaking News", "Topic Label"],
    page: "Eyebrow",
    nodeId: "5823:19790",
    notes: "Consolidated from three identified Figma variants.",
  }),
  figmaRecord({
    id: "live-icon",
    name: "Live icon",
    type: "Base",
    variants: ["Dot indicator"],
    page: "Eyebrow",
    nodeId: "12298:2407",
    notes: "Nested in the live-selected storyline navigation item.",
  }),
  figmaRecord({
    id: "timestamp",
    name: "Timestamp",
    type: "Base",
    variants: ["Read time", "Minutes"],
    page: "Timestamp",
    nodeId: "7560:21172",
    notes: "Time metadata used across story slots and local List E patterns.",
  }),
  figmaRecord({
    id: "divider",
    name: "Divider",
    type: "Base",
    variants: ["Moderate"],
    page: "Divider",
    nodeId: "12934:18509",
    notes: "The tracked base version from the Divider page; WIP building-block dividers remain contextual only.",
  }),
  figmaRecord({
    id: "comment-counter-button",
    name: "Comment counter button",
    type: "Base",
    variants: ["Default · Enabled · Text link"],
    page: "Buttons",
    nodeId: "8372:28577",
    notes: "Nested inside the read-time timestamp configuration.",
  }),
  figmaRecord({
    id: "lead-story",
    name: "Lead story",
    type: "Slot",
    variants: ["Default"],
    page: "Lead story content",
    nodeId: "11807:15724",
    composition: [eyebrow, timestampMinutes, { name: "Divider", kind: "Base", componentId: "divider", variant: "Moderate", figmaNodeId: "12934:18509" }],
    notes: "Lead story content block with eyebrow, headline, description, timestamp, and divider.",
  }),
  figmaRecord({
    id: "story-card",
    name: "Story card",
    type: "Slot",
    variants: [
      "3–1 · Number false", "3–1 · Number true", "2–1 · Number false", "2–1 · Number true",
      "Text · Number false", "Text · Number true", "1–1 · Number false", "Stacked · Number false",
    ],
    page: "Story card",
    nodeId: "12061:33901",
    composition: storyCardChildren,
    notes: "Flexible story card imported with eight layout and numbering combinations.",
  }),
  figmaRecord({
    id: "story-link",
    name: "Story link",
    type: "Slot",
    variants: ["Default"],
    page: "Story link",
    nodeId: "11911:9497",
    composition: [{ name: "Divider", kind: "Building block" }, eyebrow, timestampRead],
    notes: "A single story link with optional eyebrow, headline text, and timestamp.",
  }),
  figmaRecord({
    id: "storyline-nav",
    name: "Storyline nav",
    type: "Slot",
    variants: ["Default"],
    page: "Storyline nav",
    nodeId: "7551:4847",
    composition: [
      { name: "Divider", kind: "Building block" },
      { name: "Storyline nav title", kind: "Slot", componentId: "storyline-nav-title", figmaNodeId: "7539:1819" },
      {
        name: "Storyline nav item", kind: "Slot", componentId: "storyline-nav-item", variant: "Live selected", figmaNodeId: "11187:10940",
        children: [{ name: "Live icon", kind: "Base", componentId: "live-icon", variant: "Dot indicator", figmaNodeId: "12298:2407" }],
      },
      { name: "Storyline nav item", kind: "Slot", componentId: "storyline-nav-item", variant: "Enabled", count: 4, figmaNodeId: "7538:5006" },
    ],
    notes: "Tabbed storyline navigation containing one selected item and four enabled items in the exported instance.",
  }),
  figmaRecord({
    id: "storyline-nav-title",
    name: "Storyline nav title",
    type: "Slot",
    variants: ["Default"],
    page: "Storyline nav",
    nodeId: "7539:1819",
    notes: "Nested title pattern used by Storyline nav.",
  }),
  figmaRecord({
    id: "storyline-nav-item",
    name: "Storyline nav item",
    type: "Slot",
    variants: ["Live selected", "Enabled"],
    page: "Storyline nav",
    nodeId: "11187:10940",
    composition: [{ name: "Live icon", kind: "Base", componentId: "live-icon", variant: "Dot indicator", figmaNodeId: "12298:2407" }],
    notes: "Navigation item with selected-live and enabled states.",
  }),
  figmaRecord({
    id: "story-link-title",
    name: "Story link title",
    type: "Slot",
    variants: ["Title 5 · Medium · Hover false"],
    page: "Text element",
    nodeId: "3220:24428",
    notes: "Nested text-element slot used by Story card.",
  }),
  figmaRecord({
    id: "description",
    name: "Description",
    type: "Slot",
    variants: ["SM"],
    page: "Text element",
    nodeId: "3220:24446",
    notes: "Small descriptive text-element slot used by Story card.",
  }),
  figmaRecord({
    id: "pagination",
    name: "Pagination",
    type: "Slot",
    variants: ["Default"],
    page: "Pagination",
    nodeId: "13181:6382",
    notes: "Pagination slot used by List D.",
  }),
  figmaRecord({
    id: "bullet",
    name: "Bullet",
    type: "Module",
    variants: ["Default · Timestamp shown"],
    page: "List E",
    nodeId: "7551:5047",
    composition: [eyebrow, timestampRead],
    notes: "Local List E pattern. Classified as a module in the export despite its building-block naming.",
  }),
  figmaRecord({
    id: "list-e-lead-image",
    name: "Lead image standard",
    type: "Module",
    variants: ["Image"],
    page: "List E",
    nodeId: "7564:9710",
    notes: "Local List E image pattern classified as a module in the export.",
  }),
  figmaRecord({
    id: "story-link-list-stack",
    name: "Story link list stack",
    type: "Module",
    variants: ["Story count 2", "Story count 3", "Story count 4", "Story count 5"],
    page: "List E",
    nodeId: "7551:5107",
    composition: [
      { name: "Divider", kind: "Building block" },
      { name: "Bullet", kind: "Module", componentId: "bullet", variant: "Default · Timestamp shown", count: 5, figmaNodeId: "7551:5047", children: [eyebrow, timestampRead] },
    ],
    notes: "Local List E module for two to five secondary coverage items.",
  }),
  figmaRecord({
    id: "story-intro-default",
    name: "Story intro default",
    type: "Module",
    variants: ["Default"],
    page: "List E",
    nodeId: "2803:16832",
    composition: [
      { name: "Eyebrow", kind: "Base", componentId: "eyebrow", variant: "Topic Label", figmaNodeId: "7553:10855" },
      timestampMinutes,
    ],
    notes: "Local List E story intro with topic eyebrow, headline, description, and timestamp.",
  }),
  figmaRecord({
    id: "narrow-list-a",
    name: "Narrow List A",
    type: "Module",
    variants: ["Default · Compact"],
    page: "Narrow List A",
    nodeId: "12521:20338",
    composition: [
      moduleTitle,
      { name: "Lead image standard", kind: "Building block", variant: "Image" },
      leadStoryNode,
      storyCardTextNode,
      { name: "Vertical module spacing", kind: "Building block", variant: "Default" },
    ],
    notes: "Compact news list with a lead image, lead-story slot, and eight text story cards.",
  }),
  figmaRecord({
    id: "list-e",
    name: "List E",
    type: "Module",
    variants: ["Web · Default · Compact"],
    page: "List E",
    nodeId: "12937:23060",
    composition: [
      moduleTitle,
      {
        name: "Storyline nav", kind: "Slot", componentId: "storyline-nav", variant: "Default", figmaNodeId: "7551:4847",
        children: [
          { name: "Storyline nav title", kind: "Slot", componentId: "storyline-nav-title", figmaNodeId: "7539:1819" },
          { name: "Storyline nav item", kind: "Slot", componentId: "storyline-nav-item", variant: "Live selected", figmaNodeId: "11187:10940" },
          { name: "Storyline nav item", kind: "Slot", componentId: "storyline-nav-item", variant: "Enabled", count: 4, figmaNodeId: "7538:5006" },
        ],
      },
      { name: "Lead image standard", kind: "Module", componentId: "list-e-lead-image", variant: "Image", figmaNodeId: "7564:9710" },
      leadStoryNode,
      {
        name: "Story link list stack", kind: "Module", componentId: "story-link-list-stack", variant: "Story count 3", figmaNodeId: "7551:5117",
        children: [
          { name: "Divider", kind: "Building block" },
          { name: "Story link", kind: "Slot", componentId: "story-link", count: 3, figmaNodeId: "11911:9497", children: [eyebrow, timestampRead] },
        ],
      },
      { name: "Vertical module spacing", kind: "Building block", variant: "Default" },
    ],
    notes: "Storyline-based list with navigation, lead story, and a three-item secondary coverage stack.",
  }),
  figmaRecord({
    id: "list-d",
    name: "List D",
    type: "Module",
    variants: ["Default · Compact"],
    page: "List D",
    nodeId: "13181:8207",
    composition: [
      moduleTitle,
      storyCardGridNode,
      { name: "Divider", kind: "Building block" },
      { name: "Pagination", kind: "Slot", componentId: "pagination", variant: "Default", figmaNodeId: "13181:6382" },
      { name: "Vertical module spacing", kind: "Building block", variant: "Default" },
    ],
    notes: "Paginated two-column image grid with ten story cards and pagination controls.",
  }),
];

const existingComponents: ComponentRecord[] = [
  {
    id: "button", name: "Button", type: "Base", variants: ["Primary", "Secondary", "Tertiary", "Icon"], status: "Ready", support: "Full",
    adoption: { web: "Released", ios: "Released", android: "Released" }, composedOf: [], links: {},
    notes: "Core action primitive. Use one primary action per surface.", updated: "Jul 28",
  },
  {
    id: "headline", name: "Headline", type: "Base", variants: ["Display", "Page", "Section", "Card"], status: "Ready", support: "Full",
    adoption: { web: "Released", ios: "Released", android: "Released" }, composedOf: [], links: {},
    notes: "Editorial type styles align to Maple’s shared type scale.", updated: "Jul 24",
  },
  {
    id: "media", name: "Media", type: "Base", variants: ["Image", "Video", "Gallery"], status: "In design", support: "Partial",
    adoption: { web: "In review", ios: "In dev", android: "Backlog" }, composedOf: [], links: {},
    notes: "Android gallery behavior is awaiting interaction guidance.", updated: "Jul 22",
  },
  {
    id: "live-update", name: "Live update", type: "Slot", variants: ["Default", "Key event"], status: "Proposed", support: "Planned",
    adoption: { ...plannedAdoption }, composedOf: ["Timestamp", "Headline", "Body", "Share action"], links: {},
    notes: "Proposed pattern for live coverage timelines.", updated: "Jul 16",
  },
  {
    id: "top-stories", name: "Top stories", type: "Module", variants: ["Lead", "River"], status: "In design", support: "Partial",
    adoption: { web: "In dev", ios: "Backlog", android: "Blocked" }, composedOf: ["Story card", "Headline", "Divider", "Button"], links: {},
    notes: "Android is blocked on the new responsive image API.", updated: "Jul 14",
  },
  {
    id: "related-content", name: "Related content", type: "Module", variants: ["Inline", "End of story"], status: "Ready", support: "Partial",
    adoption: { web: "Released", ios: "In review", android: "In dev" }, composedOf: ["Story card", "Headline", "Divider"], links: {},
    notes: "Inline placement is currently web-only.", updated: "Jul 11",
  },
  {
    id: "article-page", name: "Article page", type: "Page structure", variants: ["Standard", "Live", "Visual"], status: "In design", support: "Partial",
    adoption: { web: "In review", ios: "In dev", android: "In dev" }, composedOf: ["Story header", "Article body", "Related content", "Ad slot"], links: {},
    notes: "Live template composition is still being validated.", updated: "Jul 08",
  },
];

export const initialComponents: ComponentRecord[] = [...figmaComponents, ...existingComponents];
