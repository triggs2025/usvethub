/**
 * Logo candidates.
 *
 * Constraints that shaped all three: it has to read at 16px in a browser tab,
 * it has to work in one flat colour for a stamp or an embroidered polo, and it
 * has to avoid the three cliches every Veteran organisation reaches for, which
 * are a screaming eagle, a waving flag, and a camouflage pattern. Veterans see
 * those a hundred times a week and they signal "made by a committee in 1998".
 *
 * Each is pure geometry, no gradients required, and each is inline SVG so it
 * inherits currentColor and costs no extra request.
 */

/**
 * A. Chevron rise.
 * Three ascending rank chevrons. Reads instantly as military to anyone who
 * served, reads as "upward, forward" to anyone who did not. The most modern of
 * the three and the one that survives smallest.
 */
export const logoChevron = (size = 34) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true"
     stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 30 L32 13 L50 30" opacity="1"/>
  <path d="M14 44 L32 27 L50 44" opacity="0.74"/>
  <path d="M14 57 L32 40 L50 57" opacity="0.5"/>
</svg>`;

/**
 * B. Compass star.
 * An eight-point navigation star. This one matches what the site actually
 * claims to be: a signpost, not the authority. Slightly more formal than A.
 */
export const logoCompass = (size = 34) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <path fill="currentColor"
        d="M32 2 38.5 25.5 62 32 38.5 38.5 32 62 25.5 38.5 2 32 25.5 25.5Z"/>
  <path fill="currentColor" opacity="0.4"
        d="M48.5 15.5 40 24 33 31 40 24Z M15.5 48.5 24 40 31 33 24 40Z"/>
  <circle cx="32" cy="32" r="5.5" fill="none" stroke="currentColor" stroke-width="3.4"/>
</svg>`;

/**
 * C. Shield chevron.
 * A shield with a chevron cut out of it. The most traditional, and the one a
 * 60-year-old Veteran is most likely to trust on sight. Least distinctive.
 */
export const logoShield = (size = 34) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <path fill="currentColor" d="M32 4 56 13v20c0 13.5-9.8 22.8-24 27C17.8 55.8 8 46.5 8 33V13Z"/>
  <path fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"
        d="M19 34 L32 22 L45 34"/>
  <path fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"
        opacity="0.55" d="M19 45 L32 33 L45 45"/>
</svg>`;

export const LOGOS = {
  chevron: { render: logoChevron, name: 'Chevron rise' },
  compass: { render: logoCompass, name: 'Compass star' },
  shield: { render: logoShield, name: 'Shield chevron' },
};

/** Which mark the site currently ships. Change this one word to switch. */
export const ACTIVE_LOGO = 'chevron';
