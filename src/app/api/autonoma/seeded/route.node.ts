/**
 * Read-only view of what the Autonoma Environment Factory has seeded.
 *
 * The simulator keeps boats and marinas in static modules, so seeded records
 * live in an in-memory store instead of a database. This is the equivalent of
 * running a SELECT against them: it is how a factory's `up` and `down` are
 * checked, and it reads the same store the pages read.
 *
 * Only mounted when the deployment was provisioned for Autonoma, and — like
 * the factory endpoint itself — left out of the static Electron bundle.
 */
import {
  seededBoatProfiles,
  seededImpactIncidents,
  seededMarinaLayouts,
} from "@/lib/autonoma/store";

export async function GET(): Promise<Response> {
  if (!process.env.AUTONOMA_SHARED_SECRET) {
    return new Response("Not Found", { status: 404 });
  }

  return Response.json({
    boatProfiles: seededBoatProfiles().map((boat) => ({
      profileSlug: boat.profileSlug,
      displayName: boat.displayName,
      manufacturer: boat.manufacturer,
      model: boat.model,
      simStatus: boat.simStatus,
      loa: boat.stats.loa,
      beam: boat.stats.beam,
    })),
    marinaLayouts: seededMarinaLayouts().map((marina) => ({
      id: marina.id,
      name: marina.name,
      vhfChannel: marina.vhfChannel,
      briefing: marina.briefing,
      berths: marina.berths.map((berth) => ({
        id: berth.id,
        label: berth.label,
        kind: berth.kind,
        dockSide: berth.dockSide,
        center: berth.center,
        headingDeg: berth.headingDeg,
        notes: berth.notes,
      })),
      spawns: marina.spawns.map((spawn) => ({
        id: spawn.id,
        label: spawn.label,
        kind: spawn.kind,
        berthId: spawn.berthId,
        range: spawn.range,
        brief: spawn.brief,
        position: spawn.position,
        yawDeg: spawn.yawDeg,
      })),
    })),
    impactIncidents: seededImpactIncidents(),
  });
}
