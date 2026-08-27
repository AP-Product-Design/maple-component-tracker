import type { ComponentRecord, ComponentType } from "./component-data";

export type GroupableComponentType = Extract<ComponentType, "Module" | "Slot">;

export type ComponentTableRow =
  | { kind: "component"; component: ComponentRecord }
  | { kind: "group"; key: string; name: string; type: GroupableComponentType; components: ComponentRecord[] };

export function isGroupableType(type: ComponentType): type is GroupableComponentType {
  return type === "Module" || type === "Slot";
}

export function componentGroupKey(type: GroupableComponentType, name: string): string {
  return `${type}:${name.trim().toLocaleLowerCase()}`;
}

export function buildComponentTableRows(components: ComponentRecord[]): ComponentTableRow[] {
  const rows: ComponentTableRow[] = [];
  const groups = new Map<string, Extract<ComponentTableRow, { kind: "group" }>>();

  for (const component of components) {
    const groupName = component.groupName?.trim();
    if (!groupName || !isGroupableType(component.type)) {
      rows.push({ kind: "component", component });
      continue;
    }

    const key = componentGroupKey(component.type, groupName);
    const existing = groups.get(key);
    if (existing) {
      existing.components.push(component);
      continue;
    }
    const group = { kind: "group" as const, key, name: groupName, type: component.type, components: [component] };
    groups.set(key, group);
    rows.push(group);
  }

  for (const group of groups.values()) group.components.sort((left, right) => left.name.localeCompare(right.name));
  return rows.sort((left, right) => {
    const leftName = left.kind === "group" ? left.name : left.component.name;
    const rightName = right.kind === "group" ? right.name : right.component.name;
    return leftName.localeCompare(rightName);
  });
}

export function rollupStatus(values: string[]): string {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : "Mixed";
}
