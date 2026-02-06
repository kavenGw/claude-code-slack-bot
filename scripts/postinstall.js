#!/usr/bin/env node

/**
 * Post-install script
 * Displays helpful information after successful installation
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

const platform = os.platform();

// Check if we're running in WSL
function isWSL() {
  if (platform !== 'linux') {
    return false;
  }
  try {
    const procVersion = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return procVersion.includes('microsoft') || procVersion.includes('wsl');
  } catch (error) {
    return false;
  }
}

console.log('\n✅ Installation completed successfully!\n');

// Platform-specific messages
if (platform === 'win32') {
  console.log('⚠️  WARNING: You are on Windows');
  console.log('   Native Windows is not supported by Claude Code SDK.');
  console.log('   Please use WSL to run this project.');
  console.log('   See WINDOWS.md for instructions.\n');
} else if (isWSL()) {
  console.log('✅ Running on WSL - Perfect!\n');
} else if (platform === 'darwin') {
  console.log('✅ Running on macOS - Perfect!\n');
} else if (platform === 'linux') {
  console.log('✅ Running on Linux - Perfect!\n');
}

// Check for .env file
const envPath = path.join(process.cwd(), '.env');
const envExamplePath = path.join(process.cwd(), '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('⚠️  Environment configuration needed:');

  if (fs.existsSync(envExamplePath)) {
    console.log('   Run: cp .env.example .env');
  } else {
    console.log('   Create a .env file with your configuration');
  }

  console.log('   Then edit .env with your Slack and Anthropic credentials\n');
}

// Next steps
console.log('📖 Next steps:');
console.log('   1. Configure your .env file (see INSTALL.md)');
console.log('   2. Set up your Slack app (see README.md)');
console.log('   3. Run: npm run dev');
console.log('');
console.log('📚 Documentation:');
console.log('   • Installation: INSTALL.md');
console.log('   • Usage: README.md');
console.log('   • Windows: WINDOWS.md');
console.log('   • Project Info: CLAUDE.md');
console.log('');
console.log('❓ Need help?');
console.log('   • Platform check: node scripts/check-platform.js');
console.log('   • Issues: https://github.com/yourusername/claude-code-slack-bot/issues');
console.log('');
