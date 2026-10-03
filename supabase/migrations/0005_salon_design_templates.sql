alter table salons
  add column template text not null default 'photo' check (template in ('photo', 'card', 'simple')),
  add column theme_color text not null default '#1c1917',
  add column hero_image_url text;

-- ヒーロー画像アップロード用の公開バケット(書き込みはservice role経由)
insert into storage.buckets (id, name, public)
values ('salon-assets', 'salon-assets', true)
on conflict (id) do nothing;

create policy salon_assets_public_read
  on storage.objects for select
  using (bucket_id = 'salon-assets');
