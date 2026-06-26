import type { APIRoute } from "astro";
import {
  callPaths,
  getCall,
  getTranscript,
} from "../../../lib/videogen/calls-server";

// Dev-only: the raw transcript (the markdown's ```webvtt block, NOTE chapters
// and all — the videogen VTT parser skips NOTE lines).
export const getStaticPaths = callPaths;

export const GET: APIRoute = async ({ params }) => {
  const entry = await getCall(params.call!);
  const vtt = entry && getTranscript(entry);
  if (!vtt) return new Response("transcript not found", { status: 404 });
  return new Response(vtt, { headers: { "content-type": "text/vtt" } });
};
