import assert from "node:assert/strict";
import test from "node:test";
import { mergeImportedComponents, parseFigmaComponentExport, parseFigmaComponentExportText } from "../app/figma-import.ts";

const exportFixture = {
  fileKey: "figma-file-key",
  exportDate: "2026-07-31",
  modules: {
    topStories: {
      name: "Top stories/Default",
      classification: "module",
      page: "Top stories",
      componentSetId: "1:1",
      structure: {
        name: "Layout=Default",
        id: "1:2",
        children: [{
          name: "Slot components/.story-card",
          classification: "slot_component",
          mainComponent: "Layout=Text",
          mainComponentId: "2:1",
          page: "Story card",
          nestedInstances: [{
            name: "Eyebrow",
            classification: "base_component",
            mainComponent: "Type=Breaking News",
            mainComponentId: "3:1",
            page: "Eyebrow",
          }, {
            name: "Building blocks/.spacing",
            classification: "module",
            mainComponentId: "4:1",
            page: "Building blocks (WIP)",
          }],
        }],
      },
    },
  },
  slotComponents: {},
};

test("imports top-level and nested Figma components while ignoring building blocks", () => {
  const records = parseFigmaComponentExport(exportFixture);
  assert.deepEqual(records.map((record) => `${record.type}:${record.name}`).sort(), [
    "Base:Eyebrow",
    "Module:Top stories",
    "Slot:Story card",
  ]);

  const module = records.find((record) => record.type === "Module");
  assert.equal(module.composition[0].componentId, "figma-slot-story-card");
  assert.equal(module.currentVersion, "1.0");
  assert.deepEqual(module.releaseHistory, []);
  assert.match(module.links.figma, /figma-file-key.*node-id=1-1/);
});

test("repeat imports preserve manually managed workflow fields", () => {
  const imported = parseFigmaComponentExport(exportFixture);
  const existingModule = {
    ...imported.find((record) => record.type === "Module"),
    status: "Ready",
    support: "Full",
    currentVersion: "2.0",
    releaseHistory: ["1.1", "1.0"],
    links: { jira: ["https://jira.example/MAPLE-1"] },
    notes: "Editor-authored note",
  };
  const result = mergeImportedComponents([existingModule], imported.filter((record) => record.type === "Module"));

  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.components[0].status, "Ready");
  assert.equal(result.components[0].support, "Full");
  assert.equal(result.components[0].currentVersion, "2.0");
  assert.deepEqual(result.components[0].releaseHistory, ["1.1", "1.0"]);
  assert.deepEqual(result.components[0].links.jira, ["https://jira.example/MAPLE-1"]);
  assert.equal(result.components[0].notes, "Editor-authored note");
  assert.match(result.components[0].links.figma, /figma-file-key/);
});

test("imports the component tracker export schema and links relationships by Figma node id", () => {
  const records = parseFigmaComponentExport({
    metadata: { generatedAt: "2026-08-18" },
    baseComponents: {
      "1:1": { name: "Title", category: "Base component", page: "Typography", composedOf: [], usedIn: [{ id: "2:2", name: "Story card", category: "Slot component" }] },
      "1:2": { name: "Building blocks/.frame", category: "Base component", page: "Frames", composedOf: [], usedIn: [] },
    },
    slotComponents: {
      "2:2": { name: "Story card", category: "Slot component", page: "Cards", composedOf: [{ id: "1:1", name: "Title", category: "Base component" }], usedIn: [] },
    },
    modules: {},
  });

  assert.deepEqual(records.map((record) => `${record.type}:${record.name}`).sort(), ["Base:Title", "Slot:Story card"]);
  const title = records.find((record) => record.name === "Title");
  const storyCard = records.find((record) => record.name === "Story card");
  assert.equal(storyCard.composition[0].componentId, title.id);
  assert.equal(storyCard.source.nodeId, "2:2");
  assert.equal(storyCard.updated, "Aug 18, 2026");
});

test("accepts consecutive JSON documents produced by the tracker export", () => {
  const source = [
    JSON.stringify({ metadata: { generatedAt: "2026-08-18" } }),
    JSON.stringify({ baseComponents: { "1:1": { name: "Title", category: "Base component", page: "Typography", composedOf: [], usedIn: [] } } }),
    JSON.stringify({ slotComponents: {} }),
    JSON.stringify({ modules: {} }),
  ].join("\n");
  const records = parseFigmaComponentExportText(source);
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Title");
});

test("keeps same-name Figma records with different node ids distinct", () => {
  const imported = parseFigmaComponentExport({
    metadata: { generatedAt: "2026-08-18" },
    baseComponents: {},
    slotComponents: {},
    modules: {
      "3:1": { name: "Infobox", category: "Module", page: "A", composedOf: [], usedIn: [] },
      "3:2": { name: "Infobox", category: "Module", page: "B", composedOf: [], usedIn: [] },
    },
  });
  const result = mergeImportedComponents([], imported);
  assert.equal(result.added, 2);
  assert.equal(result.components.length, 2);
});

test("remaps imported relationships to ids retained by existing records", () => {
  const imported = parseFigmaComponentExport({
    metadata: { generatedAt: "2026-08-18" },
    baseComponents: {
      "1:1": { name: "Title", category: "Base component", page: "Typography", composedOf: [], usedIn: [] },
    },
    slotComponents: {
      "2:2": { name: "Story card", category: "Slot component", page: "Cards", composedOf: [{ id: "1:1", name: "Title", category: "Base component" }], usedIn: [] },
    },
    modules: {},
  });
  const importedTitle = imported.find((record) => record.name === "Title");
  const existingTitle = { ...importedTitle, id: "legacy-title-id" };
  const result = mergeImportedComponents([existingTitle], imported);
  const storyCard = result.components.find((record) => record.name === "Story card");
  assert.equal(storyCard.composition[0].componentId, "legacy-title-id");
});

test("optionally preserves relationships marked as manually modified", () => {
  const imported = parseFigmaComponentExport(exportFixture);
  const incomingModule = imported.find((record) => record.type === "Module");
  const manualComposition = [{ name: "Manual dependency", kind: "Base", componentId: "manual-dependency" }];
  const existingModule = {
    ...incomingModule,
    composition: manualComposition,
    composedOf: ["Manual dependency"],
    relationshipsModified: true,
  };

  const preserved = mergeImportedComponents([existingModule], [incomingModule], { preserveManualRelationships: true });
  assert.deepEqual(preserved.components[0].composition, manualComposition);
  assert.equal(preserved.components[0].relationshipsModified, true);

  const replaced = mergeImportedComponents([existingModule], [incomingModule], { preserveManualRelationships: false });
  assert.notDeepEqual(replaced.components[0].composition, manualComposition);
  assert.equal(replaced.components[0].relationshipsModified, false);
});

test("imports a formatted Maple inventory backup without losing record data", () => {
  const component = {
    ...parseFigmaComponentExport(exportFixture)[0],
    status: "Ready",
    notes: "Keep this dashboard-authored note.",
    relationshipsModified: true,
  };
  const backup = JSON.stringify({
    metadata: { format: "maple-component-tracker", schemaVersion: 1, generatedAt: "2026-08-19" },
    components: [component],
  });
  const restored = parseFigmaComponentExportText(backup);
  assert.deepEqual(restored, [JSON.parse(JSON.stringify(component))]);
});
