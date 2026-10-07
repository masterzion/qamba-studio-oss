// Synthetic media qualification only: no historical or generated-content claim.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fixtureStore, paths as v1paths } from "../src/lib/storyTestFixture.ts";
import { storyV2Fixture } from "../src/lib/storyV2Fixture.ts";
import {
  reviewSubtitles,
  registerStorySubtitleAssets,
} from "../src/lib/storySubtitles.ts";
import {
  captureProductionContext,
  createProductionUnit,
  approveProductionUnit,
} from "../src/lib/productionContext.ts";
import { prepareStoryExport } from "../src/lib/storyExport.ts";
import { startSession, stepSession } from "../director/story_runtime.js";
const folder = path.resolve(".test-output/story-export"),
  media = path.join(folder, "media-source");
fs.mkdirSync(media, { recursive: true });
const file = path.join(media, "synthetic.mp4");
execFileSync("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=blue:s=320x180:r=24:d=1",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=1",
  "-shortest",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  file,
]);
const sha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(file))
  .digest("hex");
const v2 = process.argv.includes("--v2");
const font =
  process.env.STORY_FIXTURE_FONT ??
  (process.env.WINDIR
    ? path.join(process.env.WINDIR, "Fonts", "arial.ttf")
    : null);
const fontFilter =
  font && fs.existsSync(font)
    ? `fontfile='${font.replaceAll("\\", "/").replaceAll(":", "\\:")}':`
    : "";
const fixture = v2 ? storyV2Fixture() : { ...fixtureStore(), paths: v1paths };
const { store, graph, paths } = fixture,
  seen = new Set();
for (const p of paths) {
  let session = startSession(graph);
  for (let i = 0; i <= p.edgeIds.length; i++) {
    const node = graph.document.nodes.find(
        (n) => n.id === session.currentNodeId,
      ),
      injured = Boolean(session.state.flags.injured),
      key = node.id + injured;
    if (node.type === "scene" && !seen.has(key)) {
      seen.add(key);
      for (const language of graph.document.languages ?? [
        graph.document.defaultLanguage,
      ]) {
        const filename = v2
          ? `${node.id}-${injured ? "injured" : "safe"}-${language}.mp4`
          : "synthetic.mp4";
        if (v2) {
          const hue =
            language === "lv"
              ? injured
                ? "red"
                : "blue"
              : injured
                ? "orange"
                : "green";
          execFileSync("ffmpeg", [
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            `color=c=${hue}:s=320x180:r=24:d=1`,
            "-vf",
            `drawtext=${fontFilter}text='${node.id.slice(-3)} ${language} ${injured ? "injured" : "safe"}':fontcolor=white:fontsize=26:x=15:y=75`,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            path.join(media, filename),
          ]);
        }
        const mediaHash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(media, filename)))
          .digest("hex");
        const context = await captureProductionContext(
          store,
          graph,
          session.edgeHistory,
          {
            visualSignature: {},
            canonicalSelections: [],
            productionSettings: {
              model_key: "synthetic",
              language,
              presentationWhen: {
                path: "flags.injured",
                operator: "eq",
                value: injured,
              },
            },
          },
        );
        const unit = createProductionUnit(store, context),
          asset = store.insert("assets", [
            {
              project_id: store.projectId,
              b2_key: filename,
              content_type: "video/mp4",
              kind: "video",
              meta: {
                production_unit_id: unit.id,
                input_hash: unit.context_hash,
              },
            },
          ])[0];
        approveProductionUnit(
          store,
          unit.id,
          asset.id,
          "Synthetic fixture only",
          {
            sha256: mediaHash,
            durationMs: 1000,
            width: 320,
            height: 180,
            fps: 24,
            hasAudio: !v2,
          },
        );
        if (node.content) {
          await reviewSubtitles(
            store,
            unit.id,
            [
              {
                id: crypto.randomUUID(),
                lineId: node.content.dialogue[0].id,
                startMs: 100,
                endMs: 900,
              },
            ],
            "Synthetic measured timing fixture, not a listening review",
          );
          await registerStorySubtitleAssets(
            store,
            unit.id,
            async (key, text) => {
              const target = path.join(media, key);
              fs.mkdirSync(path.dirname(target), { recursive: true });
              fs.writeFileSync(target, text);
            },
          );
        }
      }
    }
    if (i < p.edgeIds.length)
      session = stepSession(graph, session, p.edgeIds[i]);
  }
}
fs.writeFileSync(
  path.join(folder, "spec.json"),
  JSON.stringify(await prepareStoryExport(store, graph)),
);
console.log(`Synthetic exporter fixture prepared at ${folder}`);
if (v2) {
  fs.mkdirSync("contracts/story/v2/fixtures", { recursive: true });
  fs.writeFileSync(
    "contracts/story/v2/fixtures/reconvergence.json",
    JSON.stringify(graph.document, null, 2) + "\n",
  );
  fs.writeFileSync(
    "contracts/story/v2/runtime-conformance.json",
    JSON.stringify({ engineVersion: "2.0.0", cases: paths }, null, 2) + "\n",
  );
}
