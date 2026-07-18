const AUTH_CARD_MAX_WIDTH = 420;
const AUTH_CARD_HORIZONTAL_GUTTER = 24;

/** Keep the auth glass inside a fixed phone gutter without nested percentage sizing. */
export function authCardWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return 0;
  return Math.max(
    0,
    Math.min(AUTH_CARD_MAX_WIDTH, viewportWidth - AUTH_CARD_HORIZONTAL_GUTTER * 2)
  );
}
