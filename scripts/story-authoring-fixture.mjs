// Native authoring-package qualification requires no model or media generation.
import fs from "node:fs";
import path from "node:path";
import {fixtureStore} from "../src/lib/storyTestFixture.ts";
import {newStoryInStore} from "../src/lib/storyAuthoring.ts";
import {prepareStoryExport} from "../src/lib/storyExport.ts";
const {store}=fixtureStore(),graph=newStoryInStore(store,"Synthetic authoring draft","lv",["en"]);
const folder=path.resolve(".test-output/story-export");fs.mkdirSync(path.join(folder,"media-source"),{recursive:true});
fs.writeFileSync(path.join(folder,"spec.json"),JSON.stringify(await prepareStoryExport(store,graph,"authoring")));
console.log("Authoring exporter fixture prepared without media generation");
