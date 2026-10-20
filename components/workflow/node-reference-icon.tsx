import { Bot, FileOutput, GitBranch, ImageIcon, Layers, Play, Split, Video, Workflow } from "lucide-react";
import type { NodeReferenceIcon } from "./node-reference";

const icons = { workflow: Workflow, image: ImageIcon, bot: Bot, play: Play, output: FileOutput, split: Split, branch: GitBranch, video: Video, layers: Layers };
export function NodeReferenceGlyph({ icon, size = 15 }: { icon?: NodeReferenceIcon; size?: number }) {
  const Icon = icon ? icons[icon] : undefined;
  return Icon ? <Icon size={size} strokeWidth={1.7} aria-hidden="true" /> : null;
}
