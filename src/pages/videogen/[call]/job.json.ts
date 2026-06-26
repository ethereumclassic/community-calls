import type { APIRoute } from "astro";
import {
  callPaths,
  getCall,
  getTranscript,
  buildJob,
} from "../../../lib/videogen/calls-server";

// Dev-only: the videogen job derived from the call markdown. Stripped from prod
// (callPaths returns [] when !DEV, and the build hook removes /videogen).
export const getStaticPaths = callPaths;

export const GET: APIRoute = async ({ params }) => {
  const entry = await getCall(params.call!);
  const vtt = entry && getTranscript(entry);
  if (!entry || !vtt) {
    return new Response("call or transcript not found", { status: 404 });
  }
  return new Response(JSON.stringify(buildJob(entry, vtt), null, 2), {
    headers: { "content-type": "application/json" },
  });
};
