import { analyzeStory } from "./storyAnalysis";
self.onmessage = (event: MessageEvent) => {
  const { id, document } = event.data;
  try {
    self.postMessage({ id, result: analyzeStory(document) });
  } catch (e: any) {
    self.postMessage({ id, error: e.message });
  }
};
