import { headers } from 'next/headers';
import MarketWorkspace from './market-workspace';

export default async function Page() {
  const requestHeaders = await headers();
  const positionsUsername = process.env.POSITIONS_USERNAME?.trim();
  const canViewPositions = process.env.SHOW_POSITIONS === 'true' || Boolean(
    positionsUsername && requestHeaders.get('x-authenticated-user') === positionsUsername,
  );
  return <MarketWorkspace canViewPositions={canViewPositions} />;
}
