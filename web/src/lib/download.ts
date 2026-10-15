/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Saves a file the app fetched or built. Inside the claude.ai app preview, files go
 * through its download prompt; everywhere else, a normal browser download.
 */
export async function saveFile(filename: string, data: Blob): Promise<void> {
  const claude = (window as any).claude;
  if (claude?.use) {
    const downloads = await claude.use("downloads");
    if (downloads) {
      try {
        await downloads.save({ filename, data });
      } catch (e: any) {
        if (e?.code !== "declined") throw new Error(e?.message ?? "The download didn't go through.");
      }
      return;
    }
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fetches a file from the API and saves it under the server's filename. */
export async function downloadFrom(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't build the file.");
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  await saveFile(name, await res.blob());
}
