const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);
const PREFIX = 'scrypt';
const SALT_LEN = 16;
const KEY_LEN = 64;

const hashPassword = async (plain) => {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex');
  const key = await scryptAsync(plain, salt, KEY_LEN);
  return `${PREFIX}$${salt}$${key.toString('hex')}`;
};

const verifyPassword = async (plain, stored) => {
  if (!stored || typeof stored !== 'string') return false;
  const [prefix, salt, storedKey] = stored.split('$');
  if (prefix !== PREFIX || !salt || !storedKey) return plain === stored;
  const key = await scryptAsync(plain, salt, KEY_LEN);
  const storedBuf = Buffer.from(storedKey, 'hex');
  if (storedBuf.length !== key.length) return false;
  return crypto.timingSafeEqual(storedBuf, key);
};

const needsRehash = (stored) =>
  typeof stored === 'string' && !stored.startsWith(`${PREFIX}$`);

module.exports = { hashPassword, verifyPassword, needsRehash };
