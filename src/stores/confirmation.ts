import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  inputLabel?: string;
  defaultValue?: string;
}

interface PendingRequest {
  options: ConfirmationOptions;
  resolve: (value: boolean | string | null) => void;
}

export const useConfirmationStore = defineStore('confirmation', () => {
  const pending = ref<PendingRequest | null>(null);

  const open = (options: ConfirmationOptions) => new Promise<boolean | string | null>((resolve) => {
    pending.value = { options, resolve };
  });

  const confirm = async (options: ConfirmationOptions): Promise<boolean> => {
    const result = await open(options);
    return result === true;
  };

  const prompt = async (options: ConfirmationOptions): Promise<string | null> => {
    const result = await open({ ...options, inputLabel: options.inputLabel || 'Value' });
    return typeof result === 'string' ? result : null;
  };

  const resolve = (value: boolean | string | null) => {
    const request = pending.value;
    pending.value = null;
    request?.resolve(value);
  };

  return { pending, confirm, prompt, resolve };
});
