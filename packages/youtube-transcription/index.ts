import { mmry } from "npm:@mmry-org/sdk";

/// DEPENDENCIES ///////////////////////////////////////////////////////////////
export function extractVideoId(url: string): string {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  if (!match) throw new Error("Invalid YouTube URL");
  return match[1];
}

export async function fetchApiKey(videoId: string): Promise<string> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  const html = await response.text();

  const match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!match) throw new Error("Could not extract API key");
  return match[1];
}

export async function fetchVideoData(
  videoId: string,
  apiKey?: string
): Promise<any> {
  if (!apiKey) apiKey = await fetchApiKey(videoId);

  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
          },
        },
        videoId,
      }),
    }
  );

  return await response.json();
}

async function fetchTranscriptXml(url: string): Promise<string> {
  const response = await fetch(url);
  return await response.text();
}

function parseTranscript(xmlText: string): string {
  const textRegex = /<p[^>]*>(.*?)<\/p>/gs;
  const segments: string[] = [];
  let match;

  while ((match = textRegex.exec(xmlText)) !== null) {
    const text = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ");
    if (text.trim()) {
      segments.push(text.trim());
    }
  }

  return segments.join(" ");
}

export async function fetchTranscript(videoResponse: any): Promise<string> {
  try {
    const captions =
      videoResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captions || captions.length === 0) {
      throw new Error("No captions available");
    }

    // Find English captions first, otherwise use the first available
    let captionTrack = captions.find(
      (track: any) =>
        track.languageCode === "en" || track.languageCode?.startsWith("en")
    );

    if (!captionTrack) captionTrack = captions[0];

    const xmlText = await fetchTranscriptXml(captionTrack.baseUrl);
    return parseTranscript(xmlText);
  } catch (error) {
    throw new Error(`Failed to get transcript: ${error.message}`);
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

  const videoId = extractVideoId(url);
  const data = await fetchVideoData(videoId);
  const details = data.videoDetails;
  const transcript = await fetchTranscript(data);
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

  mmry.status("Transcript added successfully");
} catch (error: any) {
  mmry.status(`Failed to get transcript: ${error.message}`);
  Deno.exit(1);
}
