/** Core domain model. Dates are plain "YYYY-MM-DD" strings in the user's timezone; times are "HH:MM". */

export type ID = string;
export type DateStr = string;
export type TimeStr = string;

export type Role = "owner" | "editor" | "viewer";
export type Density = "compact" | "comfortable";
/** How one card is drawn today. */
export type Presentation = Density | "cover";
export type CompletionMode = "together" | "individual";

export interface Profile {
  id: ID;
  name: string;
  email?: string;
  /** True for simulated members that only exist in local demo data. */
  demo?: boolean;
}

export interface Prefs {
  timezone: string;
  defaultDensity: Density;
}

/** Personal day sections (Morning, Afternoon, ...). `from` is only used to auto-place new timed cards. */
export interface Section {
  id: ID;
  name: string;
  icon: "sunrise" | "sun" | "moon" | "star" | "none";
  from?: TimeStr;
  position: number;
}

// ---------- Blocks (definitions only; progress lives in ProgressState) ----------
export interface NoteBlock {
  id: ID;
  type: "note";
  title: string;
  text: string;
}
export interface ChecklistItem {
  id: ID;
  text: string;
}
export interface ChecklistBlock {
  id: ID;
  type: "checklist";
  title: string;
  items: ChecklistItem[];
  /** noun used in "2 of 5 tasks" */
  noun?: string;
}
export interface ProgressBlock {
  id: ID;
  type: "progress";
  title: string;
  target: number;
  unit: string;
  step: number;
}
export interface Assignment {
  id: ID;
  label: string;
  userId: ID | null;
}
export interface ResponsibilityBlock {
  id: ID;
  type: "responsibility";
  title: string;
  assignments: Assignment[];
}
export type Block = NoteBlock | ChecklistBlock | ProgressBlock | ResponsibilityBlock;
export type BlockType = Block["type"];

export type Cover =
  | { kind: "none" }
  | { kind: "preset"; id: string }
  | { kind: "url"; url: string }
  /** A photo the person uploaded. `path` is "<uploader id>/<image id>.jpg" in private image storage. */
  | { kind: "upload"; path: string }
  | { kind: "color"; color: string };

export interface FrontConfig {
  showTime: boolean;
  showSummary: boolean;
  showProgress: boolean;
  /** Shared cards: show the group (and, if chosen, one person) on the front. Absent = on. */
  showPeople?: boolean;
  /** The one responsibility to feature next to the group name. Absent = group name only (never guessed). */
  personAssignmentId?: ID;
  /**
   * Which tracking blocks feed the front-of-card progress line. Absent = every tracking block the completion rule uses.
   * Purely presentational: it never changes whether the card is complete.
   */
  progressBlockIds?: ID[];
}

export type Completion =
  | { mode: "manual" }
  /** Complete when every listed tracking block is complete. */
  | { mode: "derived"; blockIds: ID[] };

/** Where the one-line summary on a card's front comes from. Absent = the text the user wrote. */
export type SummarySource = { kind: "text" } | { kind: "next-item"; blockId: ID } | { kind: "progress"; blockId: ID } | { kind: "note"; blockId: ID };

/** Where the cover is looking: a focal point (0–1 of the image) and a zoom (≥ 1), shared by every presentation. */
export interface Focus {
  x: number;
  y: number;
  zoom: number;
}

/** Everything that describes how a card looks and what it contains. Shared by templates, routines and dated cards. */
export interface CardSpec {
  title: string;
  summary: string;
  summarySource?: SummarySource;
  /** Optional short detail shown before the summary: a project, route, book title… */
  context?: string;
  /** Framing of the cover image. Absent = centred. */
  focus?: Focus;
  /** "cover" = larger photographic card. Absent = follow `density`. */
  style?: "cover";
  cover: Cover;
  accent: string;
  /** Activity icon key (see lib/ui/activity.ts). Absent = chosen from the title. */
  icon?: string;
  density: Density;
  time?: TimeStr;
  endTime?: TimeStr;
  front: FrontConfig;
  completion: Completion;
  blocks: Block[];
}

export interface CardTemplate {
  id: ID;
  ownerId: ID | null; // null = built-in starter
  name: string;
  description?: string;
  spec: CardSpec;
}

export interface Recurrence {
  kind: "daily" | "weekdays";
  /** 0 = Sunday … 6 = Saturday. Used when kind === "weekdays". */
  weekdays: number[];
  start: DateStr;
  end?: DateStr;
}

/** A recurring routine. Instances are materialised per date as independent snapshots. */
export interface Series {
  id: ID;
  ownerId: ID;
  spec: CardSpec;
  rule: Recurrence;
  sectionId?: ID | null;
  rev: number;
}

/** A dated card. Content is a snapshot, so later template/routine edits never rewrite it. */
export interface CardInstance {
  id: ID;
  ownerId: ID;
  groupId: ID | null;
  seriesId: ID | null;
  date: DateStr;
  spec: CardSpec;
  completionMode: CompletionMode;
  skipped: boolean;
  rev: number;
  updatedAt: string;
  updatedBy: ID;
}

export interface ProgressState {
  completed: boolean;
  checks: Record<ID, boolean>;
  values: Record<ID, number>;
}
export type Scope = "shared" | ID;
export interface ProgressRecord {
  instanceId: ID;
  /** "shared" for complete-together group cards; otherwise a user id. */
  scope: Scope;
  state: ProgressState;
  rev: number;
}

/** Per-user presentation. Changing it never affects another member's day. */
export interface Placement {
  instanceId: ID;
  userId: ID;
  sectionId: ID | null;
  position: number;
  hidden: boolean;
  density?: Density;
}

export interface LayoutEntry {
  id: ID;
  spec: CardSpec;
  sectionId: ID | null;
}
export interface DayLayout {
  id: ID;
  ownerId: ID;
  name: string;
  /** Weekdays (0–6) on which the layout is applied automatically to today/future days. */
  autoApply: number[];
  entries: LayoutEntry[];
}

export interface Group {
  id: ID;
  name: string;
  ownerId: ID;
}
export interface Member {
  groupId: ID;
  userId: ID;
  role: Role;
}
export interface Invitation {
  id: ID;
  groupId: ID;
  groupName?: string;
  email: string;
  role: Exclude<Role, "owner">;
  status: "pending" | "accepted" | "revoked" | "declined";
  invitedBy: ID;
  createdAt: string;
}

export interface Workspace {
  me: Profile;
  prefs: Prefs;
  sections: Section[];
  templates: CardTemplate[];
  series: Series[];
  layouts: DayLayout[];
  groups: Group[];
  members: Member[];
  profiles: Profile[];
  /** Invitations I sent (owner) and invitations addressed to my email. */
  invitations: Invitation[];
}

export interface DayData {
  instances: CardInstance[];
  progress: ProgressRecord[];
  placements: Placement[];
}

export class ConflictError extends Error {
  constructor(message = "This item was changed by someone else.") {
    super(message);
    this.name = "ConflictError";
  }
}
export class PermissionError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}
