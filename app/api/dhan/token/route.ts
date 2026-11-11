import { NextRequest, NextResponse } from 'next/server';
import { ensureToken, tokenStatus } from '@/app/lib/dhan-auth';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json(tokenStatus(), { headers: { 'Cache-Control': 'no-store' } }); }
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== `https://${request.headers.get('host')}` && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  try { await ensureToken(); return NextResponse.json(tokenStatus()); }
  catch (error) { return NextResponse.json({ ...tokenStatus(), error: error instanceof Error ? error.message : 'Authentication failed' }, { status: 502 }); }
}
