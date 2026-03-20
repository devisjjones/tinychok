create extension if not exists pgcrypto;

create table if not exists accounts (
  identifier text primary key,
  display_name text not null,
  surname text not null default '',
  nickname text not null default '',
  status text not null default '',
  premium boolean not null default true,
  premium_expires_at timestamptz,
  blocked_contact_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists auth_challenges (
  identifier text primary key,
  code text not null,
  expires_at timestamptz not null
);

create table if not exists account_sessions (
  token uuid primary key default gen_random_uuid(),
  identifier text not null references accounts(identifier) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists account_sessions_identifier_idx
  on account_sessions(identifier);

create table if not exists dialogs (
  owner_identifier text not null references accounts(identifier) on delete cascade,
  id bigint not null,
  title text not null,
  handle text not null,
  phone text not null,
  accent text not null,
  mood text not null,
  status text not null,
  online boolean,
  last_seen text,
  typing boolean,
  unread integer not null default 0,
  pinned boolean,
  premium boolean,
  pinned_message_id bigint,
  primary key (owner_identifier, id)
);

create table if not exists dialog_messages (
  owner_identifier text not null references accounts(identifier) on delete cascade,
  dialog_id bigint not null,
  id bigint not null,
  author text not null check (author in ('me', 'them')),
  text text not null,
  time_label text not null,
  attachment_file_name text,
  attachment_media_url text,
  attachment_mime_type text,
  attachment_size bigint,
  display_author text,
  reply_to_text text,
  reply_to_author text check (reply_to_author in ('me', 'them')),
  forwarded boolean,
  primary key (owner_identifier, dialog_id, id),
  foreign key (owner_identifier, dialog_id) references dialogs(owner_identifier, id) on delete cascade
);

create index if not exists dialog_messages_owner_dialog_idx
  on dialog_messages(owner_identifier, dialog_id, id);

create table if not exists chat_groups (
  owner_identifier text not null references accounts(identifier) on delete cascade,
  id bigint not null,
  title text not null,
  handle text not null,
  accent text not null,
  preview text not null,
  time_label text not null,
  unread integer not null default 0,
  members integer not null,
  primary key (owner_identifier, id)
);

create table if not exists group_messages (
  owner_identifier text not null references accounts(identifier) on delete cascade,
  group_id bigint not null,
  id bigint not null,
  author text not null check (author in ('me', 'them')),
  text text not null,
  time_label text not null,
  attachment_file_name text,
  attachment_media_url text,
  attachment_mime_type text,
  attachment_size bigint,
  display_author text,
  reply_to_text text,
  reply_to_author text check (reply_to_author in ('me', 'them')),
  forwarded boolean,
  primary key (owner_identifier, group_id, id),
  foreign key (owner_identifier, group_id) references chat_groups(owner_identifier, id) on delete cascade
);

create index if not exists group_messages_owner_group_idx
  on group_messages(owner_identifier, group_id, id);

create table if not exists managed_channels (
  owner_identifier text not null references accounts(identifier) on delete cascade,
  id bigint not null,
  title text not null,
  direct_link text not null,
  description text not null,
  avatar_tone text not null,
  avatar_image text,
  status text not null check (status in ('draft', 'active')),
  visibility text not null check (visibility in ('private', 'public', 'closed')),
  primary key (owner_identifier, id)
);

create table if not exists subscription_channels (
  owner_identifier text not null references accounts(identifier) on delete cascade,
  id bigint not null,
  title text not null,
  handle text not null,
  accent text not null,
  preview text not null,
  time_label text not null,
  unread integer not null default 0,
  draft boolean,
  visibility text not null check (visibility in ('private', 'public', 'closed')),
  primary key (owner_identifier, id)
);

create table if not exists subscription_posts (
  owner_identifier text not null references accounts(identifier) on delete cascade,
  channel_id bigint not null,
  id bigint not null,
  text text not null,
  attachment_file_name text,
  attachment_media_url text,
  attachment_mime_type text,
  attachment_size bigint,
  time_label text not null,
  primary key (owner_identifier, channel_id, id),
  foreign key (owner_identifier, channel_id) references subscription_channels(owner_identifier, id) on delete cascade
);

create index if not exists subscription_posts_owner_channel_idx
  on subscription_posts(owner_identifier, channel_id, id);
