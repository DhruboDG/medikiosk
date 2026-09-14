/* Where the intake Back control may go from a given question. Pure, so the
   rules can be tested without rendering the page.

   The chief complaint is locked: it is the patient's own account and it picks
   the branch. Back never lands on it. Back also never lands on any other node
   whose answer can change the path (a node with next.when), because an edit
   there would leave answers from the old branch behind. Those nodes stay
   locked until a decision is made on how to handle them. */

import type { Answer, HistoryNode } from "./types.ts";
import { MULTI_SEPARATOR } from "./ontology.ts";

export type BackTarget =
  /* No Back on this screen: the chief complaint, or the first follow-up.
     The first follow-up would lead back to name, age and gender, which are
     already saved and have no route to change them. Start over is the way
     out for a mistyped name or age. */
  | { kind: "none" }
  /* The previous question can change the branch, so it is not reopened. */
  | { kind: "locked"; nodeId: string }
  /* Reopen the answered question at this index of the path. */
  | { kind: "node"; index: number };

/** True when the answer to this node can change which node comes next. */
export function branchesOn(node: HistoryNode): boolean {
  return (node.next?.when?.length ?? 0) > 0;
}

/** `path` is the answered path, `index` the position of the question on screen (path.length for the pending one). */
export function backTarget(path: HistoryNode[], index: number): BackTarget {
  if (index <= 1) return { kind: "none" };
  const previous = path[index - 1];
  if (!previous) return { kind: "none" };
  if (branchesOn(previous)) return { kind: "locked", nodeId: previous.id };
  return { kind: "node", index: index - 1 };
}

/** Option ids a stored tap answer selected, so a reopened question shows them pre-selected. */
export function selectedOptionIds(node: HistoryNode, answer: Answer | undefined): string[] {
  if (!answer) return [];
  const values = String(answer.value ?? "").split(MULTI_SEPARATOR).map((v) => v.trim());
  return (node.options ?? []).filter((o) => values.includes(o.value)).map((o) => o.id);
}
