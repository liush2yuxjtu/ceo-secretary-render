// GET /api/roles — list installed roles for the sidebar / registry panel.

import { NextResponse } from 'next/server';
import { MAIN_ROLE_ID, resolveRolePaths } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const roles = await resolveRolePaths();
  return NextResponse.json({
    mainRoleId: MAIN_ROLE_ID,
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      english: r.english,
      tagline: r.tagline,
      description: r.description,
      emoji: r.emoji,
      isMain: r.isMain,
      isEngineer: r.isEngineer,
      vendor: r.vendor,
      group: r.group,
      accent: r.accent,
      installed: r.pluginPath.length > 0,
    })),
  });
}
