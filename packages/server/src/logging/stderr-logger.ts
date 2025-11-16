/**
 * Stderr Logger for Host MCP Server
 * 
 * Uses stderr for logging to avoid interfering with MCP JSON-RPC protocol on stdout.
 * Safe to use during startup and throughout the MCP server lifecycle.
 */
export class StderrLogger {
  constructor(private component: string) {}

  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] [${this.component}] ${message}`;
    
    if (args.length > 0) {
      process.stderr.write(logMessage + ' ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ') + '\n');
    } else {
      process.stderr.write(logMessage + '\n');
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log('DEBUG', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('INFO', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('WARN', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('ERROR', message, ...args);
  }
}
