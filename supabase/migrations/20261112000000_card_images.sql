-- Personal card photos: a PRIVATE storage bucket. Nothing is publicly readable; the app uses short-lived signed URLs.
--
-- Path convention: <uploader user id>/<image id>.jpg      (card.spec.cover = { kind: "upload", path })
-- Who may read an object:
--   * the uploader, always;
--   * any member of a group, when a card shared with that group uses the photo as its cover.
--   Un-sharing a card (or deleting it) therefore removes everyone else's access; private cards expose nothing.
-- Who may write: authenticated users, only inside their own folder. The bucket caps size and type.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', false, 2097152, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Fast lookup for the sharing rule below.
create index card_instances_shared_cover on public.card_instances ((spec #>> '{cover,path}')) where group_id is not null;

create policy card_images_select on storage.objects for select to authenticated using (
  bucket_id = 'card-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.card_instances ci
      where ci.group_id is not null
        and ci.spec #>> '{cover,path}' = storage.objects.name
        and public.is_group_member(ci.group_id)
    )
  )
);
create policy card_images_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy card_images_delete on storage.objects for delete to authenticated using (
  bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text
);
-- No update policy: photos are immutable; replacing a photo uploads a new object.
