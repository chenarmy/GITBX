import { defineStore } from 'pinia';
import { ref } from 'vue';

export type LogLevel = 'command' | 'info' | 'success' | 'warning' | 'error';

export interface ConsoleLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  command?: string;
  message: string;
  detail?: string;
}

export const useConsoleStore = defineStore('console', () => {
  const isOpen = ref<boolean>(false);
  const logs = ref<ConsoleLogEntry[]>([
    {
      id: 'init-1',
      timestamp: Date.now(),
      level: 'info',
      message: 'GITBX Git Engine initialized and ready.',
    },
  ]);
  const activeFilter = ref<'all' | 'command' | 'error'>('all');

  const addLog = (level: LogLevel, message: string, command?: string, detail?: string) => {
    const entry: ConsoleLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      level,
      command,
      message,
      detail,
    };
    logs.value.push(entry);
    if (logs.value.length > 500) {
      logs.value.shift();
    }
  };

  const logCommand = (cmd: string, output?: string) => {
    addLog('command', output || 'Executed successfully', cmd);
  };

  const logInfo = (msg: string, detail?: string) => {
    addLog('info', msg, undefined, detail);
  };

  const logSuccess = (msg: string, detail?: string) => {
    addLog('success', msg, undefined, detail);
  };

  const logWarning = (msg: string, detail?: string) => {
    addLog('warning', msg, undefined, detail);
  };

  const logError = (msg: string, detail?: string, cmd?: string) => {
    addLog('error', msg, cmd, detail);
    isOpen.value = true;
  };

  const clearLogs = () => {
    logs.value = [];
  };

  const toggleConsole = () => {
    isOpen.value = !isOpen.value;
  };

  return {
    isOpen,
    logs,
    activeFilter,
    addLog,
    logCommand,
    logInfo,
    logSuccess,
    logWarning,
    logError,
    clearLogs,
    toggleConsole,
  };
});
