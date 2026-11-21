"use client";
import { useMemo } from "react";
import type { DayCard } from "@/lib/domain/dayview";
import { cardProgress, emptyState, resolveSummary } from "@/lib/domain/progress";
import type { CardInstance, CardSpec, ID, Presentation } from "@/lib/domain/types";
import { useT } from "@/lib/i18n";
import { useApp } from "@/store/app";
import { CardFront } from "./ActivityCard";

/** Live preview of a card's front while editing. Inert: it can't be clicked, focused or ticked. */
export function CardPreview({ spec, groupId }: { spec: CardSpec; groupId: ID | null }) {
  const t = useT();
  const ws = useApp((s) => s.ws)!;
  const card = useMemo<DayCard>(() => {
    const me = ws.me.id;
    const state = emptyState();
    const instance: CardInstance = { id: "preview", ownerId: me, groupId, seriesId: null, date: "", spec: { ...spec, title: spec.title || t("Untitled") }, completionMode: "together", skipped: false, rev: 1, updatedAt: "", updatedBy: me };
    const density = spec.density === "compact" ? "compact" : ws.prefs.defaultDensity;
    const presentation: Presentation = spec.style === "cover" ? "cover" : density;
    return {
      instance,
      placement: { instanceId: "preview", userId: me, sectionId: null, position: 0, hidden: false },
      state,
      progress: cardProgress(instance.spec, state),
      summary: resolveSummary(instance.spec, state),
      density,
      presentation,
      canEdit: false,
      canProgress: false,
      others: [],
    };
  }, [spec, groupId, ws, t]);
  return (
    <section aria-label={t("Card preview")}>
      <h3 className="mb-1.5 text-sm font-medium text-muted">{t("Preview")}</h3>
      <div inert>
        <CardFront card={card} ws={ws} onFlip={() => {}} flipRef={{ current: null }} />
      </div>
    </section>
  );
}
