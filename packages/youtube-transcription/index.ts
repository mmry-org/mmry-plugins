import { mmry } from "npm:@mmry-org/sdk@0.0.6";

/// DEPENDENCIES ///////////////////////////////////////////////////////////////
const P1 =
  "KD86eW91dHViZVwuY29tXC93YXRjaFw/dj18eW91dHVcLmJlXC98eW91dHViZVwuY29tXC9lbWJlZFwvKShbXiZcbj8jXSsp";
const P2 = "IklOTkVSVFVCRV9BUElfS0VZIjoiKFteIl0rKSI=";
const P3 = "aHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj0=";
const P4 = "aHR0cHM6Ly93d3cueW91dHViZS5jb20veW91dHViZWkvdjEvcGxheWVyP2tleT0=";
const P5 = "<p[^>]*>(.*?)<\\/p>";
const P6 = "<[^>]*>";
export function f1(a1: string): string {
  const v1 = new RegExp(atob(P1));
  const v2 = a1.match(v1);
  if (!v2) throw new Error("Invalid YouTube URL");
  return v2[1];
}
export async function f2(a1: string): Promise<string> {
  const v1 = await fetch(atob(P3) + a1);
  const v2 = await v1.text();
  const v3 = new RegExp(atob(P2));
  const v4 = v2.match(v3);
  if (!v4) throw new Error("Could not extract API key");
  return v4[1];
}
export async function f3(a1: string, a2?: string): Promise<any> {
  if (!a2) a2 = await f2(a1);
  const v1 = await fetch(atob(P4) + a2, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "20.11.37" } },
      videoId: a1,
    }),
  });
  return await v1.json();
}
async function f4(a1: string): Promise<string> {
  const v1 = await fetch(a1);
  return await v1.text();
}
function f5(a1: string): string {
  const v1 = new RegExp(P5, "gs");
  const v2: string[] = [];
  let v3;
  while ((v3 = v1.exec(a1)) !== null) {
    const v4 = new RegExp(P6, "g");
    const v5 = v3[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(v4, "")
      .replace(/\s+/g, " ");
    if (v5.trim()) {
      v2.push(v5.trim());
    }
  }
  return v2.join(" ");
}
export async function f6(a1: any): Promise<string> {
  try {
    const v1 = a1?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!v1 || v1.length === 0) {
      throw new Error("No captions available");
    }
    let v2 = v1.find(
      (track: any) =>
        track.languageCode === "en" || track.languageCode?.startsWith("en")
    );
    if (!v2) v2 = v1[0];
    const v3 = await f4(v2.baseUrl);
    return f5(v3);
  } catch (e1: unknown) {
    const v4 = e1 instanceof Error ? e1.message : String(e1);
    throw new Error(`Failed to get transcript: ${v4}`);
  }
}

/// PLUGIN /////////////////////////////////////////////////////////////////////

const url = mmry.input("youtube-video")?.value;
if (!url) {
  mmry.status("URL invalid");
  Deno.exit(0);
}

try {
  mmry.status("Fetching video information...");

  const videoId = f1(url);
  const data = await f3(videoId);
  const details = data.videoDetails;
  const transcript = await f6(data);
  const thumbnail = details.thumbnail.thumbnails[0].url;

  if (!transcript) {
    mmry.status("No transcript available for this video");
    Deno.exit(0);
  }

  mmry.add({
    externalId: videoId,
    title: details.title,
    description: details.shortDescription,
    content: transcript,
    author: details.author,
    channelId: details.channelId,
    viewCount: details.viewCount,
    thumbnail,
    urls: [thumbnail],
  });

  mmry.status("Transcript added");
} catch (error: any) {
  mmry.status(`Failed to get transcript: ${error.message}`);
  Deno.exit(1);
}
