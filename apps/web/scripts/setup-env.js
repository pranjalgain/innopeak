#!/usr/bin/env node

/**
 * Environment Setup Script
 *
 * This script helps developers quickly set up their environment
 * by copying the appropriate template and providing guidance.
 */

const fs = require("fs");
const path = require("path");

const ENV_FILE = ".env";
const ENV_EXAMPLE = ".env.example";
const ENV_DEVELOPMENT = ".env.development";

console.log("🚀 Setting up your environment...\n");

// Check if .env already exists
if (fs.existsSync(ENV_FILE)) {
  console.log("✅ .env file already exists");
  console.log("   If you need to reset it, delete .env and run this script again\n");
  process.exit(0);
}

// Check which template files exist
const hasExample = fs.existsSync(ENV_EXAMPLE);
const hasDevelopment = fs.existsSync(ENV_DEVELOPMENT);

if (!hasExample && !hasDevelopment) {
  console.log("❌ No environment template files found");
  console.log("   Expected .env.example or .env.development");
  process.exit(1);
}

// Choose the best template
let templateFile;
let setupType;

if (hasDevelopment) {
  templateFile = ENV_DEVELOPMENT;
  setupType = "development";
  console.log("📋 Using development template (ready to use, no setup required)");
} else {
  templateFile = ENV_EXAMPLE;
  setupType = "example";
  console.log("📋 Using example template (requires configuration)");
}

// Copy the template
try {
  fs.copyFileSync(templateFile, ENV_FILE);
  console.log(`✅ Created .env from ${templateFile}\n`);
} catch (error) {
  console.log(`❌ Failed to create .env file: ${error.message}`);
  process.exit(1);
}

// Provide next steps based on setup type
if (setupType === "development") {
  console.log("🎉 You're ready to go!");
  console.log("   Your .env file has working defaults for development");
  console.log("   No external services required\n");
  console.log("📝 Next steps:");
  console.log("   1. Run: pnpm dev");
  console.log("   2. Open: http://localhost:3000");
  console.log("   3. Start building! 🚀\n");
  console.log("💡 Optional: To enable analytics, edit .env and add your API keys");
} else {
  console.log("📝 Next steps:");
  console.log("   1. Edit .env and fill in your values");
  console.log("   2. For quick start, keep the SQLite defaults");
  console.log("   3. For full features, sign up for PostHog and Sentry");
  console.log("   4. Run: pnpm dev\n");
  console.log("💡 See .env for detailed setup instructions");
}

console.log("\n📚 Documentation:");
console.log("   README.md - Full setup guide");
console.log("   .env.example - All available options");
console.log("   .env.development - Development defaults");
