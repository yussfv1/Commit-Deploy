import { describe, expect, it } from 'vitest';
import { assetUrl } from '../assets';

describe('список файлов роли C', () => {
  const files = { '/public/assets/icons/logo.png': 'assets/logo-abc.png', '/public/assets/sfx/step.mp3': 'assets/step-x.mp3' };

  it('выдаёт адрес только тех файлов, что лежат в сборке', () => {
    expect(assetUrl('icons/logo.png', files)).toBe('assets/logo-abc.png');
    expect(assetUrl('sfx/step.mp3', files)).toBe('assets/step-x.mp3');
    expect(assetUrl('sfx/step.wav', files)).toBeNull();
    expect(assetUrl('fonts/main.woff2', files)).toBeNull();
  });
});
