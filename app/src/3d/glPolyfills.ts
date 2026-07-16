// Browser APIs that three.js / GLTFLoader expect but React Native's runtime
// doesn't provide. Import this module before any three.js loader work.

// GLTFLoader sniffs navigator.userAgent to pick a texture loader. RN defines
// `navigator` without `userAgent`, so `.match()` crashes ("Cannot read
// property 'match' of undefined"). Give it a harmless value.
if (
  typeof navigator !== 'undefined' &&
  typeof (navigator as { userAgent?: unknown }).userAgent !== 'string'
) {
  try {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'ReactNative ExpoGL',
      configurable: true,
    });
  } catch {
    // If navigator is frozen we fall through; loader may still work.
  }
}

// GLTFLoader decodes the GLB JSON chunk with TextDecoder, which older Hermes
// runtimes don't ship. Minimal UTF-8-only implementation.
class SimpleUTF8Decoder {
  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) return '';
    const bytes =
      input instanceof Uint8Array
        ? input
        : ArrayBuffer.isView(input)
          ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
          : new Uint8Array(input);

    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i++];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        continue;
      }
      let cp = 0;
      let extra = 0;
      if ((b & 0xe0) === 0xc0) {
        cp = b & 0x1f;
        extra = 1;
      } else if ((b & 0xf0) === 0xe0) {
        cp = b & 0x0f;
        extra = 2;
      } else if ((b & 0xf8) === 0xf0) {
        cp = b & 0x07;
        extra = 3;
      } else {
        out += '�';
        continue;
      }
      while (extra-- > 0 && i < bytes.length) {
        cp = (cp << 6) | (bytes[i++] & 0x3f);
      }
      if (cp > 0xffff) {
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else {
        out += String.fromCharCode(cp);
      }
    }
    return out;
  }
}

const g = globalThis as { TextDecoder?: unknown };
if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = SimpleUTF8Decoder;
}
