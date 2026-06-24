const { hashPassword } = require("../server");

const password = process.argv[2];

if (!password || password.length < 8) {
  console.error("Usage: npm run hash-admin -- your-secure-password");
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const { salt, hash } = hashPassword(password);
console.log(`ADMIN_PASSWORD_SALT=${salt}`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
