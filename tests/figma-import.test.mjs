import assert from "node:assert/strict";
import test from "node:test";
import { mergeImportedComponents, parseFigmaComponentExport } from "../app/figma-import.ts";

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
  assert.match(module.links.figma, /figma-file-key.*node-id=1-1/);
});

test("repeat imports preserve manually managed workflow fields", () => {
  const imported = parseFigmaComponentExport(exportFixture);
  const existingModule = {
    ...imported.find((record) => record.type === "Module"),
    status: "Ready",
    support: "Full",
    links: { jira: ["https://jira.example/MAPLE-1"] },
    notes: "Editor-authored note",
  };
  const result = mergeImportedComponents([existingModule], imported.filter((record) => record.type === "Module"));

  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.components[0].status, "Ready");
  assert.equal(result.components[0].support, "Full");
  assert.deepEqual(result.components[0].links.jira, ["https://jira.example/MAPLE-1"]);
  assert.equal(result.components[0].notes, "Editor-authored note");
  assert.match(result.components[0].links.figma, /figma-file-key/);
});
