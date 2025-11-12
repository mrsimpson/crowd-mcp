import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
}

export class FileLogger {
  private logPath: string;
  private component: string;

  constructor(component: string, logPath: string) {
    this.component = component;
    this.logPath = logPath;
  }

  static async create(component: string, baseDir: string = ".crowd/logs"): Promise<FileLogger> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${component}-${timestamp}.log`;
    const logPath = join(baseDir, filename);
    
    // Ensure log directory exists
    const logDir = dirname(logPath);
    if (!existsSync(logDir)) {
      await mkdir(logDir, { recursive: true });
    }

    return new FileLogger(component, logPath);
  }

  async log(level: LogLevel, message: string, data?: any): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      data
    };

    const logLine = JSON.stringify(entry) + "\n";
    
    try {
      await writeFile(this.logPath, logLine, { flag: "a" });
    } catch (error) {
      console.error(`Failed to write to log file ${this.logPath}:`, error);
    }
  }

  async debug(message: string, data?: any): Promise<void> {
    await this.log("DEBUG", message, data);
  }

  async info(message: string, data?: any): Promise<void> {
    await this.log("INFO", message, data);
  }

  async warn(message: string, data?: any): Promise<void> {
    await this.log("WARN", message, data);
  }

  async error(message: string, data?: any): Promise<void> {
    await this.log("ERROR", message, data);
  }
}
