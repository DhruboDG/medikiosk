/* Physician-facing view of the Dashavidha Pariksha answers captured during an
   AYUSH intake, grouped by parameter. This renders the patient's own words
   only — no scoring, no dosha result, nothing computed from the answers.
   The vaidya reads the record and interprets it. */

import { AYUSH_DISCLAIMER, findNode, loadTree } from "../lib/ontology.ts";
import type { Localised, Session } from "../lib/types.ts";

/* Node id prefix -> the Dashavidha Pariksha parameter it belongs to, in the
   order named in the problem statement, plus Ahara-Vihara. Order here is the
   display order, independent of the order the patient answered in. */
const PARAMETER_GROUPS: { prefix: string; label: Localised }[] = [
  { prefix: "ayush_prakriti", label: { en: "Prakriti (constitution)", hi: "प्रकृति" } },
  { prefix: "ayush_vikriti", label: { en: "Vikriti (current state)", hi: "विकृति" } },
  { prefix: "ayush_sara", label: { en: "Sara (tissue quality)", hi: "सार" } },
  { prefix: "ayush_samhanana", label: { en: "Samhanana (body compactness)", hi: "संहनन" } },
  { prefix: "ayush_pramana", label: { en: "Pramana (body proportions)", hi: "प्रमाण" } },
  { prefix: "ayush_satmya", label: { en: "Satmya (suitability)", hi: "सात्म्य" } },
  { prefix: "ayush_sattva", label: { en: "Sattva (mental strength)", hi: "सत्त्व" } },
  { prefix: "ayush_ahara_shakti", label: { en: "Ahara Shakti (digestive capacity)", hi: "आहार शक्ति" } },
  { prefix: "ayush_vyayama_shakti", label: { en: "Vyayama Shakti (exercise capacity)", hi: "व्यायाम शक्ति" } },
  { prefix: "ayush_vaya", label: { en: "Vaya (age or life stage)", hi: "वय" } },
  { prefix: "ayush_ahara_vihara", label: { en: "Ahara-Vihara (diet and lifestyle)", hi: "आहार-विहार" } },
];

export default function AyushPanel({ session }: { session: Session }) {
  const tree = loadTree("ayush");
  const rows = session.answers
    .map((answer) => ({ answer, node: findNode(tree, answer.nodeId) }))
    .filter((row) => row.node?.section === "ayush");

  const groups = PARAMETER_GROUPS.map((group) => ({
    label: group.label,
    items: rows
      .filter((row) => row.node!.id.startsWith(group.prefix))
      .map((row) => ({ prompt: row.node!.prompt, said: row.answer.raw || row.answer.value })),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="border border-gray-300 rounded-xl px-4 py-3 flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold">Dashavidha Pariksha</h2>
        <p className="text-sm text-gray-700 mt-1">{AYUSH_DISCLAIMER.en}</p>
        <p className="text-sm text-gray-700">{AYUSH_DISCLAIMER.hi}</p>
      </div>

      {groups.length === 0 && (
        <p className="text-gray-500">No Dashavidha Pariksha answers were recorded in this session.</p>
      )}

      {groups.map((group) => (
        <div key={group.label.en} className="flex flex-col gap-1">
          <h3 className="font-semibold">
            {group.label.en} <span className="text-gray-500 font-normal">· {group.label.hi}</span>
          </h3>
          <ul className="list-disc list-inside flex flex-col gap-1">
            {group.items.map((item, i) => (
              <li key={i}>
                <span className="text-gray-600">{item.prompt.en}</span>
                {": "}
                <span className="font-medium">{item.said}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
