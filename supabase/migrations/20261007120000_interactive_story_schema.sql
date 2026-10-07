-- Structural input for the OSS local-store generator, not a server deployment.
create table story_graphs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null default 'Interactive story',
  schema_version integer not null default 1,
  revision integer not null default 1,
  status text not null default 'draft',
  document jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger story_graphs_updated before update on story_graphs for each row execute procedure moddatetime(updated_at);
create table story_graph_revisions (
  id uuid primary key default gen_random_uuid(),
  graph_id uuid not null references story_graphs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  revision integer not null,
  document jsonb not null default '{}',
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique(graph_id, revision)
);
create table story_graph_scene_refs (
  graph_id uuid not null references story_graphs(id) on delete cascade,
  scene_id uuid not null references scenes(id) on delete restrict,
  project_id uuid not null references projects(id) on delete cascade,
  primary key(graph_id, scene_id)
);
create table story_simulations (
  id uuid primary key default gen_random_uuid(),
  graph_id uuid not null references story_graphs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  graph_revision integer not null,
  label text not null default 'Simulation',
  edge_history jsonb not null default '[]',
  debug_start jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger story_simulations_updated before update on story_simulations for each row execute procedure moddatetime(updated_at);
create table historical_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null,
  title text not null,
  url text,
  asset_id uuid references assets(id) on delete restrict,
  rag_document_id uuid references rag_documents(id) on delete restrict,
  citation text not null default '',
  creator text not null default '',
  date_label text not null default '',
  accessed_at timestamptz,
  rights_note text not null default '',
  sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger historical_sources_updated before update on historical_sources for each row execute procedure moddatetime(updated_at);
create table production_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  graph_id uuid not null references story_graphs(id) on delete restrict,
  graph_revision integer not null,
  node_id uuid not null,
  scene_id uuid not null references scenes(id) on delete restrict,
  storyboard_id uuid not null references storyboards(id) on delete restrict,
  context_hash text not null,
  context jsonb not null default '{}',
  predecessor_unit_id uuid references production_units(id) on delete restrict,
  approved_asset_id uuid references assets(id) on delete restrict,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger production_units_updated before update on production_units for each row execute procedure moddatetime(updated_at);
alter table generation_blocks add column production_unit_id uuid default null references production_units(id) on delete restrict;
alter table timelines add column production_unit_id uuid default null references production_units(id) on delete restrict;
create unique index generation_blocks_story_unit_idx on generation_blocks(production_unit_id, idx) where production_unit_id is not null;
