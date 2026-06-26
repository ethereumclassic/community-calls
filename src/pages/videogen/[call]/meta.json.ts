import type { APIRoute } from "astro";
import {
  callPaths,
  getCall,
  getTranscript,
  buildMeta,
} from "../../../lib/videogen/calls-server";

// Dev-only: sidecar meta (chapters from `NOTE chapters`, hosts from frontmatter,
// jingles from shared config) derived from the call markdown.
export const getStaticPaths = callPaths;

export const GET: APIRoute = async ({ params }) => {
  const entry = await getCall(params.call!);
  const vtt = entry && getTranscript(entry);
  if (!entry || !vtt) {
    return new Response("call or transcript not found", { status: 404 });
  }
  return new Response(JSON.stringify(buildMeta(entry, vtt), null, 2), {
    headers: { "content-type": "application/json" },
  });
};
