import React from "react";
import {useSearchParams} from "react-router-dom";
import { LocalStore } from "../../lib/localStore";
import {
  __adoptLocalStore,
  localStoreFor,
  setActiveLocalProject,
} from "../../lib/localPlane";
import { saveGraphInStore } from "../../lib/storyPersistence";
import fixture from "../../../contracts/story/v1/fixtures/reconvergence.json";
import type { GraphDocument } from "../../lib/storyTypes";
import StoryGraphView from "./StoryGraphView";
import { LibraryView } from "../../routes/Workspace";
const PID = "60000000-0000-4000-8000-000000000001";
function initialize() {
  if (localStoreFor(PID)) return;
  const store = new LocalStore(PID, "local-fixture");
  store.insert("projects", [
    {
      id: PID,
      title: "Synthetic ChronoLatvia fixture",
      medium: "film",
      settings: { narrative_mode: "interactive", offline_only: true },
    },
  ]);
  const ep = store.insert("episodes", [
      { project_id: PID, code: "FIXTURE", idx: 0 },
    ])[0],
    board = store.insert("storyboards", [{ episode_id: ep.id, version: 1 }])[0];
  for (const n of fixture.nodes)
    if ("sceneId" in n)
      store.insert("scenes", [
        {
          id: n.sceneId,
          storyboard_id: board.id,
          idx: store.rows("scenes").length,
          slug: n.title,
          meta: { beats: [] },
        },
      ]);
  saveGraphInStore(store, {
    expected_revision: 0,
    title: "Hide or run — synthetic fixture",
    document: fixture as GraphDocument,
  });
  __adoptLocalStore(store);
}
export default function StoryPreview({
  library = false,
}: {
  library?: boolean;
}) {
  const [params,setParams]=useSearchParams();
  initialize();
  setActiveLocalProject(PID);
  return (
    <div style={{ height: "100vh" }}>
      {library ? (
        <LibraryView projectId={PID} />
      ) : (
        <StoryGraphView projectId={PID} selectedGraphId={params.get("gid")??undefined} onSelectGraph={id=>{const next=new URLSearchParams(params);next.set("gid",id);setParams(next)}} />
      )}
    </div>
  );
}
