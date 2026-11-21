import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const classAttribute = /^(?:class|className|\w+ClassName)$/u;
const containerUtility = /^!?@container(?:-size)?(?:\/(?<name>[\w-]+))?!?$/u;
const queryName = /\/(?<name>[\w-]+)$/u;

function segments(token: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < token.length; index += 1) {
    const character = token.charAt(index);

    if (character === "[" || character === "(") {
      depth += 1;
    } else if (character === "]" || character === ")") {
      depth -= 1;
    } else if (character === ":" && depth === 0) {
      parts.push(token.slice(start, index));

      start = index + 1;
    }
  }

  parts.push(token.slice(start));

  return parts;
}

function selfQueries(classes: string) {
  const containers = new Set<string>();
  const queries: { variant: string; name: string }[] = [];

  for (const token of classes.split(/\s+/u).filter(Boolean)) {
    const parts = segments(token);
    const utility = parts.pop() ?? "";
    const container = containerUtility.exec(utility);

    if (container) {
      containers.add(container.groups?.["name"] ?? "");
    }

    for (const variant of parts) {
      if (variant.startsWith("@")) {
        queries.push({
          variant,
          name: queryName.exec(variant)?.groups?.["name"] ?? "",
        });
      }
    }
  }

  if (containers.size === 0) {
    return [];
  }

  return queries.filter(({ name }) => name === "" || containers.has(name));
}

function classAttributeOf(node: ESTree.Node) {
  let current: ESTree.Node | null = node.parent;

  while (current) {
    if (current.type === "JSXAttribute") {
      return current.name.type === "JSXIdentifier" &&
        classAttribute.test(current.name.name)
        ? current
        : null;
    }

    if (current.type === "JSXElement" || current.type === "JSXFragment") {
      return null;
    }

    current = current.parent;
  }

  return null;
}

export const noSelfContainerQuery = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: {
      description:
        "Disallow container query variants on the element that declares the container.",
    },
    messages: {
      selfQuery:
        "{{variant}}: never matches this element's own @container; it queries an ancestor container. Move @container to a wrapper element.",
    },
  },
  create(context) {
    const classes = new Map<ESTree.JSXAttribute, string[]>();

    function collect(node: ESTree.Node, value: string | null | undefined) {
      const attribute = classAttributeOf(node);

      if (attribute && value) {
        classes.set(attribute, [...(classes.get(attribute) ?? []), value]);
      }
    }

    return {
      Literal(node) {
        collect(node, String(node.value));
      },
      TemplateElement(node) {
        collect(node, node.value.cooked);
      },
      "Program:exit"() {
        for (const [attribute, values] of classes) {
          const variants = new Set(
            selfQueries(values.join(" ")).map(({ variant }) => variant),
          );

          for (const variant of variants) {
            context.report({
              node: attribute,
              messageId: "selfQuery",
              data: { variant },
            });
          }
        }
      },
    };
  },
});
