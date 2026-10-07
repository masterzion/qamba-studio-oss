-- Removing a narrative node retains its editable cuts and media. The original
-- story binding is retained in metadata for undo/recovery, outside linear defaults.
alter table timelines add column if not exists meta jsonb not null default '{}'::jsonb;
