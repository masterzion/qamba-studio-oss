let localMediaRoot: string | null = null;

/** Keep local-media path resolution independent from the React-backed plane. */
export function setLocalMediaRoot(root: string | null): void {
  localMediaRoot = root;
}

export function localMediaPath(projectId: string, key: string): string | null {
  return localMediaRoot ? `${localMediaRoot}/${projectId}/media/${key}` : null;
}
