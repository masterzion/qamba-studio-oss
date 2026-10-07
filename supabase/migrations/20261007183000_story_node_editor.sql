-- Local project schema: a draft cut belongs to one story scene and language.
alter table timelines add column story_graph_id uuid references story_graphs(id) on delete cascade;
alter table timelines add column story_node_id uuid;
alter table timelines add column story_language text;
alter table timelines add column story_content_hash text;
create unique index timeline_story_draft on timelines(story_graph_id, story_node_id, story_language) where production_unit_id is null and story_graph_id is not null;
alter table production_units add column subtitle_document jsonb not null default '{}';
