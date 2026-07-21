import type { LessonPack } from "../types";

export function injectBrokenTarget(pack: LessonPack): LessonPack {
  return {
    ...structuredClone(pack),
    manipulative: {
      ...structuredClone(pack.manipulative),
      target: pack.manipulative.target === "0/1" ? "1/1" : "0/1",
    },
  };
}
