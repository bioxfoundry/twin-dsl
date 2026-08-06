import type { TreeDocument, TreeNode } from "../core/types.js";
import { lines, unquote } from "./parser-util.js";

export function parseTreeDsl(source: string): TreeDocument {
  const xs = lines(source);
  const header = xs[0]?.match(/^TREE\s+(\S+)/);
  if (!header) throw new Error("TREE_HEADER_REQUIRED");
  const roots: TreeNode[] = [];
  const stack: { indent: number; node: TreeNode }[] = [];
  for (const raw of source.split(/\r?\n/).slice(1)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    const match = raw.trim().match(/^NODE\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (!match) continue;
    const node: TreeNode = {
      id: match[1],
      kind: match[2],
      label: unquote(match[3]),
      uri: `subactor://tree/${header[1]}/node/${match[1]}`,
      children: [],
    };
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    if (stack.length) {
      node.parentId = stack.at(-1)!.node.id;
      node.relation = "contains";
      stack.at(-1)!.node.children.push(node);
    } else roots.push(node);
    stack.push({ indent, node });
  }
  return { schema: "subactor.tree/v1", id: header[1], roots };
}

export function renderTreeDsl(tree: TreeDocument): string {
  const out = [`TREE ${tree.id}`];
  const walk = (node: TreeNode, depth: number): void => {
    out.push(`${"  ".repeat(depth)}NODE ${node.id} ${node.kind} "${node.label}"`);
    node.children.forEach((child) => walk(child, depth + 1));
  };
  tree.roots.forEach((root) => walk(root, 1));
  return out.join("\n");
}
