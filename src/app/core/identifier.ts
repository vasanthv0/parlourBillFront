import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Checks done in the browser for what someone types to sign in, or for a mobile number. They only save a round trip:
 * the server makes the same checks again and has the final say. Keep them in step with billback/src/utils/phone.js.
 */

/** What may be typed as a mobile number: digits and + - ( ) spaces, 7 to 20 characters. */
export const MOBILE_FORMAT = /^[0-9+\-\s()]{7,20}$/;
/** A mobile number is usable (to sign in, and to compare) from this many digits. */
export const MOBILE_MIN_DIGITS = 10;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const digitsOf = (value: string): string => value.replace(/\D/g, '');

export type IdentifierKind = 'email' | 'mobile';

/** Anything with an @ must be an email; anything else must be a mobile number with at least 10 digits. Null if neither. */
export function kindOfIdentifier(raw: string): IdentifierKind | null {
  const text = raw.trim();
  if (text.includes('@')) return EMAIL_FORMAT.test(text) ? 'email' : null;
  return MOBILE_FORMAT.test(text) && digitsOf(text).length >= MOBILE_MIN_DIGITS ? 'mobile' : null;
}

/** For the sign-in box: an email or a mobile number. An empty box is left to `required`. */
export function loginIdentifier(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return value && !kindOfIdentifier(value) ? { identifier: true } : null;
}

/**
 * For a mobile number that is being added: when it has the right characters but fewer than 10 digits it cannot be used
 * to sign in. (Wrong characters are reported by the pattern check, so a number gets one message, not two.)
 */
export function mobileDigits(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return value && MOBILE_FORMAT.test(value) && digitsOf(value).length < MOBILE_MIN_DIGITS ? { mobileDigits: true } : null;
}
