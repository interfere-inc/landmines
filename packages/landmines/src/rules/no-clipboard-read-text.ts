import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { z } from "zod";

const browserTest = /\.browser\.test\.[cm]?[jt]sx?$/u;

function propertyName(node: ESTree.MemberExpression) {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }

  if (node.property.type !== "Literal") {
    return;
  }

  const parsed = z.string().safeParse(node.property.value);

  return parsed.success ? parsed.data : undefined;
}

function isNavigator(node: ESTree.Node) {
  if (node.type === "Identifier") {
    return node.name === "navigator";
  }

  return (
    node.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    (node.object.name === "globalThis" || node.object.name === "window") &&
    propertyName(node) === "navigator"
  );
}

function isClipboardRead(node: ESTree.MemberExpression) {
  return (
    propertyName(node) === "readText" &&
    node.object.type === "MemberExpression" &&
    propertyName(node.object) === "clipboard" &&
    isNavigator(node.object.object)
  );
}

export const noClipboardReadText = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: {
      description:
        "Disallow navigator.clipboard.readText() in browser-mode test files, which share one Chromium clipboard across parallel iframes.",
    },
    messages: {
      read: "navigator.clipboard.readText() reads the Chromium context's clipboard, which every parallel browser test file in this project shares, so a sibling file's copy between the write and this read wins. Assert the copy through the vi.spyOn(navigator.clipboard, 'writeText') call and its resolved result instead.",
    },
  },
  create(context) {
    if (!browserTest.test(context.physicalFilename)) {
      return {};
    }

    return {
      MemberExpression(node) {
        if (isClipboardRead(node)) {
          context.report({ node, messageId: "read" });
        }
      },
    };
  },
});
