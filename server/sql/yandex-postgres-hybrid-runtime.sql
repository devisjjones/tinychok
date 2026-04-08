create table if not exists app_runtime_state (
  id integer primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists app_runtime_state_dialog_messages (
  owner_identifier text not null,
  dialog_id bigint not null,
  message_id bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_identifier, dialog_id, message_id)
);

create table if not exists app_runtime_state_group_messages (
  owner_identifier text not null,
  group_id bigint not null,
  message_id bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_identifier, group_id, message_id)
);

create table if not exists app_runtime_state_groups (
  owner_identifier text not null,
  group_id bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_identifier, group_id)
);

create table if not exists app_runtime_state_subscription_channels (
  owner_identifier text not null,
  channel_id bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_identifier, channel_id)
);

create table if not exists app_runtime_state_subscription_posts (
  owner_identifier text not null,
  channel_id bigint not null,
  post_id bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_identifier, channel_id, post_id)
);

create table if not exists app_runtime_state_support_tickets (
  owner_identifier text not null,
  ticket_id bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_identifier, ticket_id)
);

create table if not exists app_runtime_state_thread_states (
  owner_identifier text not null,
  thread_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_identifier, thread_id)
);

create table if not exists app_runtime_state_ip_access_logs (
  log_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (log_id)
);

create table if not exists app_runtime_state_admin_audit_logs (
  audit_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (audit_id)
);

create table if not exists app_runtime_state_archived_media (
  media_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (media_id)
);

create table if not exists app_runtime_state_pending_group_invitations (
  recipient_identifier text not null,
  shared_id text not null,
  sender_identifier text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (recipient_identifier, shared_id, sender_identifier)
);

create table if not exists app_runtime_state_pending_channel_invitations (
  recipient_identifier text not null,
  channel_handle text not null,
  sender_identifier text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (recipient_identifier, channel_handle, sender_identifier)
);

create table if not exists app_runtime_state_pending_media_uploads (
  storage_key text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (storage_key)
);

create table if not exists app_runtime_state_account_status_histories (
  identifier text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (identifier)
);
