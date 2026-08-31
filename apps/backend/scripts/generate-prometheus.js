#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

// Read the template file
const templatePath = path.join(__dirname, '..', 'apm', 'prometheus.yml.template');
const template = fs.readFileSync(templatePath, 'utf8');

// Replace environment variables
const result = template.replace(/\$\{([^}]+)\}/g, (match, key) => {
  return process.env[key] || '';
});

// Write the result to prometheus.yml
const outputPath = path.join(__dirname, '..', 'apm', 'prometheus.yml');
fs.writeFileSync(outputPath, result);

console.log('✅ Prometheus configuration generated successfully');
console.log(`📁 Output: ${outputPath}`);
