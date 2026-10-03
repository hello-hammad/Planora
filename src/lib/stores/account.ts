import { writable } from 'svelte/store';

export interface Account { id: string; name: string; email: string }

/** The signed-in user (set from the server on every page load), or null. */
export const account = writable<Account | null>(null);
