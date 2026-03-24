const fs = require('fs');
const path = require('path');

function isUnsetEnvValue(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return !normalized || normalized === 'CHANGE_ME' || normalized === 'CHANGEME' || normalized === 'TODO';
}

function readConfiguredEnvValue(key) {
  const raw = process.env[key];
  return isUnsetEnvValue(raw) ? '' : String(raw).trim();
}

const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = String(process.env.SESSION_SECRET || (!isProduction ? 'agropluse_dev_secret_change_me' : '')).trim();
const adminUsername = readConfiguredEnvValue('ADMIN_USERNAME');
const adminPassword = readConfiguredEnvValue('ADMIN_PASSWORD');
const knownInsecureAdminUsername = 'mercedes133';
const knownInsecureAdminPassword = 'Dacosta133@';
const paystackSecretKey = readConfiguredEnvValue('PAYSTACK_SECRET_KEY');
const paystackPublicKey = readConfiguredEnvValue('PAYSTACK_PUBLIC_KEY');
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS || 12);
const databasePath = process.env.DATABASE_PATH || './users.db';
const resolvedDatabasePath = path.isAbsolute(databasePath) ? databasePath : path.resolve(process.cwd(), databasePath);
const dataDirectory = path.dirname(resolvedDatabasePath);

const errors = [];
const warnings = [];

if (!sessionSecret) {
  errors.push('SESSION_SECRET is required.');
}

if (isProduction && sessionSecret.length < 32) {
  errors.push('SESSION_SECRET must be at least 32 characters in production.');
}

if (!adminUsername || !adminPassword) {
  warnings.push('ADMIN_USERNAME and ADMIN_PASSWORD are not configured. Admin routes will remain disabled.');
}

if (adminUsername === knownInsecureAdminUsername && adminPassword === knownInsecureAdminPassword) {
  errors.push('Known insecure admin credentials are configured. Set unique values for ADMIN_USERNAME and ADMIN_PASSWORD.');
}

if (isProduction && !paystackSecretKey) {
  warnings.push('PAYSTACK_SECRET_KEY is not set. Payment initiation endpoints will be unavailable.');
}

if (paystackPublicKey && !paystackSecretKey) {
  warnings.push('PAYSTACK_PUBLIC_KEY is set without PAYSTACK_SECRET_KEY. Configure both keys together.');
}

if (bcryptRounds < 10) {
  warnings.push('BCRYPT_ROUNDS is below 10. Increase to at least 10.');
}

try {
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.accessSync(dataDirectory, fs.constants.R_OK | fs.constants.W_OK);
} catch (error) {
  errors.push(`DATA_DIRECTORY is not writable: ${dataDirectory}`);
}

console.log('Startup check report');
console.log(`- Mode: ${isProduction ? 'production' : 'development'}`);
console.log(`- Database: ${resolvedDatabasePath}`);

if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach((warning, index) => {
    console.log(`  ${index + 1}. ${warning}`);
  });
}

if (errors.length) {
  console.error('Errors:');
  errors.forEach((error, index) => {
    console.error(`  ${index + 1}. ${error}`);
  });
  process.exit(1);
}

console.log('Result: PASS');
process.exit(0);
