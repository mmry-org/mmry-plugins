import * as cheerio from "npm:cheerio";
import { mmry } from "jsr:@mmry-org/sdk@0.0.4";

/// HELPERS
// THE TranscriptClient IS TAKEN FROM https://github.com/0x6a69616e/youtube-transcript-api/
// MIT License

// Copyright (c) 2023-2025 0x6a69616e

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/**
 * Generates a random hex string.
 * @param {number} size - Length of hex string
 * @returns A random hex string
 */
function generateRandomHex(size: number): string {
  return [...Array(size)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join("");
}

export class TranscriptClient {
  ready: Promise<void>; // ready event trigger
  #baseURL: string;
  #defaultHeaders: Record<string, string>;
  #firebase_cfg_creds: { apiKey: string; appId: string } | null = null; // Firebase configuration credentials

  constructor(options?: {
    headers?: Record<string, string>;
    baseURL?: string;
  }) {
    this.#baseURL = options?.baseURL || "https://www.youtube-transcript.io/";
    this.#defaultHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0",
      ...(options?.headers || {}),
    };

    // Promise-based ready event trigger system
    this.ready = new Promise<void>(async (resolve) => {
      this.#firebase_cfg_creds = await this.#get_firebase_cfg_creds();
      resolve();
    });
  }

  /**
   * Makes a fetch request with default configuration
   */
  async #fetch(url: string, options?: RequestInit): Promise<Response> {
    const fullUrl = url.startsWith("http")
      ? url
      : `${this.#baseURL}${url.startsWith("/") ? url.slice(1) : url}`;

    return fetch(fullUrl, {
      ...options,
      headers: {
        ...this.#defaultHeaders,
        ...(options?.headers || {}),
      },
    });
  }

  /**
   * Gets Google Firebase configuration credentials
   * @returns Firebase auth details
   */
  async #get_firebase_cfg_creds(): Promise<{ apiKey: string; appId: string }> {
    const response = await this.#fetch("/");
    const data = await response.text();
    const $ = cheerio.load(data);

    for (const elem of $("script[src]").toArray()) {
      const url = $(elem).attr("src");
      if (!url) continue;

      const scriptResponse = await this.#fetch(url);
      const script = await scriptResponse.text();

      const match = script.match(/\(\{[^}]*apiKey:"([^"]+)"[^}]*\}\)/gm);
      if (match)
        return Function("return " + match[0])() as {
          apiKey: string;
          appId: string;
        };
    }

    throw new Error("Could not find Firebase configuration");
  }

  /**
   * Gets API authorization details from the Google Identity Platform
   * @returns SignupNewUserResponse
   */
  async #get_auth(): Promise<{ idToken: string }> {
    const creds = this.#firebase_cfg_creds;
    if (!creds) throw new Error("client not fully initialized!");

    const url = new URL(
      "https://identitytoolkit.googleapis.com/v1/accounts:signUp"
    );
    url.searchParams.set("key", creds.apiKey);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Version": "Firefox/JsCore/10.14.1/FirebaseCore-web",
        "X-Firebase-Client": JSON.stringify({
          version: 2,
          heartbeats: [
            {
              agent:
                "fire-core/0.10.13 fire-core-esm2017/0.10.13 fire-js/ fire-js-all-app/10.14.1 fire-auth/1.7.9 fire-auth-esm2017/1.7.9",
              dates: [new Date().toISOString().split("T")[0]],
            },
          ],
        }),
        "X-Firebase-gmpid": creds.appId.slice(2),
      },
      body: JSON.stringify({
        returnSecureToken: true,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Auth request failed: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as { idToken: string };
  }

  /**
   * Retrieves the transcript of a particular video.
   * @param {string} id - The YouTube video ID
   * @param {object} [config] - Request configurations for additional headers
   * @returns A Promise that resolves to the transcript object
   */
  async getTranscript(
    id: string,
    config?: { headers?: Record<string, string> }
  ): Promise<any> {
    const auth = await this.#get_auth();

    try {
      const response = await this.#fetch("/api/transcripts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config?.headers || {}),
          Authorization: "Bearer " + auth.idToken,
          "X-Hash": generateRandomHex(64),
        },
        body: JSON.stringify({
          ids: [id],
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("invalid video ID");
        }
        throw new Error(
          `Request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return data[0];
    } catch (e) {
      if (e instanceof Error) {
        throw e;
      }
      throw new Error("An unknown error occurred");
    }
  }

  /**
   * Retrieves the transcript of multiple videos.
   * @param {string[]} ids - A list of YouTube video IDs
   * @param {object} [config] - Request configurations for additional headers
   * @returns A Promise that resolves to an array of transcript objects
   */
  async bulkGetTranscript(
    ids: string[],
    config?: { headers?: Record<string, string> }
  ): Promise<any[]> {
    const auth = await this.#get_auth();

    try {
      const response = await this.#fetch("/api/transcripts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config?.headers || {}),
          Authorization: "Bearer " + auth.idToken,
          "X-Hash": generateRandomHex(64),
        },
        body: JSON.stringify({
          ids,
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("video not found or unavailable");
        }
        throw new Error(
          `Request failed: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    } catch (e) {
      if (e instanceof Error) {
        throw e;
      }
      throw new Error("An unknown error occurred");
    }
  }
}

/// PLUGIN

function youtubeUrlToId(url: string): string {
  const regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[7].length == 11 ? match[7] : "";
}

const url = mmry.input("youtube-video")?.value;
if (!url) {
  mmry.status("URL invalid");
  Deno.exit(0);
}

const id = youtubeUrlToId(url);
if (!id) {
  mmry.status("URL invalid");
  Deno.exit(0);
}

const client = new TranscriptClient();
await client.ready;
const transcript = await client.getTranscript(id);

transcript.tracks.sort((a: any, b: any) => {
  if (a.language === "en") return -1;
  if (b.language === "en") return 1;
  return a.language.localeCompare(b.language);
});

const text = transcript.tracks[0].transcript
  .map((t: any) => t.text)
  .join(" ")
  .replace(/ +/g, " ");

mmry.add({
  content: text,
  externalId: id,
  urls: [url],
  collection: "youtube",
});
