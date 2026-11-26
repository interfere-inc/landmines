import type { ESTree } from "@oxlint/plugins";

function isNode(value: unknown): value is ESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

export function containsNode(
  root: ESTree.Node,
  predicate: (node: ESTree.Node) => boolean,
) {
  const pending: ESTree.Node[] = [root];

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node) {
      break;
    }

    if (predicate(node)) {
      return true;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "parent") {
        continue;
      }

      if (Array.isArray(value)) {
        pending.push(...value.filter((item) => isNode(item)));
      } else if (isNode(value)) {
        pending.push(value);
      }
    }
  }

  return false;
}

export function enclosingStatement(node: ESTree.Node) {
  let current = node;

  while (current.parent) {
    const { parent } = current;

    if (parent.type === "BlockStatement" || parent.type === "Program") {
      return { block: parent, statement: current };
    }

    current = parent;
  }

  return null;
}
