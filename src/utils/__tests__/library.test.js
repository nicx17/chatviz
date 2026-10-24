import { describe, it, expect } from 'vitest';
import { findSavedMatch, copyId, copyTitle } from '../library.js';

const saved = [
  { id: 'whatsapp-1', platform: 'whatsapp', title: 'Alice', participants: ['Me', 'Alice'] },
  { id: 'whatsapp-2', platform: 'whatsapp', title: 'Family', participants: ['Me', 'Mum', 'Dad'] },
  { id: 'instagram-1', platform: 'instagram', title: 'alex', participants: ['me', 'alex'] },
];

describe('findSavedMatch', () => {
  it('matches the same id', () => {
    expect(findSavedMatch({ id: 'whatsapp-2', platform: 'whatsapp', title: 'x', participants: [] }, saved)?.id).toBe('whatsapp-2');
  });

  it('matches a newer export of the same people, in any order', () => {
    const chat = { id: 'whatsapp-9', platform: 'whatsapp', title: '', participants: ['Alice', 'Me'] };
    expect(findSavedMatch(chat, saved)?.id).toBe('whatsapp-1');
  });

  it('matches a group by title when its members changed', () => {
    const chat = { id: 'whatsapp-9', platform: 'whatsapp', title: 'Family', participants: ['Me', 'Mum', 'Dad', 'Sis'] };
    expect(findSavedMatch(chat, saved)?.id).toBe('whatsapp-2');
  });

  it('never matches across platforms', () => {
    const chat = { id: 'snapchat-1', platform: 'snapchat', title: 'Alice', participants: ['Me', 'Alice'] };
    expect(findSavedMatch(chat, saved)).toBeNull();
  });

  it('does not match on an empty title', () => {
    const chat = { id: 'whatsapp-9', platform: 'whatsapp', title: '', participants: ['Me', 'Bob'] };
    expect(findSavedMatch(chat, [{ ...saved[0], title: '' }])).toBeNull();
  });
});

describe('copyId', () => {
  it('adds the first free suffix', () => {
    expect(copyId('whatsapp-1', ['whatsapp-1'])).toBe('whatsapp-1-2');
    expect(copyId('whatsapp-1', ['whatsapp-1', 'whatsapp-1-2'])).toBe('whatsapp-1-3');
  });

  it('keeps an id that is already free', () => {
    expect(copyId('whatsapp-5', ['whatsapp-1'])).toBe('whatsapp-5');
  });
});

describe('copyTitle', () => {
  it('numbers a title that is already used', () => {
    expect(copyTitle('Alex', ['Alex'])).toBe('Alex (2)');
    expect(copyTitle('Alex', ['Alex', 'Alex (2)'])).toBe('Alex (3)');
    expect(copyTitle('Sam', ['Alex'])).toBe('Sam');
  });
});
