import assert from "node:assert/strict";
import test from "node:test";
import { buildComponentTableRows, isGroupableType, rollupStatus } from "../app/component-groups.ts";

function component(id, name, type, groupName) {
  return { id, name, type, groupName };
}

test("groups Module and Slot variants while leaving Base records unchanged", () => {
  const rows = buildComponentTableRows([
    component("image", "Carousel List B / Image", "Module", "Carousel List B"),
    component("text", "Carousel List B / Text", "Module", "Carousel List B"),
    component("title", "Title", "Base", "Typography"),
    component("card", "Story card", "Slot"),
  ]);

  const group = rows.find((row) => row.kind === "group");
  assert.equal(group.name, "Carousel List B");
  assert.deepEqual(group.components.map((item) => item.id), ["image", "text"]);
  assert.equal(rows.find((row) => row.kind === "component" && row.component.id === "title").component.groupName, "Typography");
  assert.equal(rows.filter((row) => row.kind === "component").length, 2);
  assert.equal(isGroupableType("Base"), false);
  assert.equal(isGroupableType("Slot"), true);
});

test("keeps groups with the same name separate by component type", () => {
  const rows = buildComponentTableRows([
    component("module", "Feature / Module", "Module", "Feature"),
    component("slot", "Feature / Slot", "Slot", "Feature"),
  ]);
  assert.equal(rows.filter((row) => row.kind === "group").length, 2);
});

test("rolls shared statuses up and reports differing values as Mixed", () => {
  assert.equal(rollupStatus(["Ready", "Ready"]), "Ready");
  assert.equal(rollupStatus(["Ready", "In design"]), "Mixed");
});
