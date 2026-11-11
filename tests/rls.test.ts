import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migrations in an in-process Postgres (PGlite) and exercises the row-level security policies
 * as different authenticated users. Supabase's `auth` schema is shimmed (uid()/jwt() read request.jwt.claims).
 */
const A = "00000000-0000-4000-8000-00000000000a"; // owner
const B = "00000000-0000-4000-8000-00000000000b"; // editor
const C = "00000000-0000-4000-8000-00000000000c"; // viewer
const D = "00000000-0000-4000-8000-00000000000d"; // outsider
const emails: Record<string, string> = { [A]: "a@x.se", [B]: "b@x.se", [C]: "c@x.se", [D]: "d@x.se" };
const G = "10000000-0000-4000-8000-000000000001";
const PRIV = "20000000-0000-4000-8000-000000000001";
const SHARED_T = "20000000-0000-4000-8000-000000000002";
const SHARED_I = "20000000-0000-4000-8000-000000000003";

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${user ? JSON.stringify({ sub: user, email: emails[user] }) : ""}', false); set role ${user ? "authenticated" : "anon"};`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const q = (sql: string, params?: unknown[]) => db.query(sql, params);
const denied = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow(/row-level security|permission denied|42501|not valid|only the creator|owner cannot/i);
};
const spec = JSON.stringify({ title: "x", blocks: [] });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
    -- minimal shim of Supabase Storage so the real photo policies can be exercised
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, delete on storage.objects to authenticated; grant select on storage.objects to anon;
  `);
  const dir = join(process.cwd(), "supabase/migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  for (const [id, email] of Object.entries(emails)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);

  // A creates the group; B (editor) and C (viewer) are invited and accept; D is an outsider
  await as(A, async () => {
    await q("insert into groups (id, name, owner_id) values ($1, 'Family', $2)", [G, A]);
    await q("insert into group_invitations (group_id, email, role, invited_by) values ($1, 'b@x.se', 'editor', $2), ($1, 'c@x.se', 'viewer', $2)", [G, A]);
  });
  for (const u of [B, C]) {
    await as(u, async () => {
      const inv = await q("select id from my_invitations()");
      expect(inv.rows).toHaveLength(1);
      await q("select respond_invitation($1, true)", [(inv.rows[0] as { id: string }).id]);
    });
  }
  await as(A, async () => {
    await q("insert into card_instances (id, owner_id, date, spec) values ($1, $2, '2026-11-10', $3)", [PRIV, A, spec]);
    await q("insert into card_instances (id, owner_id, group_id, date, spec, completion_mode) values ($1, $2, $3, '2026-11-10', $4, 'individual')", [SHARED_I, A, G, spec]);
    await q("insert into card_instances (id, owner_id, group_id, date, spec, completion_mode) values ($1, $2, $3, '2026-11-10', $4, 'together')", [SHARED_T, A, G, spec]);
  });
});

describe("RLS: private card photos", () => {
  const privPath = `${A}/priv.jpg`;
  const sharedPath = `${A}/shared.jpg`;
  const loosePath = `${A}/loose.jpg`;
  const put = (path: string) => q("insert into storage.objects (bucket_id, name) values ('card-images', $1)", [path]);
  const visibleTo = async (u: string | null, path: string) => as(u, async () => (await q("select name from storage.objects where name = $1", [path])).rows.length === 1);

  beforeAll(async () => {
    await as(A, async () => {
      await put(privPath);
      await put(sharedPath);
      await put(loosePath);
      // dedicated fixture cards, so other suites' cards (and their rev counters) are untouched
      await q("insert into card_instances (id, owner_id, date, spec) values ($1, $2, '2026-11-12', $3)", ["20000000-0000-4000-8000-0000000000a1", A, JSON.stringify({ title: "p", blocks: [], cover: { kind: "upload", path: privPath } })]);
      await q("insert into card_instances (id, owner_id, group_id, date, spec) values ($1, $2, $3, '2026-11-12', $4)", ["20000000-0000-4000-8000-0000000000a2", A, G, JSON.stringify({ title: "s", blocks: [], cover: { kind: "upload", path: sharedPath } })]);
    });
  });

  afterAll(async () => {
    await as(A, async () => void (await q("delete from card_instances where id in ('20000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a2')")));
  });

  it("the bucket is private and capped", async () => {
    const r = await q("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'card-images'");
    expect(r.rows[0]).toMatchObject({ public: false, file_size_limit: 2097152 });
  });
  it("the uploader can always read their own photos", async () => {
    for (const p of [privPath, sharedPath, loosePath]) expect(await visibleTo(A, p)).toBe(true);
  });
  it("a photo on a private card (or on no card) is invisible to everyone else, even with the exact path", async () => {
    for (const u of [B, C, D, null]) {
      expect(await visibleTo(u, privPath)).toBe(false);
      expect(await visibleTo(u, loosePath)).toBe(false);
    }
  });
  it("a photo used by a group card is readable by members only (editor and viewer), not outsiders", async () => {
    expect(await visibleTo(B, sharedPath)).toBe(true);
    expect(await visibleTo(C, sharedPath)).toBe(true);
    expect(await visibleTo(D, sharedPath)).toBe(false);
    expect(await visibleTo(null, sharedPath)).toBe(false);
  });
  it("deleting the card closes everyone else’s access again", async () => {
    const TMP = "20000000-0000-4000-8000-000000000009";
    const tmpPath = `${A}/tmp.jpg`;
    await as(A, async () => {
      await put(tmpPath);
      await q("insert into card_instances (id, owner_id, group_id, date, spec) values ($1, $2, $3, '2026-11-11', $4)", [TMP, A, G, JSON.stringify({ title: "t", blocks: [], cover: { kind: "upload", path: tmpPath } })]);
    });
    expect(await visibleTo(B, tmpPath)).toBe(true);
    await as(A, async () => void (await q("delete from card_instances where id = $1", [TMP])));
    expect(await visibleTo(B, tmpPath)).toBe(false);
    expect(await visibleTo(A, tmpPath)).toBe(true);
  });
  it("people can only upload into their own folder, and only the owner can delete", async () => {
    await as(B, async () => {
      await denied(put(`${A}/evil.jpg`));
      await put(`${B}/mine.jpg`);
    });
    await as(B, async () => expect((await q("delete from storage.objects where name = $1 returning name", [sharedPath])).rows).toHaveLength(0));
    await as(D, async () => await denied(put(`${B}/x.jpg`)));
  });
});

describe("RLS: private data", () => {
  it("a private card is invisible and immutable to everyone else, even with its id", async () => {
    for (const u of [B, C, D]) {
      await as(u, async () => {
        expect((await q("select id from card_instances where id = $1", [PRIV])).rows).toHaveLength(0);
        expect((await q("update card_instances set skipped = true where id = $1 returning id", [PRIV])).rows).toHaveLength(0);
        expect((await q("delete from card_instances where id = $1 returning id", [PRIV])).rows).toHaveLength(0);
        await denied(q("insert into card_progress (instance_id, scope) values ($1, $2)", [PRIV, u]));
        await denied(q("insert into placements (instance_id, user_id) values ($1, $2)", [PRIV, u]));
      });
    }
    await as(A, async () => expect((await q("select id from card_instances where id = $1", [PRIV])).rows).toHaveLength(1));
  });
  it("personal library rows are owner-only", async () => {
    await as(A, async () => {
      await q("insert into card_templates (id, owner_id, name, spec) values ($1, $2, 't', $3)", ["30000000-0000-4000-8000-000000000001", A, spec]);
    });
    await as(B, async () => expect((await q("select * from card_templates")).rows).toHaveLength(0));
    await as(B, () => denied(q("insert into card_templates (id, owner_id, name, spec) values ($1, $2, 't', $3)", ["30000000-0000-4000-8000-000000000002", A, spec])));
  });
  it("anonymous users can read nothing", async () => {
    await as(null, () => denied(q("select * from card_instances")));
  });
  it("users can't create cards on behalf of others or in groups they can't edit", async () => {
    await as(B, () => denied(q("insert into card_instances (id, owner_id, date, spec) values ($1, $2, '2026-11-10', $3)", ["40000000-0000-4000-8000-000000000001", A, spec])));
    await as(C, () => denied(q("insert into card_instances (id, owner_id, group_id, date, spec) values ($1, $2, $3, '2026-11-10', $4)", ["40000000-0000-4000-8000-000000000002", C, G, spec])));
    await as(D, () => denied(q("insert into card_instances (id, owner_id, group_id, date, spec) values ($1, $2, $3, '2026-11-10', $4)", ["40000000-0000-4000-8000-000000000003", D, G, spec])));
  });
});

describe("RLS: shared group cards", () => {
  it("members see shared cards, outsiders do not", async () => {
    for (const u of [A, B, C]) await as(u, async () => expect((await q("select id from card_instances where group_id = $1", [G])).rows).toHaveLength(2));
    await as(D, async () => expect((await q("select id from card_instances where group_id = $1", [G])).rows).toHaveLength(0));
    await as(D, async () => expect((await q("select * from groups")).rows).toHaveLength(0));
    await as(D, async () => expect((await q("select * from group_members")).rows).toHaveLength(0));
  });
  it("editors edit shared content; viewers can't; rev is bumped for conflict detection", async () => {
    await as(B, async () => {
      const r = await q("update card_instances set spec = $2 where id = $1 returning rev", [SHARED_I, JSON.stringify({ title: "edited", blocks: [] })]);
      expect(r.rows).toHaveLength(1);
      expect((r.rows[0] as { rev: number }).rev).toBe(2);
      // stale optimistic update (rev = 1) matches nothing
      expect((await q("update card_instances set skipped = true where id = $1 and rev = 1 returning id", [SHARED_I])).rows).toHaveLength(0);
    });
    await as(C, async () => expect((await q("update card_instances set spec = $2 where id = $1 returning id", [SHARED_I, spec])).rows).toHaveLength(0));
    await as(C, async () => expect((await q("delete from card_instances where id = $1 returning id", [SHARED_I])).rows).toHaveLength(0));
  });
  it("only the creator can change sharing", async () => {
    await as(B, () => denied(q("update card_instances set group_id = null where id = $1", [SHARED_I])));
    await as(A, async () => {
      await q("update card_instances set group_id = null where id = $1", [SHARED_I]);
      await q("update card_instances set group_id = $2 where id = $1", [SHARED_I, G]);
    });
  });
  it("complete-together: one shared record, writable by editors only", async () => {
    await as(B, async () => {
      await q("select patch_progress($1, 'shared', '{\"completed\":true}')", [SHARED_T]);
      await q("select patch_progress($1, 'shared', '{\"checks\":{\"i1\":true}}')", [SHARED_T]);
    });
    await as(A, async () => {
      await q("select patch_progress($1, 'shared', '{\"checks\":{\"i2\":true}}')", [SHARED_T]);
      const r = await q("select state from card_progress where instance_id = $1 and scope = 'shared'", [SHARED_T]);
      expect((r.rows[0] as { state: unknown }).state).toEqual({ completed: true, checks: { i1: true, i2: true }, values: {} }); // merged, not overwritten
    });
    await as(C, async () => {
      expect((await q("select * from card_progress where instance_id = $1", [SHARED_T])).rows).toHaveLength(1); // can read
      await denied(q("select patch_progress($1, 'shared', '{\"completed\":false}')", [SHARED_T]));
    });
    await as(A, () => denied(q("select patch_progress($1, $2, '{\"completed\":true}')", [SHARED_T, A]))); // wrong scope for this mode
  });
  it("each-person-completes: everyone, viewers included, writes only their own scope", async () => {
    for (const u of [A, B, C]) await as(u, () => q("select patch_progress($1, $2, '{\"completed\":true}')", [SHARED_I, u]));
    await as(C, async () => {
      await denied(q("select patch_progress($1, $2, '{\"completed\":false}')", [SHARED_I, A])); // someone else's scope
      await denied(q("select patch_progress($1, 'shared', '{\"completed\":false}')", [SHARED_I]));
      expect((await q("select scope from card_progress where instance_id = $1", [SHARED_I])).rows).toHaveLength(3);
    });
    await as(D, async () => {
      expect((await q("select * from card_progress")).rows).toHaveLength(0);
      await denied(q("select patch_progress($1, $2, '{\"completed\":true}')", [SHARED_I, D]));
    });
  });
  it("placement is per user and can't be written for others", async () => {
    await as(B, () => q("insert into placements (instance_id, user_id, position, hidden) values ($1, $2, 3, true)", [SHARED_I, B]));
    await as(A, async () => {
      expect((await q("select * from placements where instance_id = $1", [SHARED_I])).rows).toHaveLength(0); // B's presentation isn't visible to A
      await denied(q("insert into placements (instance_id, user_id) values ($1, $2)", [SHARED_I, B]));
      await q("insert into placements (instance_id, user_id, position) values ($1, $2, 0)", [SHARED_I, A]);
    });
    await as(B, async () => expect(((await q("select hidden from placements where instance_id = $1", [SHARED_I])).rows[0] as { hidden: boolean }).hidden).toBe(true));
    await as(D, () => denied(q("insert into placements (instance_id, user_id) values ($1, $2)", [SHARED_I, D])));
  });
  it("one generated occurrence per routine per day", async () => {
    const S = "50000000-0000-4000-8000-000000000001";
    await as(A, async () => {
      await q("insert into series (id, owner_id, spec, rule) values ($1, $2, $3, '{}')", [S, A, spec]);
      await q("insert into card_instances (id, owner_id, series_id, date, spec) values ($1, $2, $3, '2026-11-11', $4)", ["50000000-0000-4000-8000-000000000002", A, S, spec]);
      await expect(q("insert into card_instances (id, owner_id, series_id, date, spec) values ($1, $2, $3, '2026-11-11', $4)", ["50000000-0000-4000-8000-000000000003", A, S, spec])).rejects.toThrow(/duplicate|unique/i);
    });
  });
});

describe("RLS: groups, invitations", () => {
  it("only the owner manages members and invitations", async () => {
    await as(B, () => denied(q("insert into group_invitations (group_id, email, role, invited_by) values ($1, 'z@x.se', 'viewer', $2)", [G, B])));
    await as(B, async () => expect((await q("update group_members set role = 'viewer' where group_id = $1 and user_id = $2 returning *", [G, C])).rows).toHaveLength(0));
    await as(B, async () => expect((await q("delete from group_members where group_id = $1 and user_id = $2 returning *", [G, C])).rows).toHaveLength(0));
    await as(A, () => denied(q("update group_members set role = 'owner' where group_id = $1 and user_id = $2", [G, B]))); // no promotion to owner
    await as(B, async () => expect((await q("update groups set name = 'x' where id = $1 returning id", [G])).rows).toHaveLength(0));
    await as(B, async () => expect((await q("delete from groups where id = $1 returning id", [G])).rows).toHaveLength(0));
  });
  it("invitations are accepted only by the addressed email and are revocable", async () => {
    let invId = "";
    await as(A, async () => {
      invId = ((await q("insert into group_invitations (group_id, email, role, invited_by) values ($1, 'd@x.se', 'viewer', $2) returning id", [G, A])).rows[0] as { id: string }).id;
    });
    await as(C, () => denied(q("select respond_invitation($1, true)", [invId]))); // wrong person, even knowing the id
    await as(C, async () => expect((await q("select * from group_invitations")).rows).toHaveLength(0));
    await as(A, async () => await q("update group_invitations set status = 'revoked' where id = $1", [invId]));
    await as(D, () => denied(q("select respond_invitation($1, true)", [invId]))); // revoked
    await as(A, async () => {
      invId = ((await q("insert into group_invitations (group_id, email, role, invited_by) values ($1, 'd@x.se', 'editor', $2) returning id", [G, A])).rows[0] as { id: string }).id;
    });
    await as(D, async () => {
      await q("select respond_invitation($1, true)", [invId]);
      expect(((await q("select role from group_members where user_id = $1", [D])).rows[0] as { role: string }).role).toBe("editor");
    });
  });
  it("a member who leaves takes their shared cards back and loses access", async () => {
    const mine = "60000000-0000-4000-8000-000000000001";
    await as(D, async () => {
      await q("insert into card_instances (id, owner_id, group_id, date, spec) values ($1, $2, $3, '2026-11-10', $4)", [mine, D, G, spec]);
    });
    await as(A, async () => expect((await q("select id from card_instances where id = $1", [mine])).rows).toHaveLength(1));
    await as(D, () => q("delete from group_members where group_id = $1 and user_id = $2", [G, D]));
    await as(A, async () => expect((await q("select id from card_instances where id = $1", [mine])).rows).toHaveLength(0));
    await as(D, async () => {
      const r = await q("select group_id from card_instances where id = $1", [mine]);
      expect((r.rows[0] as { group_id: string | null }).group_id).toBeNull();
      expect((await q("select id from card_instances where group_id = $1", [G])).rows).toHaveLength(0);
    });
  });
  it("the owner can't leave, deleting the group keeps cards private to their creators", async () => {
    await as(A, async () => expect((await q("delete from group_members where group_id = $1 and user_id = $2 returning *", [G, A])).rows).toHaveLength(0));
    await as(A, async () => {
      await q("delete from groups where id = $1", [G]);
      expect((await q("select id from card_instances where id = $1", [SHARED_T])).rows).toHaveLength(1); // now private to A
    });
    await as(B, async () => expect((await q("select id from card_instances where id = $1", [SHARED_T])).rows).toHaveLength(0));
  });
});
