type PositionedNode = { id: string; position: { x: number; y: number }; parentId?: string };

export function nextNodePosition(source: PositionedNode, nodes: PositionedNode[]) {
  const x = source.position.x + 210;
  let y = source.position.y;
  while (nodes.some((node) => !node.parentId && Math.abs(node.position.x - x) < 190 && Math.abs(node.position.y - y) < 140)) y += 165;
  return { x, y };
}
