/**
 * Which environment this build is for. Set at build time (NEXT_PUBLIC_* values are compiled into
 * the bundle): the deploy passes NEXT_PUBLIC_APP_ENV=staging or production. A build that does not
 * say counts as production, so unfinished modules can never leak into a live build by accident.
 * `next dev` counts as local.
 */
export const APP_ENV: string = process.env.NEXT_PUBLIC_APP_ENV || (process.env.NODE_ENV === 'development' ? 'local' : 'production');

/** Unfinished modules ("Soon" placeholders and modules still in review) show everywhere except production. */
export const SHOW_UNRELEASED = APP_ENV !== 'production';
