/** Bounded binary IPC. Progress advances only after native disk acknowledgement. */
export async function transferLocalMedia(
  file: Blob,
  write: (bytes: Uint8Array, append: boolean) => Promise<unknown>,
  progress?: (fraction: number) => void,
  timeoutMs = 30000,
) {
  const chunkSize = 256 * 1024;
  let sent = 0;
  let append = false;
  do {
    const bytes = new Uint8Array(
      await file.slice(sent, sent + chunkSize).arrayBuffer(),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        write(bytes, append),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Local media write timed out. Check disk space and restart the desktop application before retrying.",
                ),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    sent += bytes.length;
    append = true;
    progress?.(file.size ? sent / file.size : 1);
  } while (sent < file.size);
}
