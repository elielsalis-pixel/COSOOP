const Auth = (() => {
  const PIN_KEY = 'cosoop_pin_hash';

  /* SHA-256 puro en JS — funciona en file://, http:// y https://
     sin depender de crypto.subtle (bloqueado en HTTP no-local en Android) */
  function sha256(str) {
    function rightRotate(val, amount) {
      return (val >>> amount) | (val << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = str.length * 8;

    let hash = [];
    let k = [];
    let primeCounter = 0;

    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    str += '\x80';
    while (str.length % 64 - 56) str += '\x00';
    for (let i = 0; i < str.length; i++) {
      const j = str.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;

    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = hash.slice(0);

      for (let i = 0; i < 64; i++) {
        const i2 = i + j - 64;
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [
          (temp1 + temp2) | 0,
          hash[0], hash[1], hash[2],
          (hash[3] + temp1) | 0,
          hash[4], hash[5], hash[6]
        ];
      }
      hash = hash.map((x, i) => (x + oldHash[i]) | 0);
    }

    hash.forEach(val => {
      for (let i = 3; i + 1; i--) {
        const b = (val >>> (i * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    });
    return result;
  }

  function hashPin(pin) {
    return sha256(pin);
  }

  function isPinSet() {
    return !!localStorage.getItem(PIN_KEY);
  }

  function savePin(pin) {
    localStorage.setItem(PIN_KEY, hashPin(pin));
  }

  function validatePin(pin) {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) return false;
    return hashPin(pin) === stored;
  }

  function clearPin() {
    localStorage.removeItem(PIN_KEY);
  }

  return { isPinSet, savePin, validatePin, clearPin };
})();
