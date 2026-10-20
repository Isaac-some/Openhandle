import { expect, it } from "vitest";
import { nextNodePosition } from "./node-placement";

it("places the next node directly to the right when there is room", () => {
  const source = { id: "source", position: { x: 100, y: 200 } };
  expect(nextNodePosition(source, [source])).toEqual({ x: 310, y: 200 });
});
it("uses a lower lane only when the right-side position is occupied", () => {
  const source = { id: "source", position: { x: 100, y: 200 } };
  const occupied = [source, { id: "other", position: { x: 310, y: 200 } }, { id: "next", position: { x: 310, y: 365 } }];
  expect(nextNodePosition(source, occupied)).toEqual({ x: 310, y: 530 });
});
