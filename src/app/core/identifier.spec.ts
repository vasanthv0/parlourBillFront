import { FormControl } from '@angular/forms';
import { MOBILE_MIN_DIGITS, digitsOf, kindOfIdentifier, loginIdentifier, mobileDigits } from './identifier';

describe('what may be typed to sign in', () => {
  it('knows an email from a mobile number, however the number is typed', () => {
    expect(kindOfIdentifier('riya@x.test')).toBe('email');
    expect(kindOfIdentifier('  Riya@X.Test  ')).toBe('email');
    for (const typed of ['9840012345', '98400 12345', '+91 98400-12345', '098400 12345', '(98400) 12345']) expect(kindOfIdentifier(typed)).toBe('mobile');
  });

  it('refuses everything else', () => {
    for (const bad of ['', '   ', 'riya', 'riya@', '@x.test', 'a@b', 'a b@x.test', '12345', '123456789', 'abcdefghij', '98400 12345 ext 9']) expect(kindOfIdentifier(bad)).toBeNull();
  });

  it('an email never passes as a mobile number', () => {
    expect(kindOfIdentifier('9840012345@x.test')).toBe('email');
    expect(kindOfIdentifier('9840012345@')).toBeNull();
  });

  it('counts digits only', () => {
    expect(digitsOf('+91 98400-12345')).toBe('919840012345');
    expect(MOBILE_MIN_DIGITS).toBe(10);
  });
});

describe('the sign-in and mobile number checks', () => {
  const errors = (validator: (c: FormControl) => unknown, value: string) => validator(new FormControl(value));

  it('loginIdentifier leaves an empty box to "required" and flags anything that is neither an email nor a number', () => {
    expect(errors(loginIdentifier, '')).toBeNull();
    expect(errors(loginIdentifier, 'riya@x.test')).toBeNull();
    expect(errors(loginIdentifier, '9840012345')).toBeNull();
    expect(errors(loginIdentifier, 'riya')).toEqual({ identifier: true });
    expect(errors(loginIdentifier, '98400 123')).toEqual({ identifier: true });
  });

  it('mobileDigits flags only a well-formed number with fewer than 10 digits, so a number gets one message', () => {
    expect(errors(mobileDigits, '')).toBeNull();
    expect(errors(mobileDigits, '9840012345')).toBeNull();
    expect(errors(mobileDigits, '98400 123')).toEqual({ mobileDigits: true });
    expect(errors(mobileDigits, '12')).toBeNull();          // too short to be a number at all: the pattern check says so
    expect(errors(mobileDigits, 'abcdefghij')).toBeNull();   // wrong characters: the pattern check says so
  });
});
