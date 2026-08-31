#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up NestJS Boilerplate...');
console.log(`⏰ Script executed at: ${new Date().toISOString()}`);

// Get the project root directory (one level up from scripts/)
const projectRoot = path.join(__dirname, '..');
const envExamplePath = path.join(projectRoot, '.env.example');
const envPath = path.join(projectRoot, '.env');

// Check if .env.example exists
if (!fs.existsSync(envExamplePath)) {
  console.log('❌ .env.example file not found!');
  console.log(`Looking for: ${envExamplePath}`);
  process.exit(1);
}

// Check for force flag
const force = process.argv.includes('--force') || process.argv.includes('-f');

// Always check if .env needs to be created or updated
const envExists = fs.existsSync(envPath);
let envCreated = false;

if (!envExists || force) {
  if (envExists && force) {
    console.log('🔄 Force recreating .env file...');
  }
  fs.copyFileSync(envExamplePath, envPath);
  envCreated = true;
  console.log('✅ Environment file created from .env.example');
} else {
  // Check if .env is different from .env.example
  const envContent = fs.readFileSync(envPath, 'utf8');
  const exampleContent = fs.readFileSync(envExamplePath, 'utf8');

  if (envContent !== exampleContent) {
    // .env exists but is different from .env.example
    console.log('⚠️  .env file already exists and differs from .env.example');
    console.log('   To recreate .env from .env.example, run: pnpm setup --force');
  } else {
    console.log('✅ .env file is up to date with .env.example');
  }
}

console.log('🎉 Setup complete!');
console.log('');
console.log('Next steps:');
console.log('1. Review and update .env file with your configuration');
console.log("2. Run 'pnpm install' to install dependencies");
console.log("3. Run 'pnpm local:up' to start all services");
