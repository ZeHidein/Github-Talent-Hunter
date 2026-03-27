import * as esbuild from 'esbuild';
import { spawn, spawnSync, execSync } from 'child_process';

import { ctxConfig } from './esbuild.base.mjs';

let serverProcess = null;
let isShuttingDown = false;

const SERVER_PORT = process.env.DEV_SERVER_PORT || 8090;

// Kill any process using the specified port
const killProcessOnPort = (port) => {
  try {
    if (process.platform === 'win32') {
      // Windows: find process using netstat and taskkill
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const lines = result.split('\n').filter(line => line.includes('LISTENING'));
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) {
          console.log(`🔪 Killing process ${pid} using port ${port}...`);
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        }
      }
    } else {
      // macOS/Linux: use lsof to find and kill process
      const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
      if (result) {
        const pids = result.split('\n').filter(pid => pid);
        for (const pid of pids) {
          console.log(`🔪 Killing process ${pid} using port ${port}...`);
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        }
      }
    }
  } catch (error) {
    // No process on port or lsof/netstat not found - this is fine
    if (error.status !== 1) {
      console.log(`ℹ️  No process found on port ${port} (this is normal)`);
    }
  }
};

// Improved process cleanup function
const killServerProcess = async () => {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log('🧹 Cleaning up server processes...');
  
  // First, kill any process using the port
  killProcessOnPort(SERVER_PORT);
  
  // Then kill our tracked server process if it exists
  if (serverProcess) {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', serverProcess.pid.toString(), '/f', '/t'], {
          stdio: 'ignore',
          shell: true,
        });
      } else {
        // Try graceful shutdown first
        try {
          serverProcess.kill('SIGTERM');
        } catch {}

        // Wait a bit for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Force kill if still running
        try {
          if (serverProcess && !serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
        } catch {}
      }
    } catch (error) {
      console.error('Error killing server process:', error);
    }
    
    serverProcess = null;
  }

  // Small delay to ensure port is released
  await new Promise((resolve) => setTimeout(resolve, 2500));
  
  isShuttingDown = false;
};

const restartServerPlugin = {
  name: 'restart-server-plugin',
  setup(build) {
    build.onStart(async () => {
      console.log('⚙️ Server build started...');
      await killServerProcess();
    });

    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.error('❌ Server build failed:', result.errors);
        console.error(JSON.stringify(result.errors, null, 2));
        return;
      }

      console.log('✅ Server build finished successfully.');
      console.log('🚀 Starting server with debugger...');

      const cwd = process.cwd();
      console.log('👀 CWD:', cwd);

      serverProcess = spawn('node', ['--inspect=0.0.0.0', './build/app.js'], {
        stdio: 'inherit',
        shell: false, // Changed from true to false for better process control
        cwd,
        detached: false, // Ensure child process is tied to parent
      });

      serverProcess.on('error', (err) => {
        console.error('Failed to start server process:', err);
        serverProcess = null;
      });

      serverProcess.on('close', (code, signal) => {
        if (code !== 0 && code !== null && !isShuttingDown) {
          console.log(`Server process exited with code ${code}, signal: ${signal}`);
        }
        serverProcess = null;
      });

      serverProcess.on('exit', (code, signal) => {
        if (!isShuttingDown) {
          console.log(`Server process exited with code ${code}, signal: ${signal}`);
        }
        serverProcess = null;
      });
    });
  },
};

// Handle process termination signals to cleanup server process
const handleExit = async (signal) => {
  console.log(`\n🛑 Received ${signal}, cleaning up...`);
  await killServerProcess();
  process.exit(0);
};

process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));
process.on('SIGHUP', () => handleExit('SIGHUP'));

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await killServerProcess();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await killServerProcess();
  process.exit(1);
});

const run = async () => {
  try {
    console.log(`🚀 Starting agent-dev-server on port ${SERVER_PORT}...`);
    
    await killServerProcess();
    const ctx = await esbuild.context({
      ...ctxConfig,
      plugins: [...(ctxConfig.plugins || []), restartServerPlugin],
    });
    console.log('🔨 Building server...');
    await ctx.rebuild();

    console.log('👀 Watching server files for changes...');
    await ctx.watch();
  } catch (error) {
    console.error('❌ Server development build setup failed:', error);
    await killServerProcess();
    process.exit(1);
  }
};

run();
