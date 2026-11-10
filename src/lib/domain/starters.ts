import { newBlock, newCardSpec } from "./factory";
import type { CardSpec, CardTemplate } from "./types";

/** Built-in starter templates. They are plain card specs — no special "types". Built fresh so block ids are unique. */
export function starterTemplates(): CardTemplate[] {
  const dinnerChecklist = newBlock.checklist("Ingredients", ["Salmon", "Rice", "Broccoli", "Lemon"], "ingredients");
  const workTasks = newBlock.checklist("Tasks", ["Review inbox", "Team check-in", "Finish proposal"], "tasks");
  const morning = newBlock.checklist("A steady start", ["Drink water", "Stretch", "Breakfast", "Plan the day"], "steps");
  const exercise = newBlock.progress("Movement", 30, "min", 5);
  const reading = newBlock.progress("Reading", 20, "pages", 5);

  const mk = (id: string, name: string, description: string, spec: CardSpec): CardTemplate => ({
    id,
    ownerId: null,
    name,
    description,
    spec,
  });

  return [
    mk(
      "starter-morning",
      "Morning routine",
      "A checklist for a steady start.",
      newCardSpec({
        title: "Morning routine",
        summary: "A steady start",
        time: "07:30",
        cover: { kind: "preset", id: "dawn" },
        completion: { mode: "derived", blockIds: [morning.id] },
        blocks: [morning, newBlock.note("Reminder", "Keep the first 30 minutes *screen-free*.")],
      }),
    ),
    mk(
      "starter-work",
      "Work",
      "Task checklist and notes.",
      newCardSpec({
        title: "Work",
        summary: "Focus time",
        time: "09:00",
        endTime: "17:00",
        cover: { kind: "preset", id: "desk" },
        summarySource: { kind: "next-item", blockId: workTasks.id },
        blocks: [workTasks, newBlock.note("Notes", "")],
      }),
    ),
    mk(
      "starter-dinner",
      "Dinner",
      "Meal summary, ingredients and preparation notes.",
      newCardSpec({
        title: "Dinner",
        summary: "Baked salmon with rice and broccoli",
        time: "18:30",
        cover: { kind: "preset", id: "plate" },
        front: { showTime: true, showSummary: true, showProgress: false }, // ingredients are incidental
        blocks: [
          newBlock.note("Tonight’s plan", "Baked salmon with rice and broccoli."),
          dinnerChecklist,
          newBlock.note("Preparation", "Start the rice at 18:00."),
        ],
      }),
    ),
    mk(
      "starter-exercise",
      "Exercise",
      "Workout notes and a progress target.",
      newCardSpec({
        title: "Exercise",
        summary: "30-minute walk",
        time: "17:00",
        cover: { kind: "preset", id: "trail" },
        completion: { mode: "derived", blockIds: [exercise.id] },
        blocks: [newBlock.note("Workout", "Easy pace. Stretch afterwards."), exercise],
      }),
    ),
    mk(
      "starter-reading",
      "Reading",
      "Book notes and pages or minutes.",
      newCardSpec({
        title: "Reading",
        summary: "20 pages",
        time: "21:00",
        cover: { kind: "preset", id: "book" },
        summarySource: { kind: "progress", blockId: reading.id },
        completion: { mode: "derived", blockIds: [reading.id] },
        blocks: [newBlock.note("Book notes", "Currently reading: …"), reading],
      }),
    ),
  ];
}

export const defaultSections = () => [
  { id: "sec-morning", name: "Morning", icon: "sunrise" as const, from: "05:00", position: 0 },
  { id: "sec-afternoon", name: "Afternoon", icon: "sun" as const, from: "12:00", position: 1 },
  { id: "sec-evening", name: "Evening", icon: "moon" as const, from: "17:30", position: 2 },
];
