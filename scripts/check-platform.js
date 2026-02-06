#!/usr/bin/env node

/**
 * Platform Check Script
 *
 * This script checks if the current platform is compatible with Claude Code SDK.
 * It provides helpful error messages for Windows users who need to use WSL.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

const platform = os.platform();
const isWindows = platform === 'win32';

// Check if we're running in WSL
function isWSL() {
  if (platform !== 'linux') {
    return false;
  }

  // Check for WSL-specific indicators
  try {
    const procVersion = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return procVersion.includes('microsoft') || procVersion.includes('wsl');
  } catch (error) {
    return false;
  }
}

function checkPlatform() {
  console.log('🔍 Checking platform compatibility...\n');

  if (isWindows) {
    console.error('❌ ERROR: Native Windows is not supported\n');
    console.error('The Claude Code SDK requires a Unix-like environment and cannot run on native Windows.');
    console.error('');
    console.error('📖 Solution: Use Windows Subsystem for Linux (WSL)');
    console.error('');
    console.error('Quick Start:');
    console.error('  1. Open PowerShell as Administrator');
    console.error('  2. Run: wsl --install');
    console.error('  3. Restart your computer');
    console.error('  4. Open WSL terminal and navigate to this project');
    console.error('  5. Run npm install from WSL terminal');
    console.error('');
    console.error('📚 For detailed instructions, see: WINDOWS.md');
    console.error('   https://github.com/yourusername/claude-code-slack-bot/blob/main/WINDOWS.md');
    console.error('');
    process.exit(1);
  }

  if (isWSL()) {
    console.log('✅ Running on WSL - Compatible!');
    console.log(`   Distribution: ${os.release()}`);
    console.log(`   Node.js: ${process.version}`);
  } else if (platform === 'darwin') {
    console.log('✅ Running on macOS - Compatible!');
    console.log(`   Version: ${os.release()}`);
    console.log(`   Node.js: ${process.version}`);
  } else if (platform === 'linux') {
    console.log('✅ Running on Linux - Compatible!');
    console.log(`   Distribution: ${os.release()}`);
    console.log(`   Node.js: ${process.version}`);
  } else {
    console.warn(`⚠️  Unknown platform: ${platform}`);
    console.warn('   Claude Code officially supports macOS, Linux, and WSL');
    console.warn('   Continuing anyway, but you may encounter issues...');
  }

  console.log('');
}

// Run the check
try {
  checkPlatform();
} catch (error) {
  console.error('Error checking platform:', error.message);
  process.exit(1);
}
